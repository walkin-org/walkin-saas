import { connectDatabase } from '../config/database.js';
import { legacyPhotoReader } from '../config/photos.js';
import { migrateUsers } from './users.js';

export const storefrontFields = 'id,name,market,landmark,created,mime,owner,owner_user_id,archived,road_id,road_side,offset_m,frontage_m';

const schema = `CREATE TABLE IF NOT EXISTS storefronts (
  id TEXT PRIMARY KEY, name TEXT NOT NULL, market TEXT NOT NULL,
  landmark TEXT NOT NULL, created TEXT NOT NULL, mime TEXT NOT NULL
)`;

export async function openCatalog() {
  const { run, addColumn, migrate } = await connectDatabase();
  await run(schema, []);
  await run(`CREATE TABLE IF NOT EXISTS market_roads (
    id TEXT PRIMARY KEY, market TEXT NOT NULL, area_type TEXT NOT NULL CHECK(area_type IN ('business_market','shopping_area')),
    name TEXT NOT NULL, start_label TEXT NOT NULL, end_label TEXT NOT NULL, length_m DOUBLE PRECISION NOT NULL CHECK(length_m>0),
    UNIQUE(market,name)
  )`, []);
  await addColumn('storefronts','road_id','TEXT REFERENCES market_roads(id)');
  await addColumn('storefronts','road_side',"TEXT CHECK(road_side IN ('left','right'))");
  await addColumn('storefronts','offset_m','DOUBLE PRECISION CHECK(offset_m>=0)');
  await addColumn('storefronts','frontage_m','DOUBLE PRECISION CHECK(frontage_m>0)');
  await addColumn('storefronts','owner','TEXT');
  await addColumn('storefronts','archived','INTEGER NOT NULL DEFAULT 0');
  await run('CREATE INDEX IF NOT EXISTS storefront_map ON storefronts(road_id,archived,road_side,offset_m,id)',[]);
  await migrate(migrateUsers);
  await addColumn('storefronts','photo_bytes',process.env.DATABASE_URL ? 'BYTEA' : 'BLOB');
  await run('CREATE INDEX IF NOT EXISTS mobile_sessions_expiry ON mobile_sessions(expires)', []);
  await run('CREATE INDEX IF NOT EXISTS storefront_feed ON storefronts(archived,created,id)', []);
  // Copy older media one object at a time. Committed rows are skipped on retry.
  const legacy = await run("SELECT id FROM storefronts WHERE mime <> '' AND photo_bytes IS NULL", []);
  if (legacy.length) {
    const readPhoto = legacyPhotoReader();
    for (const {id} of legacy) {
      const bytes = await readPhoto(id);
      await run('UPDATE storefronts SET photo_bytes=$1 WHERE id=$2 AND photo_bytes IS NULL',[bytes,id]);
    }
  }
  return {
    run,
    list: (owner, query = '', page) => {
      const term = '%' + query.toLowerCase().replace(/[!%_]/g, '!$&') + '%';
      let sql = 'SELECT '+storefrontFields+" FROM storefronts WHERE archived=0 AND LOWER(name || ' ' || market || ' ' || landmark) LIKE $1 ESCAPE '!'";
      const args = [term];
      if (owner) { args.push(owner); sql += ' AND owner_user_id=$2'; }
      sql += ' ORDER BY created DESC,id DESC';
      if (page) {
        args.push(page.limit,page.offset);
        sql += ' LIMIT $'+(args.length-1)+' OFFSET $'+args.length;
      }
      return run(sql,args);
    },
    get: async id => (await run('SELECT '+storefrontFields+' FROM storefronts WHERE id=$1 AND archived=0',[id]))[0],
    photo: async id => (await run('SELECT mime,photo_bytes FROM storefronts WHERE id=$1 AND archived=0 AND photo_bytes IS NOT NULL',[id]))[0],
    add: ({ id,name,market,landmark,created,mime,owner,road_id,road_side,offset_m,frontage_m,owner_user_id },bytes) =>
      run('INSERT INTO storefronts (id,name,market,landmark,created,mime,owner,photo_bytes,road_id,road_side,offset_m,frontage_m,owner_user_id) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)',
        [id,name,market,landmark,created,mime,owner,bytes,road_id,road_side,offset_m,frontage_m,owner_user_id])
  };
}
