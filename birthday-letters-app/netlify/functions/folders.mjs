// netlify/functions/folders.mjs — see letters.mjs for an explanation of this format.

import { listFolders, insertFolder, deleteFolder } from '../../db.js';
import crypto from 'node:crypto';

function json(status, data) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Access-Control-Allow-Origin': '*' },
  });
}

export default async (request) => {
  const url = new URL(request.url);
  const afterFn = url.pathname.replace(/^\/api\/folders/, ''); // '' or '/<id>'
  const method = request.method;

  let parsedBody = {};
  if (method === 'POST') {
    try { parsedBody = await request.json(); } catch { parsedBody = {}; }
  }

  try {
    if (afterFn === '' && method === 'GET') {
      return json(200, await listFolders());
    }

    if (afterFn === '' && method === 'POST') {
      const name = (parsedBody.name || '').trim();
      if (!name) return json(400, { error: 'Folder name is required.' });
      const folder = await insertFolder({
        id: crypto.randomUUID(),
        name,
        color: parsedBody.color || null,
        createdAt: Date.now(),
      });
      return json(201, folder);
    }

    const idMatch = afterFn.match(/^\/([\w-]+)$/);

    if (idMatch && method === 'DELETE') {
      const removed = await deleteFolder(idMatch[1]);
      if (!removed) return json(404, { error: 'Folder not found.' });
      return json(200, { ok: true });
    }

    return json(404, { error: 'Not found.' });
  } catch (err) {
    console.error(err);
    return json(500, { error: 'Something went wrong on the server.' });
  }
};

export const config = { path: ['/api/folders', '/api/folders/*'] };
