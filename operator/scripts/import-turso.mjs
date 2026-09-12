import BetterSqlite3 from 'better-sqlite3';
import { connect } from '@tursodatabase/serverless';

const sourcePath = process.env.VIRA_SOURCE_SQLITE || 'data/vira-production.sqlite';
const url = process.env.TURSO_DATABASE_URL;
const token = process.env.TURSO_AUTH_TOKEN;
if (!url || !token) throw new Error('TURSO_DATABASE_URL and TURSO_AUTH_TOKEN are required.');

const source = new BetterSqlite3(sourcePath, { readonly: true });
const target = connect({ url, authToken: token });
const tables = source.prepare("SELECT name,sql FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY rowid").all();
const indexes = source.prepare("SELECT sql FROM sqlite_master WHERE type IN ('index','trigger') AND sql IS NOT NULL AND name NOT LIKE 'sqlite_%' ORDER BY rowid").all();

await target.pragma('foreign_keys=OFF');
for (const table of tables) {
  await target.exec(table.sql);
}

let rowCount = 0;
for (const table of tables) {
  const columns = source.prepare(`PRAGMA table_info(\"${table.name.replaceAll('"', '""')}\")`).all();
  const names = columns.map((column) => column.name);
  const quotedTable = `\"${table.name.replaceAll('"', '""')}\"`;
  const quotedColumns = names.map((name) => `\"${name.replaceAll('"', '""')}\"`).join(',');
  const placeholders = names.map(() => '?').join(',');
  const rows = source.prepare(`SELECT ${quotedColumns} FROM ${quotedTable}`).all();
  for (let offset = 0; offset < rows.length; offset += 100) {
    const statements = rows.slice(offset, offset + 100).map((row) => ({
      sql: `INSERT INTO ${quotedTable} (${quotedColumns}) VALUES (${placeholders})`,
      args: names.map((name) => {
        const value = row[name];
        return Buffer.isBuffer(value) ? new Uint8Array(value) : value ?? null;
      }),
    }));
    if (statements.length) await target.batch(statements);
    rowCount += statements.length;
  }
}
for (const index of indexes) await target.exec(index.sql);
await target.pragma('foreign_keys=ON');
console.log(JSON.stringify({ tables: tables.length, rows: rowCount }));
await target.close();
source.close();
