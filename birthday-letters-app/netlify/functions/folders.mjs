// netlify/functions/folders.mjs
// Handles /api/folders and /api/folders/:id (via the redirect in netlify.toml).
// See letters.mjs for why this uses .mjs + static imports.

import { listFolders, insertFolder, deleteFolder } from '../../db.js';
import crypto from 'node:crypto';

function json(statusCode, data) {
  return {
    statusCode,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Access-Control-Allow-Origin': '*' },
    body: JSON.stringify(data),
  };
}

export const handler = async (event) => {
  const { httpMethod, path, body } = event;
  const afterFn = path.replace(/^.*\/folders/, ''); // '' or '/<id>'

  let parsedBody = {};
  if (body) {
    try { parsedBody = JSON.parse(body); } catch { parsedBody = {}; }
  }

  try {
    if (afterFn === '' && httpMethod === 'GET') {
      return json(200, await listFolders());
    }

    if (afterFn === '' && httpMethod === 'POST') {
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

    if (idMatch && httpMethod === 'DELETE') {
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
