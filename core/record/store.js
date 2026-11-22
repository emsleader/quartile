// Shared helpers for Quartile Record (specification Section 21): database handle, folders, IDs, dates.
// Paths are computed on every call, so tests can set QUARTILE_HOME before use.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { monotonicFactory } from "ulid";
import { openDb, home } from "../store/db.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const SCHEMA = fs.readFileSync(path.join(__dirname, "schema.sql"), "utf8");

/** Open the shared Library/Record database with the Record schema in place. */
export const db = () => openDb([SCHEMA]);
export const recordDir = () => path.join(home(), "record");
export const filesDir = () => path.join(recordDir(), "files");
export const lessonsFile = () => path.join(recordDir(), "lessons.yaml");
export const exportsDir = () => path.join(recordDir(), "exports");

const nextUlid = monotonicFactory();
/** ULID: sortable by creation time. */
export const newId = () => nextUlid();
export const nowIso = () => new Date().toISOString();

/** Accept YYYY-MM-DD or a full ISO date-time; return the normalised string or throw. */
export function normDate(s, field = "date") {
  const t = String(s || "").trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(t)) {
    const d = new Date(t + "T00:00:00Z");
    if (Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== t) throw new Error(`${field}: ${t} is not a valid date`);
    return t;
  }
  const d = new Date(t);
  if (!t || Number.isNaN(d.getTime()) || !/^\d{4}-\d{2}-\d{2}T/.test(t)) throw new Error(`${field}: give a date as YYYY-MM-DD or an ISO date-time`);
  return d.toISOString();
}

/** Days between two stored dates (calendar days, UTC). */
export function daysBetween(a, b) {
  const da = Date.parse(a.length === 10 ? a + "T00:00:00Z" : a), dbb = Date.parse(b.length === 10 ? b + "T00:00:00Z" : b);
  return Math.round((dbb - da) / 86400000);
}

/** ISSNs and journal ids compared without case, spaces or hyphens. */
export const normJournal = j => (j == null ? "" : String(j).toUpperCase().replace(/[\s-]/g, ""));

export const parseJson = s => { if (s == null || s === "") return null; try { return JSON.parse(s); } catch { return null; } };

export default { db, recordDir, filesDir, lessonsFile, exportsDir, newId, nowIso, normDate, daysBetween, normJournal, parseJson, SCHEMA };
