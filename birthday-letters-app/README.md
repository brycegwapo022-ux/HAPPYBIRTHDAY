# The Letter Folder 💌

A love-themed website for saving birthday letters, one "envelope" at a time,
with a real backend and a real database.

## Stack

- **Backend:** plain Node.js (`http` module — no Express, no framework)
- **Database:** SQLite, via Node's built-in `node:sqlite` driver — a real
  `.db` file on disk at `data/letters.db`. Nothing to install for this part.
- **File storage:** uploaded photos are saved as real files in
  `data/uploads/`, compressed in the browser first so they stay small.
- **Frontend:** plain HTML/CSS/JS, talking to the backend over `fetch()`.

There are **zero npm dependencies** — everything needed ships with Node.js
itself (v22.5+).

## How it's organized

```
birthday-letters-app/
├── server.js         backend: HTTP server + REST API routes
├── db.js             database layer: schema + queries
├── package.json
├── data/
│   ├── letters.db     created automatically on first run
│   └── uploads/        saved photos land here
└── public/            the frontend, served as static files
    ├── index.html
    ├── style.css
    └── app.js
```

## REST API

| Method | Route              | What it does                          |
|--------|--------------------|----------------------------------------|
| GET    | `/api/letters`      | list all letters                      |
| POST   | `/api/letters`      | create a letter (JSON body)           |
| GET    | `/api/letters/:id`  | get one letter                        |
| DELETE | `/api/letters/:id`  | delete a letter (and its photo file)  |

`POST` body shape:
```json
{
  "title": "Happy Birthday, Mom!",
  "from": "Your loving daughter",
  "date": "2026-08-16",
  "message": "Dear Mom...",
  "photo": "data:image/jpeg;base64,...."
}
```

## Running it

1. Make sure you have **Node.js v22.5 or newer** installed
   (check with `node -v`).
2. Open this folder in VS Code.
3. In the terminal:
   ```bash
   npm start
   ```
4. Open **http://localhost:3000** in your browser.

That's it — no database server to install, no `npm install` needed.

If your Node version is older than 22.5, `node:sqlite` may not exist yet.
Update Node, or ask me for a version that swaps in a small pure-JS database
instead.

## Notes for presenting this as a school project

- This is a genuine **client/server** app: the browser (`public/`) never
  touches the database directly — it only talks to `server.js` over HTTP,
  which is the same pattern real websites use.
- `db.js` keeps all the SQL in one place (the "data layer"), so `server.js`
  never writes raw SQL — that separation is good practice to mention if
  you're explaining your architecture.
- Photos are resized on the client (in `app.js`, using a `<canvas>`) before
  upload, so the server never receives huge files.
