# Scorify

MUE 550/650 Web Programming for Music – Project 3.

Upload MusicXML, read it in a scrollable OpenSheetMusicDisplay viewer, and play it
with Tone.js. Playback includes seeking, a score cursor, speed control, ties,
multiple voices, and encoded repeats and endings. Harmonic analysis runs on a
separate Woodforde worker; its Roman-numeral annotations appear above the top
staff and can be exported as a new MusicXML file.

## Run locally

```bash
cp .env.example .env
# Set SMTP_LOGIN, SMTP_PASSW, TEST_SENDER, and JOBS_SIG.
npm ci
npm start
```

The server listens at http://localhost:3000 by default. It reads configuration
from process environment variables; the root server does not automatically load
`.env`. Export those variables in your shell or configure your process runner to
load the file before starting. The worker loads its own `.env` using dotenv.

Sign in using the emailed magic link, then upload a `.xml` or `.musicxml` score.
OpenSheetMusicDisplay loads from jsDelivr; Tone.js is bundled locally.

## Deployment

The repository root is the Render web service. Configure its environment using
`.env.example`. Render supplies `RENDER_EXTERNAL_URL`; `PUBLIC_URL` can override
it. Configure a persistent disk at `/mount`, or set `DATA_ROOT` to another
persistent directory. Local storage defaults to `data/`.

The application stores sessions, jobs, account indexes, original scores, and
analysis results as files. It does not use a database service.

The Node.js worker in `2nd-server/` runs separately on Woodforde and polls for
analysis jobs. Its `JOBS_SIG` must match the web server. Install its dependencies
with `npm install` inside `2nd-server/`. See [Woodforde setup](WOODFORDE_SETUP.md)
for configuration and deployment details.

For in-score annotations, deploy **both** `run_analysis.py` and
`annotate_musicxml.py` to the worker's `CHORDGNN_DIR`, alongside the existing model
checkpoint. Python inference requires the worker's AnalysisGNN, PyTorch, and
Partitura environment. Older untimed analysis results must be regenerated.

## Project structure

```text
Scorify/
├── server.js                  Fastify web server, authentication, score API, job queue
├── package.json
├── package-lock.json
├── public/
│   ├── client.js              Score loading, parsing, playback, cursor, analysis/export
│   ├── style.css
│   └── vendor/Tone.11.js      Bundled audio engine
├── src/
│   ├── pages/index.hbs        Web interface
│   └── seo.json
├── 2nd-server/
│   ├── poll_jobs.js           Analysis-job worker
│   ├── package.json
│   └── .env.example
├── run_analysis.py            Model inference and score-coordinate mapping
├── annotate_musicxml.py       Timed analysis labels in exported MusicXML
├── test/
│   ├── playback.test.js       Playback scheduling and lifecycle checks
│   ├── browser-playback.cjs   Browser rendering, playback, seek, cursor/export checks
│   └── test_annotations.py    Annotation timing and score-preservation checks
├── WOODFORDE_SETUP.md
└── .env.example
```

## Checks

These checks do not need the model or a browser:

```bash
node --test test/playback.test.js
python3 -B -m unittest discover -s test -p 'test_*.py'
```

Browser checks require the `playwright` Node package to be available (locally or
through `NODE_PATH`) and Google Chrome installed:

```bash
node test/browser-playback.cjs
```

Optional `SCORE_XML` supplies a local integration-test score. The existing
score-specific assertions expect the development `composition.xml` fixture.
`OSMD_JS` points to a local OpenSheetMusicDisplay 1.8.3 bundle to enable rendered
cursor checks. `ANNOTATED_XML` adds an annotation-rendering and download test
using an annotated version of that fixture. These fixture files are not bundled
with the repository; synthetic parser tests run without them.

## Repository housekeeping

`node_modules/`, Python bytecode, `.DS_Store`, `.env`, and runtime `data/` are
ignored. Keep credentials and uploaded user data out of Git. Use `npm ci` to
restore root dependencies if `node_modules/` is removed. Course starter examples
and the unused standalone VexFlow renderer are not part of the application.
