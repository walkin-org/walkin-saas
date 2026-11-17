import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { DatabaseSync } from 'node:sqlite';
import { tmpdir } from 'node:os';
import path from 'node:path';
import net from 'node:net';
import {createHash,randomBytes,scryptSync} from 'node:crypto';

test('local storefronts and photos survive a server restart', async () => {
  const directory = await mkdtemp(path.join(tmpdir(), 'walkin-test-'));
  const photo = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/l9sAAAAASUVORK5CYII=';
  const legacy = new DatabaseSync(path.join(directory,'walkin.sqlite'));
  legacy.exec("CREATE TABLE storefronts (id TEXT PRIMARY KEY,name TEXT,market TEXT,landmark TEXT,created TEXT,mime TEXT,archived INTEGER DEFAULT 0)");
  legacy.exec("INSERT INTO storefronts VALUES ('legacy','Old shop','Market','','2025-01-01','image/png',1)");
  const admin = { email:'admin@example.com', password:'integration-admin-password' };
  const oldToken = randomBytes(24).toString('base64url');
  legacy.exec(`CREATE TABLE accounts (email TEXT PRIMARY KEY, role TEXT, hash TEXT, temporary INTEGER, expires TEXT, delivery TEXT, disabled INTEGER);
    CREATE TABLE mobile_sessions (token_hash TEXT PRIMARY KEY,email TEXT REFERENCES accounts(email),expires TEXT);
    ALTER TABLE storefronts ADD COLUMN owner TEXT;`);
  const insertLegacy = legacy.prepare("INSERT INTO accounts VALUES (?,?,?,0,'','',0)");
  const salt = randomBytes(24).toString('hex');
  insertLegacy.run(admin.email,'admin',salt+':'+scryptSync(admin.password,salt,64).toString('hex'));
  insertLegacy.run('legacy@example.test','consumer',salt+':'+scryptSync('legacy-test-password',salt,64).toString('hex'));
  legacy.prepare('UPDATE storefronts SET owner=? WHERE id=?').run(admin.email,'legacy');
  legacy.prepare('INSERT INTO mobile_sessions VALUES (?,?,?)').run(createHash('sha256').update(oldToken).digest('hex'),'legacy@example.test',new Date(Date.now()+3600000).toISOString());
  legacy.close();
  await mkdir(path.join(directory,'photos'));
  await writeFile(path.join(directory,'photos','legacy'),Buffer.from(photo,'base64'));
  let child;
  let mailBody = '';
  function invitationPassword() {
    const decoded = mailBody.replace(/=\n/g, '').replace(/=([0-9a-f]{2})/gi, (_, hex) => String.fromCharCode(parseInt(hex,16)));
    return /Temporary password: ([\w-]+)/.exec(decoded)[1];
  }
  const smtp = net.createServer(socket => {
    socket.setEncoding('utf8');
    socket.write('220 localhost test relay\r\n');
    let buffer = '';
    let receiving = false;
    socket.on('data', chunk => {
      buffer += chunk;
      while (buffer.includes('\r\n')) {
        const index = buffer.indexOf('\r\n');
        const line = buffer.slice(0,index);
        buffer = buffer.slice(index+2);
        if (receiving && line !== '.') { mailBody += line+'\n'; continue; }
        if (line === 'DATA') {
          mailBody = '';
          receiving = true;
          socket.write('354 Send body\r\n');
        } else if (line === 'QUIT') socket.end('221 Bye\r\n');
        else {
          receiving = false;
          socket.write('250 OK\r\n');
        }
      }
    });
  });
  smtp.listen(0,'127.0.0.1');
  await once(smtp,'listening');
  async function start() {
    child = spawn(process.execPath, ['server.js'], {
      env: { ...process.env, PORT: '0', DATA_DIR: directory, DATABASE_URL: '', S3_BUCKET: '', S3_ENDPOINT: '',
        ADMIN_EMAIL:admin.email, ADMIN_PASSWORD:admin.password, SMTP_HOST:'127.0.0.1', SMTP_PORT:String(smtp.address().port),
        SMTP_USER:'', MAIL_FROM:'studio@example.com', APP_URL:'http://localhost:3000' },
      stdio: ['ignore', 'pipe', 'inherit']
    });
    const [line] = await Promise.race([
      once(child.stdout, 'data'),
      once(child, 'exit').then(() => { throw new Error('Server exited during startup'); })
    ]);
    return String(line).trim().split(' ').pop();
  }
  async function stop() {
    if (!child || child.exitCode !== null) return;
    const done = once(child, 'exit');
    child.kill();
    await done;
    child = undefined;
  }
  try {
    let url = await start();
    const database = new DatabaseSync(path.join(directory,'walkin.sqlite'),{readOnly:true});
    assert.equal(Buffer.from(database.prepare("SELECT photo_bytes FROM storefronts WHERE id='legacy'").get().photo_bytes).toString('base64'),photo);
    const migratedAdmin = database.prepare('SELECT id,created_at FROM users WHERE email=?').get(admin.email);
    assert.ok(migratedAdmin.id);
    assert.equal(migratedAdmin.created_at,null);
    assert.equal(database.prepare("SELECT owner_user_id FROM storefronts WHERE id='legacy'").get().owner_user_id,migratedAdmin.id);
    assert.deepEqual(database.prepare('PRAGMA foreign_key_check').all(),[]);
    const migratedProfile = await fetch(url+'/api/mobile/me',{headers:{Authorization:'Bearer '+oldToken}});
    assert.equal(migratedProfile.status,200);
    assert.equal((await migratedProfile.json()).email,'legacy@example.test');
    database.close();
    assert.match(await (await fetch(url)).text(), /dist\/app\.js/);
    const routeHeadings = {
      '/':'Sign in', '/admin':'Backend overview', '/admin/logs':'Request log', '/admin/collectors':'Collectors',
      '/admin/catalog':'Storefront catalog', '/collector':'My storefronts', '/collector/new':'Record a storefront',
      '/admin.html':'Backend overview','/collector.html':'My storefronts'
    };
    for (const [path,title] of Object.entries(routeHeadings)) {
      const page = await fetch(url + path);
      assert.equal(page.status,200);
      const initial = await page.text();
      assert.ok(initial.includes('<h1>'+title+'</h1>'),path);
      assert.ok(initial.includes('<span role="status"'),path);
    }
    for (const asset of ['/studio.css','/dist/app.js','/api/health']) assert.equal((await fetch(url + asset)).status,200);
    let cookie = '';
    const send = (route,body) => fetch(url+'/api/'+route, {
      method:'POST',headers:{'Content-Type':'application/json',cookie}, body:JSON.stringify(body)
    });
    const get = route => fetch(url+'/api/'+route,{ headers:{cookie} });
    const mutate = (route,method,body) => fetch(url+'/api/'+route,{method,headers:{cookie,'Content-Type':'application/json'},body:JSON.stringify(body)});
    const post = body => send('storefronts',body);
    const authenticate = async credentials => {
      const login = await send('login',credentials);
      assert.equal(login.status,200);
      cookie = login.headers.get('set-cookie').split(';')[0];
    };
    assert.equal((await get('storefronts')).status,401);
    await authenticate(admin);
    assert.equal((await get('admin/overview')).status,200);
    const email = 'collector@example.com';
    assert.equal((await send('admin/collectors',{email})).status,201);
    assert.equal((await send('admin/collectors',{email})).status,409);
    assert.match(mailBody,/Login ID: collector@example.com/);
    const temporary = invitationPassword();
    const collector = {email,password:'new-collector-password'};
    await authenticate({email,password:temporary});
    assert.equal((await get('storefronts')).status,403);
    const changed = await send('password',{password:collector.password});
    assert.equal(changed.status,204);
    cookie = changed.headers.get('set-cookie').split(';')[0];
    assert.equal((await get('admin/overview')).status,403);
    assert.equal((await send('admin/collectors',{email:'another@example.com'})).status,403);
    const consumer = {email:'android@example.test',password:'consumer-test-password'};
    const registered = await send('mobile/register',{...consumer,displayName:'Market visitor',role:'admin'});
    assert.equal(registered.status,201);
    const userId = (await registered.json()).id;
    assert.ok(userId);
    assert.equal((await send('login',consumer)).status,401);
    assert.equal((await send('mobile/login',admin)).status,401);
    const session = await (await send('mobile/login',consumer)).json();
    assert.ok(session.accessToken);
    const bearer = {Authorization:'Bearer '+session.accessToken};
    const mobile = path => fetch(url+'/api/mobile/'+path,{headers:bearer});
    assert.deepEqual(await (await mobile('me')).json(),{id:userId,email:consumer.email,displayName:'Market visitor',role:'consumer',temporary:false});
    assert.equal((await get('mobile/storefronts')).status,401);
    assert.equal((await fetch(url+'/api/admin/collectors',{headers:bearer})).status,401);
    const saved = await post({ name: ' Store ', market: 'Bazaar', photo });
    assert.equal(saved.status, 201);
    const row = await saved.json();
    assert.equal(row.owner_user_id,(await (await get('me')).json()).id);
    assert.equal(row.name, 'Store');
    const route = 'storefronts/'+row.id;
    assert.equal((await get(route)).status,200);
    assert.equal((await mutate(route,'PUT',{name:'Corner Store',market:'Market',landmark:'Fountain'})).status,200);
    assert.equal((await (await get('storefronts?q=fountain')).json())[0].name,'Corner Store');
    assert.deepEqual(await (await get('storefronts?q=missing')).json(),[]);
    assert.equal((await post({ name: ' ', market: 'Bazaar' })).status, 400);
    assert.equal((await post({ name: 'Store', market: 'Bazaar', photo: 'YmFk' })).status, 400);
    assert.equal((await post({ name: 'Other', market: 'Bazaar' })).status, 201);
    await stop();
    url = await start();
    await authenticate(collector);
    assert.equal((await (await get('storefronts')).json()).length, 2);
    const feed = await (await mobile('storefronts?limit=1')).json();
    assert.equal(feed.items.length,1);
    assert.equal(feed.nextOffset,1);
    const record = await (await mobile(route)).json();
    assert.equal(record.name,'Corner Store');
    assert.deepEqual(Object.keys(record).sort(),['id','name','market','landmark','created','photoUrl'].sort());
    assert.equal(Buffer.from(await (await fetch(url+record.photoUrl,{headers:bearer})).arrayBuffer()).toString('base64'),photo);
    assert.equal((await mobile('storefronts?limit=0')).status,400);
    const image = await get('storefronts/' + row.id + '/photo');
    assert.equal(image.headers.get('content-type'), 'image/png');
    assert.equal(Buffer.from(await image.arrayBuffer()).toString('base64'), photo);
    await authenticate(admin);
    const secondEmail = 'other@example.com';
    assert.equal((await send('admin/collectors',{email:secondEmail})).status,201);
    await authenticate({email:secondEmail,password:invitationPassword()});
    const second = await send('password',{password:'another-collector-password'});
    cookie = second.headers.get('set-cookie').split(';')[0];
    assert.deepEqual(await (await get('storefronts')).json(),[]);
    assert.equal((await get('storefronts/'+row.id+'/photo')).status,404);
    assert.equal((await mutate(route,'DELETE')).status,404);
    assert.equal((await mutate(route,'PUT',{name:'x',market:'y'})).status,404);
    assert.equal((await send('logout',{})).status,204);
    assert.equal((await get('me')).status,401);
    await authenticate(admin);
    assert.ok((await (await get('admin/logs?errors=true')).json()).some(entry => entry.status === 404));
    const member = 'admin/collectors/'+encodeURIComponent(email);
    assert.equal((await mutate(member,'PATCH',{disabled:true})).status,200);
    assert.equal((await send('login',collector)).status,401);
    assert.equal((await mutate(member,'PATCH',{disabled:false})).status,200);
    await authenticate(collector);
    const roadDefinition = {market:'Market',area_type:'business_market',name:'Main Lane',start_label:'Gate',end_label:'Tower',length_m:60};
    const roadResponse = await send('roads',roadDefinition);
    assert.equal(roadResponse.status,201);
    const road = await roadResponse.json();
    assert.equal((await send('roads',roadDefinition)).status,409);
    const placement = {roadId:road.id,side:'left',offsetM:4,frontageM:8};
    const placed = {name:'Corner Store',market:'Market',placement};
    assert.equal((await mutate(route,'PUT',placed)).status,200);
    assert.equal((await post({...placed,placement:{...placement,offsetM:59}})).status,400);
    assert.equal((await post({...placed,market:'Wrong market'})).status,400);
    assert.equal((await post({...placed,placement:{...placement,side:'other'}})).status,400);
    assert.equal((await post({...placed,name:'Left entry',placement:{...placement,offsetM:0,frontageM:3}})).status,201);
    assert.equal((await post({...placed,name:'Right shop',photo,placement:{...placement,side:'right'}})).status,201);
    assert.ok((await (await mobile('roads')).json()).some(r => r.id===road.id));
    const roadMap = async () => (await mobile('roads/'+road.id+'/map')).json();
    const map = await roadMap();
    assert.deepEqual(map.left.map(r => r.offsetM),[0,4]);
    assert.deepEqual(map.right.map(r => r.name),['Right shop']);
    assert.equal(map.left[1].frontageM,8);
    assert.equal(Buffer.from(await (await fetch(url+map.left[1].facadeUrl,{headers:bearer})).arrayBuffer()).toString('base64'),photo);
    assert.equal((await mutate(route,'DELETE')).status,204);
    assert.deepEqual((await roadMap()).left.map(r => r.offsetM),[0]);
    assert.equal((await get(route)).status,404);
    assert.equal((await get(route+'/photo')).status,404);
    assert.equal((await mobile(route)).status,404);
    assert.equal((await mobile(route+'/photo')).status,404);
    assert.equal((await fetch(url+'/api/mobile/logout',{method:'POST',headers:{...bearer,'Content-Type':'application/json'},body:'{}'})).status,204);
    assert.equal((await mobile('storefronts')).status,401);
  } finally {
    await stop();
    smtp.close();
    await rm(directory, { recursive: true, force: true });
  }
});
