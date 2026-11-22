// Local database shared by Quartile Library (spec Section 20) and Quartile Record (spec Section 21).
// sql.js (MIT, SQLite compiled to WebAssembly) is used instead of better-sqlite3 so the Claude Desktop bundle and
// the server need no native build. The database is a file, written back after every change.
// Location: $QUARTILE_HOME/library/library.sqlite (default QUARTILE_HOME = ~/.quartile). Tests set QUARTILE_HOME
// to a temporary folder. Note: this sql.js build has FTS4, not FTS5.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import initSqlJs from "sql.js";

let SQL = null;
const open = new Map();
export const home = () => process.env.QUARTILE_HOME || path.join(os.homedir(), ".quartile");
export const dbPath = () => path.join(home(), "library", "library.sqlite");

/** Open (or create) the database. `schemas` are SQL strings run once each (CREATE ... IF NOT EXISTS). */
export async function openDb(schemas = [], file = dbPath()) {
  if (open.has(file)) { const h = open.get(file); for (const s of schemas) h.ensure(s); return h; }
  SQL ||= await initSqlJs();
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const db = fs.existsSync(file) ? new SQL.Database(fs.readFileSync(file)) : new SQL.Database();
  db.run("PRAGMA foreign_keys = ON");
  const done = new Set();
  const save = () => fs.writeFileSync(file, Buffer.from(db.export()));
  const h = {
    db, file,
    ensure(sql) { if (done.has(sql)) return; db.exec(sql); done.add(sql); save(); },
    /** Run a statement that changes data, then write the file. */
    run(sql, params = []) { db.run(sql, params); save(); return { changes: db.getRowsModified() }; },
    /** Several statements in one transaction; rolled back as a whole on error. */
    tx(fn) { db.run("BEGIN"); try { const r = fn(h.raw); db.run("COMMIT"); save(); return r; } catch (e) { db.run("ROLLBACK"); throw e; } },
    raw: { run: (sql, params = []) => db.run(sql, params), all: (sql, params = []) => all(db, sql, params) },
    all: (sql, params = []) => all(db, sql, params),
    get: (sql, params = []) => all(db, sql, params)[0] || null,
    close() { save(); db.close(); open.delete(file); },
  };
  for (const s of schemas) h.ensure(s);
  open.set(file, h);
  return h;
}
function all(db, sql, params) { const st = db.prepare(sql); st.bind(params); const out = []; while (st.step()) out.push(st.getAsObject()); st.free(); return out; }

export default { openDb, dbPath, home };
