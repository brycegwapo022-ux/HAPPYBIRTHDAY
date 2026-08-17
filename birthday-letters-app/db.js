// db.js — database layer
// Uses Node's built-in SQLite driver (node:sqlite), so there is nothing to
// npm install. The database lives in a real .db file on disk, not in memory,
// so your letters survive server restarts.

import { DatabaseSync } from 'node:sqlite';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { mkdirSync } from 'node:fs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(__dirname, 'data');
mkdirSync(DATA_DIR, { recursive: true });

const db = new DatabaseSync(path.join(DATA_DIR, 'letters.db'));

// ---- schema ----
db.exec(`
  CREATE TABLE IF NOT EXISTS letters (
    id          TEXT PRIMARY KEY,
    title       TEXT NOT NULL,
    from_name   TEXT,
    letter_date TEXT,
    message     TEXT NOT NULL,
    photo_path  TEXT,
    created_at  INTEGER NOT NULL
  )
`);

db.exec(`
  CREATE TABLE IF NOT EXISTS folders (
    id          TEXT PRIMARY KEY,
    name        TEXT NOT NULL,
    color       TEXT,
    created_at  INTEGER NOT NULL
  )
`);

// ---- migration: add folder_id to letters if it doesn't exist yet ----
// (needed so a website you already deployed before this feature existed
// doesn't break — it just gets the new column added on next startup.)
const letterColumns = db.prepare(`PRAGMA table_info(letters)`).all();
const hasFolderId = letterColumns.some((c) => c.name === 'folder_id');
if (!hasFolderId) {
  db.exec(`ALTER TABLE letters ADD COLUMN folder_id TEXT`);
}

// ---- prepared statements: letters ----
const stmts = {
  insert: db.prepare(`
    INSERT INTO letters (id, title, from_name, letter_date, message, photo_path, folder_id, created_at)
    VALUES (@id, @title, @from_name, @letter_date, @message, @photo_path, @folder_id, @created_at)
  `),
  allLetters: db.prepare(`SELECT * FROM letters ORDER BY created_at DESC`),
  byFolder: db.prepare(`SELECT * FROM letters WHERE folder_id = ? ORDER BY created_at DESC`),
  loose: db.prepare(`SELECT * FROM letters WHERE folder_id IS NULL ORDER BY created_at DESC`),
  one: db.prepare(`SELECT * FROM letters WHERE id = ?`),
  remove: db.prepare(`DELETE FROM letters WHERE id = ?`),
};

// ---- prepared statements: folders ----
const folderStmts = {
  insert: db.prepare(`INSERT INTO folders (id, name, color, created_at) VALUES (@id, @name, @color, @created_at)`),
  all: db.prepare(`
    SELECT folders.*, COUNT(letters.id) AS letter_count
    FROM folders
    LEFT JOIN letters ON letters.folder_id = folders.id
    GROUP BY folders.id
    ORDER BY folders.created_at ASC
  `),
  one: db.prepare(`SELECT * FROM folders WHERE id = ?`),
  remove: db.prepare(`DELETE FROM folders WHERE id = ?`),
  unassignLetters: db.prepare(`UPDATE letters SET folder_id = NULL WHERE folder_id = ?`),
};

function rowToLetter(row) {
  if (!row) return null;
  return {
    id: row.id,
    title: row.title,
    from: row.from_name || '',
    date: row.letter_date || '',
    message: row.message,
    photo: row.photo_path || null,
    folderId: row.folder_id || null,
    createdAt: row.created_at,
  };
}

function rowToFolder(row) {
  if (!row) return null;
  return {
    id: row.id,
    name: row.name,
    color: row.color || null,
    letterCount: row.letter_count ?? undefined,
    createdAt: row.created_at,
  };
}

// ---------- letters ----------

// folderFilter: undefined/'' -> all letters, 'none' -> only letters with no folder,
// any other string -> only letters in that folder id
export function listLetters(folderFilter) {
  if (folderFilter === 'none') return stmts.loose.all().map(rowToLetter);
  if (folderFilter) return stmts.byFolder.all(folderFilter).map(rowToLetter);
  return stmts.allLetters.all().map(rowToLetter);
}

export function getLetter(id) {
  return rowToLetter(stmts.one.get(id));
}

export function insertLetter({ id, title, from, date, message, photoPath, folderId, createdAt }) {
  stmts.insert.run({
    id,
    title,
    from_name: from || '',
    letter_date: date || '',
    message,
    photo_path: photoPath || null,
    folder_id: folderId || null,
    created_at: createdAt,
  });
  return getLetter(id);
}

export function deleteLetter(id) {
  const existing = getLetter(id);
  stmts.remove.run(id);
  return existing;
}

// ---------- folders ----------

export function listFolders() {
  return folderStmts.all.all().map(rowToFolder);
}

export function getFolder(id) {
  return rowToFolder(folderStmts.one.get(id));
}

export function insertFolder({ id, name, color, createdAt }) {
  folderStmts.insert.run({ id, name, color: color || null, created_at: createdAt });
  return getFolder(id);
}

// Deletes the folder but keeps its letters — they just become "loose"
// (unfiled) letters instead of being destroyed.
export function deleteFolder(id) {
  const existing = getFolder(id);
  folderStmts.unassignLetters.run(id);
  folderStmts.remove.run(id);
  return existing;
}

export default db;
