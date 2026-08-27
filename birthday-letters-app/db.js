// db.js — database layer
//
// Uses Turso (a free, permanent cloud database built on SQLite) via
// @libsql/client, so your letters and photos survive forever — even
// when your Render server restarts, sleeps, or redeploys.
//
// If you haven't set up Turso yet (e.g. you're just testing locally),
// this automatically falls back to a local file at data/letters.db so
// you can still run `npm start` with zero setup. Only your LIVE site
// needs the real Turso credentials — see README.md.

import { createClient } from '@libsql/client';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { mkdirSync } from 'node:fs';

const moduleDir = path.dirname(fileURLToPath(import.meta.url));

let clientConfig;
if (process.env.TURSO_DATABASE_URL) {
  clientConfig = {
    url: process.env.TURSO_DATABASE_URL,
    authToken: process.env.TURSO_AUTH_TOKEN,
  };
} else {
  const DATA_DIR = path.join(moduleDir, 'data');
  mkdirSync(DATA_DIR, { recursive: true });
  clientConfig = { url: 'file:' + path.join(DATA_DIR, 'letters.db') };
}

const db = createClient(clientConfig);

// ---- schema ----
await db.execute(`
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

await db.execute(`
  CREATE TABLE IF NOT EXISTS folders (
    id          TEXT PRIMARY KEY,
    name        TEXT NOT NULL,
    color       TEXT,
    created_at  INTEGER NOT NULL
  )
`);

// ---- migration: add folder_id to letters if it doesn't exist yet ----
const letterColumns = await db.execute(`PRAGMA table_info(letters)`);
const hasFolderId = letterColumns.rows.some((c) => c.name === 'folder_id');
if (!hasFolderId) {
  await db.execute(`ALTER TABLE letters ADD COLUMN folder_id TEXT`);
}

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
    createdAt: Number(row.created_at),
  };
}

function rowToFolder(row) {
  if (!row) return null;
  return {
    id: row.id,
    name: row.name,
    color: row.color || null,
    letterCount: row.letter_count !== undefined ? Number(row.letter_count) : undefined,
    createdAt: Number(row.created_at),
  };
}

// ---------- letters ----------

// folderFilter: undefined/'' -> all letters, 'none' -> only unfiled letters,
// any other string -> only letters in that folder id
export async function listLetters(folderFilter) {
  let result;
  if (folderFilter === 'none') {
    result = await db.execute(`SELECT * FROM letters WHERE folder_id IS NULL ORDER BY created_at DESC`);
  } else if (folderFilter) {
    result = await db.execute({
      sql: `SELECT * FROM letters WHERE folder_id = ? ORDER BY created_at DESC`,
      args: [folderFilter],
    });
  } else {
    result = await db.execute(`SELECT * FROM letters ORDER BY created_at DESC`);
  }
  return result.rows.map(rowToLetter);
}

export async function getLetter(id) {
  const result = await db.execute({ sql: `SELECT * FROM letters WHERE id = ?`, args: [id] });
  return rowToLetter(result.rows[0]);
}

export async function insertLetter({ id, title, from, date, message, photo, folderId, createdAt }) {
  await db.execute({
    sql: `INSERT INTO letters (id, title, from_name, letter_date, message, photo_path, folder_id, created_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    args: [id, title, from || '', date || '', message, photo || null, folderId || null, createdAt],
  });
  return getLetter(id);
}

export async function deleteLetter(id) {
  const existing = await getLetter(id);
  await db.execute({ sql: `DELETE FROM letters WHERE id = ?`, args: [id] });
  return existing;
}

// ---------- folders ----------

export async function listFolders() {
  const result = await db.execute(`
    SELECT folders.*, COUNT(letters.id) AS letter_count
    FROM folders
    LEFT JOIN letters ON letters.folder_id = folders.id
    GROUP BY folders.id
    ORDER BY folders.created_at ASC
  `);
  return result.rows.map(rowToFolder);
}

export async function getFolder(id) {
  const result = await db.execute({ sql: `SELECT * FROM folders WHERE id = ?`, args: [id] });
  return rowToFolder(result.rows[0]);
}

export async function insertFolder({ id, name, color, createdAt }) {
  await db.execute({
    sql: `INSERT INTO folders (id, name, color, created_at) VALUES (?, ?, ?, ?)`,
    args: [id, name, color || null, createdAt],
  });
  return getFolder(id);
}

// Deletes the folder but keeps its letters — they just become "loose"
// (unfiled) letters instead of being destroyed.
export async function deleteFolder(id) {
  const existing = await getFolder(id);
  await db.execute({ sql: `UPDATE letters SET folder_id = NULL WHERE folder_id = ?`, args: [id] });
  await db.execute({ sql: `DELETE FROM folders WHERE id = ?`, args: [id] });
  return existing;
}

export default db;
