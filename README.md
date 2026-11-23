# Scorify

MUE 550/650 Web Programming for Music – Project 3  
Upload MusicXML scores, view sheet music with VexFlow, play back with Tone.js, run ChordGNN Roman-numeral analysis via a 2nd-server on woodforde.

## Quick start (local)

```bash
cp .env.example .env   # fill in SMTP and JOBS_SIG
npm install
npm start              # http://localhost:3000
```

## Deploy (Render)

1. Push this repo (the top-level folder, **not** `2nd-server/`) to GitHub.
2. Create a Render **Web Service** pointing at this repo.
3. Set environment variables in Render's dashboard (from `.env.example`).
4. Render sets `RENDER_EXTERNAL_URL` automatically — no `PUBLIC_URL` needed there.

## 2nd-server setup on woodforde

See `WOODFORDE_SETUP.md` for the full step-by-step.

## Project structure

```
scorify/
├── server.js          ← UI server (Fastify, magic-link auth, job queue)
├── public/
│   ├── client.js      ← MusicXML parser + VexFlow render + Tone.js playback + job submit
│   ├── style.css
│   └── vendor/        ← vexflow.min.js, Tone.11.js
├── src/pages/
│   └── index.hbs      ← Handlebars template
├── 2nd-server/
│   ├── poll_jobs.js   ← Runs on woodforde via tmux; polls for jobs, runs ChordGNN
│   └── package.json
└── .env.example
```
