// server.js — the backend
// A plain Node.js HTTP server (no framework) exposing a small REST API,
// backed by a real database (see db.js) that lives in the cloud via Turso,
// so it survives restarts — plus static file serving for the frontend.

import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import crypto from 'node:crypto';
import {
  listLetters, getLetter, insertLetter, deleteLetter,
  listFolders, insertFolder, deleteFolder, getFolder,
} from './db.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC_DIR = path.join(__dirname, 'public');
const PORT = process.env.PORT || 3000;

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

async function serveStatic(req, res, urlPath) {
  const filePath = path.join(PUBLIC_DIR, urlPath === '/' ? 'index.html' : urlPath);
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
    // ---------- letters ----------
    if (pathname === '/api/letters' && req.method === 'GET') {
      // ?folder=none -> only unfiled letters, ?folder=<id> -> only that folder,
      // no param -> every letter regardless of folder
      const folderFilter = url.searchParams.get('folder') || undefined;
      return sendJSON(res, 200, await listLetters(folderFilter));
    }

    if (pathname === '/api/letters' && req.method === 'POST') {
      const body = await readJSONBody(req);
      const title = (body.title || '').trim();
      const message = (body.message || '').trim();
      if (!title || !message) {
        return sendJSON(res, 400, { error: 'Title and message are required.' });
      }
      const folderId = body.folderId || null;
      if (folderId && !(await getFolder(folderId))) {
        return sendJSON(res, 400, { error: 'That folder does not exist.' });
      }
      const letter = await insertLetter({
        id: crypto.randomUUID(),
        title,
        from: (body.from || '').trim(),
        date: body.date || '',
        message,
        photo: body.photo || null, // stored directly as a data URL, straight in the database
        folderId,
        createdAt: Date.now(),
      });
      return sendJSON(res, 201, letter);
    }

    const singleMatch = pathname.match(/^\/api\/letters\/([\w-]+)$/);
    if (singleMatch && req.method === 'GET') {
      const letter = await getLetter(singleMatch[1]);
      if (!letter) return sendJSON(res, 404, { error: 'Letter not found.' });
      return sendJSON(res, 200, letter);
    }

    if (singleMatch && req.method === 'DELETE') {
      const removed = await deleteLetter(singleMatch[1]);
      if (!removed) return sendJSON(res, 404, { error: 'Letter not found.' });
      return sendJSON(res, 200, { ok: true });
    }

    // ---------- folders ----------
    if (pathname === '/api/folders' && req.method === 'GET') {
      return sendJSON(res, 200, await listFolders());
    }

    if (pathname === '/api/folders' && req.method === 'POST') {
      const body = await readJSONBody(req);
      const name = (body.name || '').trim();
      if (!name) return sendJSON(res, 400, { error: 'Folder name is required.' });
      const folder = await insertFolder({
        id: crypto.randomUUID(),
        name,
        color: body.color || null,
        createdAt: Date.now(),
      });
      return sendJSON(res, 201, folder);
    }

    const folderMatch = pathname.match(/^\/api\/folders\/([\w-]+)$/);
    if (folderMatch && req.method === 'DELETE') {
      const removed = await deleteFolder(folderMatch[1]);
      if (!removed) return sendJSON(res, 404, { error: 'Folder not found.' });
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
