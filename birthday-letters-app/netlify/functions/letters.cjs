// netlify/functions/letters.cjs
// Handles /api/letters and /api/letters/:id (via the redirect in netlify.toml).
//
// This file uses the .cjs extension and CommonJS syntax (require/exports)
// on purpose: Netlify's function runtime expects that format, even though
// the rest of this project uses the newer import/export style. It reaches
// into db.js (which IS written in that newer style) using a dynamic
// import() — that's a safe, standard way to bridge the two.

const crypto = require('node:crypto');

function json(statusCode, data) {
  return {
    statusCode,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Access-Control-Allow-Origin': '*' },
    body: JSON.stringify(data),
  };
}

exports.handler = async (event) => {
  const { listLetters, getLetter, insertLetter, deleteLetter, getFolder } = await import('../../db.js');

  const { httpMethod, path, queryStringParameters, body } = event;
  // path is like /.netlify/functions/letters or /.netlify/functions/letters/<id>
  const afterFn = path.replace(/^.*\/letters/, ''); // '' or '/<id>'

  let parsedBody = {};
  if (body) {
    try { parsedBody = JSON.parse(body); } catch { parsedBody = {}; }
  }

  try {
    if (afterFn === '' && httpMethod === 'GET') {
      const folderFilter = (queryStringParameters && queryStringParameters.folder) || undefined;
      return json(200, await listLetters(folderFilter));
    }

    if (afterFn === '' && httpMethod === 'POST') {
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

    if (idMatch && httpMethod === 'GET') {
      const letter = await getLetter(idMatch[1]);
      if (!letter) return json(404, { error: 'Letter not found.' });
      return json(200, letter);
    }

    if (idMatch && httpMethod === 'DELETE') {
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
