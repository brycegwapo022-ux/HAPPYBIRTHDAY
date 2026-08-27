# The Letter Folder 💌

A love-themed website for saving birthday letters, organized into folders,
with a **permanent, free cloud database** — your letters don't disappear
when the server restarts.

## What changed in this version

Your previous version stored data on Render's disk, which gets wiped every
time the free server restarts or goes idle. This version stores everything
in **Turso** — a separate, free, permanent database service — so your
letters and photos survive no matter what Render does.

## Stack

- **Backend:** plain Node.js (`http` module — no Express)
- **Database:** [Turso](https://turso.tech) (a free, permanent cloud
  database built on SQLite), via the `@libsql/client` package
- **Photos:** stored directly inside the database as the letter's data,
  compressed in the browser first — no separate file storage needed
- **Frontend:** plain HTML/CSS/JS, talking to the backend over `fetch()`

## One-time setup: create your free Turso database

1. Go to **[turso.tech](https://turso.tech)** and sign up (free, no credit
   card needed).
2. Once logged in, create a new database (the dashboard will walk you
   through naming it — anything works, e.g. `birthday-letters`).
3. On your database's page, find:
   - The **Database URL** (starts with `libsql://...`)
   - An **Auth Token** (you may need to click "Create Token" or similar)
4. Keep both of these somewhere safe — you'll paste them into Render next.

## Setting it up on Render

In your Render service's settings, go to **Environment** and add two
environment variables:

| Key | Value |
|---|---|
| `TURSO_DATABASE_URL` | the `libsql://...` URL from Turso |
| `TURSO_AUTH_TOKEN` | the auth token from Turso |

Also update your **Build Command** to:
```
npm install
```
(This version now needs one small package installed — `@libsql/client` —
so the build step can no longer be skipped.)

Save, and Render will redeploy. From then on, your letters are stored in
Turso permanently — they'll survive restarts, redeploys, and idle spin-downs.

## Deploying on Netlify (instead of Render)

This project also works on Netlify. Since Netlify can't run a persistent
server, your backend routes are split into small serverless functions
(`netlify/functions/letters.js` and `netlify/functions/folders.js`) that each
talk to your Turso database directly. Your frontend (`public/`) is served
as plain static files. `server.js` is no longer used in this setup — it's
kept only so you can still test locally with `npm start` if you want.

1. Go to **[app.netlify.com](https://app.netlify.com)** and sign up (free).
2. Click **"Add new site" → "Import an existing project"**, choose GitHub,
   and select your `HAPPYBIRTHDAY` repository.
3. Netlify should auto-detect the settings from `netlify.toml` (base
   directory, publish directory, functions directory, build command). If it
   asks you to confirm them, they should read:
   - Base directory: `birthday-letters-app`
   - Build command: `npm install`
   - Publish directory: `public`
   - Functions directory: `netlify/functions`
4. Before deploying, go to **Site settings → Environment variables** and add
   the same two Turso variables you used on Render:
   - `TURSO_DATABASE_URL`
   - `TURSO_AUTH_TOKEN`
5. Deploy. Your site will be live at a `https://your-site-name.netlify.app`
   address (or a custom domain if you set one up).

Because your data lives in Turso either way, you can even run this on
**both** Render and Netlify at the same time, pointed at the same database,
with no conflicts.

## Running it locally

You do **not** need a Turso account just to test on your own computer.
If the `TURSO_DATABASE_URL` environment variable isn't set, the app
automatically uses a local file (`data/letters.db`) instead — so local
testing still works with zero setup.

1. Make sure you have Node.js installed (`node -v`).
2. In this folder, run:
   ```
   npm install
   npm start
   ```
3. Open **http://localhost:3000**.

## How it's organized

```
birthday-letters-app/
├── server.js         backend: HTTP server + REST API routes
├── db.js             database layer: Turso connection + queries
├── package.json
├── data/
│   └── letters.db     only used for LOCAL testing (see above)
└── public/            the frontend, served as static files
    ├── index.html
    ├── style.css
    └── app.js
```

## REST API

| Method | Route                | What it does                                   |
|--------|-----------------------|-------------------------------------------------|
| GET    | `/api/letters`         | list letters (optionally `?folder=<id>` or `?folder=none`) |
| POST   | `/api/letters`         | create a letter (JSON body)                    |
| GET    | `/api/letters/:id`     | get one letter                                  |
| DELETE | `/api/letters/:id`     | delete a letter                                 |
| GET    | `/api/folders`         | list folders (with letter counts)               |
| POST   | `/api/folders`         | create a folder                                 |
| DELETE | `/api/folders/:id`     | delete a folder (its letters become unfiled, not deleted) |

`POST /api/letters` body shape:
```json
{
  "title": "Happy Birthday, Mom!",
  "from": "Your loving daughter",
  "date": "2026-08-16",
  "message": "Dear Mom...",
  "photo": "data:image/jpeg;base64,....",
  "folderId": "optional-folder-id-or-omit-for-loose"
}
```

## Notes for presenting this as a school project

- This is a genuine **client/server** app with a real remote database —
  the browser never talks to Turso directly, only to `server.js`, which is
  the same pattern real production websites use.
- Storing photos as data directly in the database (instead of as separate
  files) is a real, valid pattern — it's simpler to reason about and means
  there's only one place data can ever get lost.
- Turso's free tier gives 5GB of storage, far more than a personal project
  like this will ever need.
