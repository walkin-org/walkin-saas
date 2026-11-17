import { randomUUID } from 'node:crypto';

// Runs once in a locked transaction, including the ownership and session backfill.
export async function migrateUsers(run, dialect) {
  const tables = await run(dialect === 'postgres'
    ? "SELECT table_name AS name FROM information_schema.tables WHERE table_schema=current_schema()"
    : "SELECT name FROM sqlite_master WHERE type='table'");
  const exists = name => tables.some(row => row.name === name);
  if (exists('users')) return;
  await run(`CREATE TABLE users (
    id TEXT PRIMARY KEY NOT NULL,
    email TEXT NOT NULL UNIQUE CHECK (email=lower(trim(email)) AND length(email) BETWEEN 3 AND 254),
    role TEXT NOT NULL CHECK (role IN ('admin','collector','consumer')),
    display_name TEXT CHECK (length(display_name) BETWEEN 1 AND 120),
    hash TEXT NOT NULL,
    disabled INTEGER NOT NULL DEFAULT 0 CHECK (disabled IN (0,1)),
    temporary INTEGER NOT NULL DEFAULT 0 CHECK (temporary IN (0,1)),
    expires TEXT NOT NULL DEFAULT '',
    delivery TEXT NOT NULL DEFAULT '' CHECK (delivery IN ('','sending','sent','failed')),
    created_at TEXT,
    CHECK (temporary=0 OR role='collector')
  )`);
  if (exists('accounts')) {
    for (const user of await run('SELECT * FROM accounts')) {
      await run(`INSERT INTO users (id,email,role,hash,disabled,temporary,expires,delivery)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
        [randomUUID(),user.email,user.role,user.hash,user.disabled ?? 0,user.temporary,user.expires,user.delivery]);
    }
  }
  await run(`CREATE TABLE user_sessions (
    token_hash TEXT PRIMARY KEY NOT NULL,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    expires TEXT NOT NULL
  )`);
  if (exists('mobile_sessions')) {
    // A missing owner violates NOT NULL and rolls back the entire migration.
    await run(`INSERT INTO user_sessions (token_hash,user_id,expires)
      SELECT s.token_hash,u.id,s.expires FROM mobile_sessions s LEFT JOIN users u ON u.email=s.email`);
    await run('DROP TABLE mobile_sessions');
  }
  await run('ALTER TABLE user_sessions RENAME TO mobile_sessions');
  await run('ALTER TABLE storefronts ADD COLUMN owner_user_id TEXT REFERENCES users(id)');
  await run('UPDATE storefronts SET owner_user_id=(SELECT id FROM users WHERE users.email=storefronts.owner) WHERE owner IS NOT NULL');
  await run('CREATE INDEX storefront_owner_feed ON storefronts(owner_user_id,archived,created,id)');
  await run('CREATE INDEX mobile_sessions_user ON mobile_sessions(user_id)');
  await run('CREATE INDEX users_role_email ON users(role,email)');
  if (exists('accounts')) await run('DROP TABLE accounts');
}
