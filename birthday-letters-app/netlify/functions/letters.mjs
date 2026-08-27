// netlify/functions/letters.mjs
//
// This uses Netlify's newer "v2 functions" format (a default export taking
// a standard Web Request and returning a standard Web Response). It's
// built for modern JavaScript modules, which sidesteps the CommonJS/ESM
// mismatch errors we hit with the older function format. The `config.path`
// export below tells Netlify directly which URLs this function handles —
// no separate redirect rule needed for this one.

import { listLetters, getLetter, insertLetter, deleteLetter, getFolder } from '../../db.js';
import crypto from 'node:crypto';

function json(status, data) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Access-Control-Allow-Origin': '*' },
  });
}

export default async (request) => {
  const url = new URL(request.url);
  const afterFn = url.pathname.replace(/^\/api\/letters/, ''); // '' or '/<id>'
  const method = request.method;

  let parsedBody = {};
  if (method === 'POST') {
    try { parsedBody = await request.json(); } catch { parsedBody = {}; }
  }

  try {
    if (afterFn === '' && method === 'GET') {
      const folderFilter = url.searchParams.get('folder') || undefined;
      return json(200, await listLetters(folderFilter));
    }

    if (afterFn === '' && method === 'POST') {
      const title = (parsedBody.title || '').trim();
      const message = (parsedBody.message || '').trim();
      if (!title || !message) {
        return json(400, { error: 'Title and message are required.' });
      }
      const folderId = parsedBody.folderId || null;
      if (folderId && !(await getFolder(folderId))) {
        return json(400, { error: 'That folder does not exist.' });
      }
      const letter = await insertLetter({
        id: crypto.randomUUID(),
        title,
        from: (parsedBody.from || '').trim(),
        date: parsedBody.date || '',
        message,
        photo: parsedBody.photo || null,
        folderId,
        createdAt: Date.now(),
      });
      return json(201, letter);
    }

    const idMatch = afterFn.match(/^\/([\w-]+)$/);

    if (idMatch && method === 'GET') {
      const letter = await getLetter(idMatch[1]);
      if (!letter) return json(404, { error: 'Letter not found.' });
      return json(200, letter);
    }

    if (idMatch && method === 'DELETE') {
      const removed = await deleteLetter(idMatch[1]);
      if (!removed) return json(404, { error: 'Letter not found.' });
      return json(200, { ok: true });
    }

    return json(404, { error: 'Not found.' });
  } catch (err) {
    console.error(err);
    return json(500, { error: 'Something went wrong on the server.' });
  }
};

export const config = { path: ['/api/letters', '/api/letters/*'] };
