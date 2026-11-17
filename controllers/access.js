import { createHash, randomBytes, randomUUID, scrypt, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import { createMailer } from '../config/mail.js';
import { requireSession } from '../middlewares/access.js';

const derive = promisify(scrypt);
const token = () => randomBytes(24).toString('base64url');
const emailPattern = /^[a-z0-9._%+-]+@[a-z0-9-]+(?:\.[a-z0-9-]+)+$/i;
const validEmail = value => typeof value === 'string' && value.length <= 254 && emailPattern.test(value);
const validPassword = value => typeof value === 'string' && value.length >= 12 && value.length <= 256;
async function hash(password, salt = token()) {
  return salt + ':' + (await derive(password, salt, 64)).toString('hex');
}
const fail = (res, status, error) => res.status(status).json({ error });

export async function accessController(db) {
  const env = process.env;
  const account = async email => (await db.run('SELECT * FROM users WHERE email=$1', [email]))[0];
  if (!(await db.run("SELECT email FROM users WHERE role='admin' LIMIT 1", [])).length) {
    const email = env.ADMIN_EMAIL?.trim().toLowerCase();
    if (!validEmail(email) || !validPassword(env.ADMIN_PASSWORD)) {
      console.warn('First sign-in requires ADMIN_EMAIL and ADMIN_PASSWORD (12–256 characters) in .env. Restart after setting them.');
    } else {
      await db.run("INSERT INTO users (email,role,hash,temporary,expires,delivery,id,created_at) VALUES ($1,'admin',$2,0,'','',$3,$4) ON CONFLICT(email) DO NOTHING", [email, await hash(env.ADMIN_PASSWORD),randomUUID(),new Date().toISOString()]);
    }
  }
  const dummy = await hash(token());
  const sessions = new Map();
  const attempts = new Map();
  const options = { httpOnly: true, sameSite: 'strict', secure: env.APP_URL?.startsWith('https://') || false, path: '/' };
  const ttl = 8 * 3600000;
  setInterval(() => {
    for (const entries of [sessions, attempts]) {
      for (const [key, item] of entries) if (item.until <= Date.now()) entries.delete(key);
    }
  }, 60000).unref();
  const cookie = req => /(?:^|;\s*)walkin_sid=([\w-]+)(?:;|$)/.exec(req.headers.cookie || '')?.[1];
  function issue(req, res, user) {
    sessions.delete(cookie(req));
    const key = token();
    sessions.set(key, { email: user.email, hash: user.hash, until: Date.now() + ttl });
    res.cookie('walkin_sid', key, { ...options, maxAge: ttl });
  }
  const identity = user => ({ id:user.id, displayName:user.display_name, email: user.email, role: user.role, temporary: Boolean(user.temporary) });
  const mail = createMailer(env);
  const digest = value => createHash('sha256').update(value).digest('hex');
  function allowAttempt(key) {
      let bucket = attempts.get(key);
      if (!bucket || bucket.until <= Date.now()) {
        bucket = { count: 0, until: Date.now() + 600000 };
        attempts.set(key, bucket);
      }
      if (bucket.count >= 25) return false;
      bucket.count++;
      return true;
  }
  async function signIn(req,res,mobile) {
      const email = String(req.body?.email || '').trim().toLowerCase();
      const password = req.body?.password;
      const key = (mobile ? 'mobile:' : 'staff:')+req.ip;
      if (!allowAttempt(key)) return fail(res,429,'Too many attempts. Try again in ten minutes.');
      const user = validEmail(email) ? await account(email) : null;
      const expected = user?.hash || dummy;
      const candidate = await hash(typeof password === 'string' && password.length <= 256 ? password : '', expected.split(':')[0]);
      if (!timingSafeEqual(Buffer.from(candidate),Buffer.from(expected)) || !user || (user.role === 'consumer') !== mobile || user.disabled || (user.temporary && user.expires <= new Date().toISOString())) {
        return fail(res,401,'Incorrect credentials or expired invitation.');
      }
      attempts.delete(key);
      if (mobile) {
        const accessToken = token();
        const expiresAt = new Date(Date.now()+30*86400000).toISOString();
        await db.run('DELETE FROM mobile_sessions WHERE expires <= $1',[new Date().toISOString()]);
        await db.run('INSERT INTO mobile_sessions (token_hash,user_id,expires) VALUES ($1,$2,$3)',[digest(accessToken),user.id,expiresAt]);
        return res.json({accessToken,expiresAt});
      }
      issue(req,res,user);
      res.json(identity(user));
  }
  return {
    authenticate: requireSession({ sessions, cookie, account }),
    me: (req,res) => res.json(identity(req.user)),
    listCollectors: async (_req,res) => res.json(await db.run("SELECT id,email,display_name,temporary,expires,delivery,disabled FROM users WHERE role='collector' ORDER BY email",[])),
    login: (req,res) => signIn(req,res,false),
    mobileLogin: (req,res) => signIn(req,res,true),
    async registerConsumer(req,res) {
      if (!allowAttempt('register:'+req.ip)) return fail(res,429,'Too many attempts. Try again in ten minutes.');
      const email = String(req.body?.email || '').trim().toLowerCase();
      if (!validEmail(email) || !validPassword(req.body?.password)) return fail(res,400,'Provide an email and a password of 12–256 characters.');
      const displayName = req.body?.displayName;
      if (displayName != null && (typeof displayName !== 'string' || !displayName.trim() || displayName.trim().length > 120)) {
        return fail(res,400,'Display name must contain 1–120 characters.');
      }
      const rows = await db.run("INSERT INTO users (email,role,hash,id,display_name,created_at) VALUES ($1,'consumer',$2,$3,$4,$5) ON CONFLICT(email) DO NOTHING RETURNING id,email",
        [email,await hash(req.body.password),randomUUID(),displayName?.trim() ?? null,new Date().toISOString()]);
      if (!rows.length) return fail(res,409,'Email unavailable.');
      res.status(201).json(rows[0]);
    },
    async authenticateMobile(req,res,next) {
      const bearer = /^Bearer ([A-Za-z0-9_-]{32})$/i.exec(req.get('Authorization') || '');
      if (bearer) {
        req.tokenHash = digest(bearer[1]);
        const rows = await db.run(`SELECT a.id,a.email,a.display_name,a.role FROM users a JOIN mobile_sessions s ON s.user_id=a.id
          WHERE s.token_hash=$1 AND s.expires>$2 AND a.role='consumer' AND a.disabled=0`,[req.tokenHash,new Date().toISOString()]);
        if (rows.length) { req.user = rows[0]; return next(); }
      }
      return fail(res,401,'Sign in to the app.');
    },
    async mobileLogout(req,res) {
      await db.run('DELETE FROM mobile_sessions WHERE token_hash=$1',[req.tokenHash]);
      res.sendStatus(204);
    },
    async logout(req,res) {
      sessions.delete(cookie(req));
      res.clearCookie('walkin_sid', options).sendStatus(204);
    },
    async password(req,res) {
      if (!req.user.temporary || !validPassword(req.body?.password)) return fail(res,400,'Choose a new password of 12–256 characters.');
      if (await hash(req.body.password,req.user.hash.split(':')[0]) === req.user.hash) return fail(res,400,'Choose a different password.');
      const nextHash = await hash(req.body.password);
      const updated = await db.run("UPDATE users SET hash=$1,temporary=0,expires='' WHERE email=$2 AND hash=$3 RETURNING email",[nextHash,req.user.email,req.user.hash]);
      if (!updated.length) return fail(res,409,'Sign in again.');
      issue(req,res,{ ...req.user, hash: nextHash });
      res.sendStatus(204);
    },
    async updateCollector(req,res) {
      const email = req.params.email.toLowerCase();
      if (typeof req.body?.disabled !== 'boolean') return fail(res,400,'Provide a boolean disabled value.');
      const updated = await db.run("UPDATE users SET disabled=$1 WHERE email=$2 AND role='collector' RETURNING email,disabled",[Number(req.body.disabled),email]);
      if (!updated.length) return fail(res,404,'Collector not found.');
      if (req.body.disabled) for (const [key, session] of sessions) {
        if (session.email === email) sessions.delete(key);
      }
      res.json(updated[0]);
    },
    async invite(req,res) {
      const email = String(req.body?.email || '').trim().toLowerCase();
      if (!validEmail(email)) return fail(res,400,'Enter one valid email address.');
      if (!mail || !env.APP_URL) return fail(res,503,'Set SMTP_HOST, MAIL_FROM and APP_URL to send invitations.');
      const password = token();
      const credential = await hash(password);
      const expires = new Date(Date.now()+86400000).toISOString();
      const now = new Date().toISOString();
      const claimed = await db.run(`INSERT INTO users (email,role,hash,temporary,expires,delivery,id,created_at)
        VALUES ($1,'collector',$2,1,$3,'sending',$4,$5) ON CONFLICT(email) DO UPDATE SET
        hash=excluded.hash, expires=excluded.expires, delivery='sending'
        WHERE users.role='collector' AND users.disabled=0 AND users.temporary=1 AND (users.delivery='failed' OR users.expires <= $6)
        RETURNING email`,[email,credential,expires,randomUUID(),now,now]);
      if (!claimed.length) return fail(res,409,'An active account or current invitation already exists.');
      try {
        await mail.sendMail({ from: env.MAIL_FROM, to: email, subject: 'Your Walkin collector account',
          text: ['Sign in to Walkin to record storefronts.',env.APP_URL,'Login ID: '+email,'Temporary password: '+password,'This password expires in 24 hours. Choose your own password on first sign-in.'].join('\n') });
      } catch {
        await db.run("UPDATE users SET delivery='failed', expires=$1 WHERE email=$2 AND hash=$3",[now,email,credential]);
        return fail(res,502,'Email delivery failed. Check SMTP settings and retry the invitation.');
      }
      await db.run("UPDATE users SET delivery='sent' WHERE email=$1 AND hash=$2",[email,credential]);
      res.status(201).json({ email, delivery: 'sent' });
    }
  };
}
