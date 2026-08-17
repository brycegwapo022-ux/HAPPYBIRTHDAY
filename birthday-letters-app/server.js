// server.js — the backend
// A plain Node.js HTTP server (no framework) exposing a small REST API,
// backed by a real SQLite database (see db.js), plus static file serving
// for the frontend in /public and uploaded photos in /data/uploads.

import { createServer } from 'node:http';
import { readFile, writeFile, unlink, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import crypto from 'node:crypto';
import {
  listLetters, getLetter, insertLetter, deleteLetter,
  listFolders, insertFolder, deleteFolder, getFolder,
} from './db.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC_DIR = path.join(__dirname, 'public');
const UPLOADS_DIR = path.join(__dirname, 'data', 'uploads');
const PORT = process.env.PORT || 3000;

await mkdir(UPLOADS_DIR, { recursive: true });

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
};

function send(res, status, body, headers = {}) {
  res.writeHead(status, { 'Access-Control-Allow-Origin': '*', ...headers });
  res.end(body);
}

function sendJSON(res, status, data) {
  send(res, status, JSON.stringify(data), { 'Content-Type': 'application/json; charset=utf-8' });
}

async function readJSONBody(req) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > 15 * 1024 * 1024) throw new Error('Request body too large');
    chunks.push(chunk);
  }
  if (chunks.length === 0) return {};
  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}

// Saves a base64 data URL (e.g. "data:image/jpeg;base64,...") to disk and
// returns the public path to serve it from.
async function savePhoto(id, dataUrl) {
  const match = /^data:(image\/\w+);base64,(.+)$/.exec(dataUrl || '');
  if (!match) return null;
  const ext = match[1] === 'image/png' ? '.png' : '.jpg';
  const filename = id + ext;
  const buffer = Buffer.from(match[2], 'base64');
  await writeFile(path.join(UPLOADS_DIR, filename), buffer);
  return '/uploads/' + filename;
}

async function deletePhotoFile(photoPath) {
  if (!photoPath) return;
  const filePath = path.join(UPLOADS_DIR, path.basename(photoPath));
  if (existsSync(filePath)) {
    try { await unlink(filePath); } catch { /* ignore */ }
  }
}

async function serveStatic(req, res, urlPath) {
  let filePath;
  if (urlPath.startsWith('/uploads/')) {
    filePath = path.join(UPLOADS_DIR, path.basename(urlPath));
  } else {
    filePath = path.join(PUBLIC_DIR, urlPath === '/' ? 'index.html' : urlPath);
  }
  try {
    const data = await readFile(filePath);
    const ext = path.extname(filePath).toLowerCase();
    send(res, 200, data, { 'Content-Type': MIME[ext] || 'application/octet-stream' });
  } catch {
    send(res, 404, 'Not found');
  }
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const { pathname } = url;

  try {
    // ---------- REST API ----------
    if (pathname === '/api/letters' && req.method === 'GET') {
      // ?folder=none -> only unfiled letters, ?folder=<id> -> only that folder,
      // no param -> every letter regardless of folder
      const folderFilter = url.searchParams.get('folder') || undefined;
      return sendJSON(res, 200, listLetters(folderFilter));
    }

    if (pathname === '/api/letters' && req.method === 'POST') {
      const body = await readJSONBody(req);
      const title = (body.title || '').trim();
      const message = (body.message || '').trim();
      if (!title || !message) {
        return sendJSON(res, 400, { error: 'Title and message are required.' });
      }
      let folderId = body.folderId || null;
      if (folderId && !getFolder(folderId)) {
        return sendJSON(res, 400, { error: 'That folder does not exist.' });
      }
      const id = crypto.randomUUID();
      const photoPath = body.photo ? await savePhoto(id, body.photo) : null;
      const letter = insertLetter({
        id,
        title,
        from: (body.from || '').trim(),
        date: body.date || '',
        message,
        photoPath,
        folderId,
        createdAt: Date.now(),
      });
      return sendJSON(res, 201, letter);
    }

    // ---------- folders ----------
    if (pathname === '/api/folders' && req.method === 'GET') {
      return sendJSON(res, 200, listFolders());
    }

    if (pathname === '/api/folders' && req.method === 'POST') {
      const body = await readJSONBody(req);
      const name = (body.name || '').trim();
      if (!name) return sendJSON(res, 400, { error: 'Folder name is required.' });
      const folder = insertFolder({
        id: crypto.randomUUID(),
        name,
        color: body.color || null,
        createdAt: Date.now(),
      });
      return sendJSON(res, 201, folder);
    }

    const folderMatch = pathname.match(/^\/api\/folders\/([\w-]+)$/);
    if (folderMatch && req.method === 'DELETE') {
      const removed = deleteFolder(folderMatch[1]);
      if (!removed) return sendJSON(res, 404, { error: 'Folder not found.' });
      return sendJSON(res, 200, { ok: true });
    }

    const singleMatch = pathname.match(/^\/api\/letters\/([\w-]+)$/);
    if (singleMatch && req.method === 'GET') {
      const letter = getLetter(singleMatch[1]);
      if (!letter) return sendJSON(res, 404, { error: 'Letter not found.' });
      return sendJSON(res, 200, letter);
    }

    if (singleMatch && req.method === 'DELETE') {
      const removed = deleteLetter(singleMatch[1]);
      if (!removed) return sendJSON(res, 404, { error: 'Letter not found.' });
      await deletePhotoFile(removed.photo);
      return sendJSON(res, 200, { ok: true });
    }

    // ---------- static frontend ----------
    if (req.method === 'GET') {
      return serveStatic(req, res, pathname);
    }

    return sendJSON(res, 405, { error: 'Method not allowed.' });
  } catch (err) {
    console.error(err);
    return sendJSON(res, 500, { error: 'Something went wrong on the server.' });
  }
});

server.listen(PORT, () => {
  console.log(`💌 The Letter Folder is running at http://localhost:${PORT}`);
});
