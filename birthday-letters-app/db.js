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

// ---- prepared statements ----
const stmts = {
  insert: db.prepare(`
    INSERT INTO letters (id, title, from_name, letter_date, message, photo_path, created_at)
    VALUES (@id, @title, @from_name, @letter_date, @message, @photo_path, @created_at)
  `),
  all: db.prepare(`SELECT * FROM letters ORDER BY created_at DESC`),
  one: db.prepare(`SELECT * FROM letters WHERE id = ?`),
  remove: db.prepare(`DELETE FROM letters WHERE id = ?`),
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
    createdAt: row.created_at,
  };
}

export function listLetters() {
  return stmts.all.all().map(rowToLetter);
}

export function getLetter(id) {
  return rowToLetter(stmts.one.get(id));
}

export function insertLetter({ id, title, from, date, message, photoPath, createdAt }) {
  stmts.insert.run({
    id,
    title,
    from_name: from || '',
    letter_date: date || '',
    message,
    photo_path: photoPath || null,
    created_at: createdAt,
  });
  return getLetter(id);
}

export function deleteLetter(id) {
  const existing = getLetter(id);
  stmts.remove.run(id);
  return existing;
}

export default db;
