import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import pg from 'pg';

export async function connectDatabase() {
  const directory = path.resolve(process.env.DATA_DIR || 'data');
  let run;
  let addColumn;
  let migrate;
  if (process.env.DATABASE_URL) {
    const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
    migrate = async work => {
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        await client.query("SELECT pg_advisory_xact_lock(hashtext('walkin.users.schema'))");
        await work(async (sql,values=[]) => (await client.query(sql,values)).rows,'postgres');
        await client.query('COMMIT');
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      } finally { client.release(); }
    };
    run = async (sql, values) => (await pool.query(sql, values)).rows;
    addColumn = (table, column, definition) => pool.query('ALTER TABLE '+table+' ADD COLUMN IF NOT EXISTS '+column+' '+definition);
  } else {
    await mkdir(directory, { recursive: true });
    const { DatabaseSync } = await import('node:sqlite');
    const db = new DatabaseSync(path.join(directory, 'walkin.sqlite'));
    db.exec('PRAGMA foreign_keys=ON');
    db.exec('PRAGMA busy_timeout=5000');
    run = (sql, values) => db.prepare(sql.replace(/\$\d+/g, '?')).all(...values);
    migrate = async work => {
      db.exec('BEGIN IMMEDIATE');
      try {
        await work((sql,values=[]) => run(sql,values),'sqlite');
        db.exec('COMMIT');
      } catch (error) {
        db.exec('ROLLBACK');
        throw error;
      }
    };
    addColumn = (table, column, definition) => {
      if (!db.prepare('PRAGMA table_info('+table+')').all().some(c => c.name === column)) {
        db.exec('ALTER TABLE '+table+' ADD COLUMN '+column+' '+definition);
      }
    };
  }
  return { run, addColumn, migrate };
}
