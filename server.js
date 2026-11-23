// Scorify — MusicXML upload, VexFlow rendering, Tone.js playback, ChordGNN analysis.
// Magic-link auth adapted from Project 2 (mue550-650-proj2-pb).
const path = require("path")
const fs = require("fs")
const crypto = require("crypto")
const { v4: uuidv4 } = require("uuid")
const pipeline = require("util").promisify(require("stream").pipeline)
const fastify = require("fastify")({ logger: false })
const nodemailer = require("nodemailer")

const publicUrl = process.env.PUBLIC_URL || process.env.RENDER_EXTERNAL_URL || "http://localhost:3000"
const dataRoot = process.env.DATA_ROOT || (process.env.RENDER ? "/mount" : path.join(__dirname, "data"))
const sessionsFile = path.join(dataRoot, "user_sessions.json")
const jobsFile = path.join(dataRoot, "jobs.json")
const sessionLength = 30 * 60 * 1000

fs.mkdirSync(dataRoot, { recursive: true })
if (!fs.existsSync(sessionsFile)) fs.writeFileSync(sessionsFile, "{}")
if (!fs.existsSync(jobsFile)) fs.writeFileSync(jobsFile, "{}")

const userSessions = JSON.parse(fs.readFileSync(sessionsFile, "utf8"))
const legit_users = Object.keys(userSessions)

function saveSessions() {
  fs.writeFileSync(sessionsFile, JSON.stringify(userSessions, null, 2))
}

function accountFolder(uuid) {
  return path.join(dataRoot, "user_data", uuid.slice(0, 3), uuid)
}

function readAccount(uuid) {
  return JSON.parse(fs.readFileSync(path.join(accountFolder(uuid), "index.json"), "utf8"))
}

function saveAccount(account) {
  fs.writeFileSync(path.join(accountFolder(account.uuid), "index.json"), JSON.stringify(account, null, 2))
}

function ensureAccount(email) {
  const session = userSessions[email]
  if (!session.uuid) { session.uuid = uuidv4(); saveSessions() }
  const folder = accountFolder(session.uuid)
  fs.mkdirSync(path.join(folder, "uploads"), { recursive: true })
  if (!fs.existsSync(path.join(folder, "index.json"))) {
    saveAccount({ uuid: session.uuid, email, uploads: [] })
  }
  return session.uuid
}

function userForToken(token) {
  if (typeof token !== "string" || !token) return null
  return legit_users.find(email =>
    userSessions[email].magicLink === token &&
    Number(userSessions[email].stampCreate) + sessionLength > Date.now()
  ) || null
}

function authenticateUser(request) {
  const header = request.headers.authorization || ""
  const email = userForToken(header.startsWith("Bearer ") ? header.slice(7) : "")
  return email ? { email, uuid: ensureAccount(email) } : null
}

const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: { user: process.env.SMTP_LOGIN, pass: process.env.SMTP_PASSW }
})

fastify.register(require("@fastify/static"), { root: path.join(__dirname, "public") })
fastify.register(require("@fastify/view"), {
  engine: { handlebars: require("handlebars") },
  root: path.join(__dirname, "src", "pages")
})
fastify.register(require("@fastify/multipart"), {
  limits: { files: 1, fileSize: 20 * 1024 * 1024 }
})
fastify.register(require("@fastify/formbody"))

const seo = { ...require("./src/seo.json"), url: publicUrl }
fastify.get("/", (req, rep) => rep.view("index.hbs", { seo }))

// ── Auth ────────────────────────────────────────────────────────────────────

fastify.post("/api/magicLink", async (req, rep) => {
  const emailAddr = typeof req.body?.emailAddr === "string" ? req.body.emailAddr.trim() : ""
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailAddr))
    return rep.code(400).send({ error: "Enter a valid email address." })
  if (!Object.prototype.hasOwnProperty.call(userSessions, emailAddr)) {
    userSessions[emailAddr] = { uuid: uuidv4() }
    legit_users.push(emailAddr)
  }
  userSessions[emailAddr].magicLink = uuidv4()
  userSessions[emailAddr].stampCreate = Date.now()
  saveSessions()
  const link = new URL(publicUrl)
  link.searchParams.set("mlk", userSessions[emailAddr].magicLink)
  try {
    await transporter.sendMail({
      from: process.env.TEST_SENDER,
      to: emailAddr,
      subject: "Sign in to Scorify",
      text: `Sign in to Scorify:\n${link}\n\n(Valid for 30 minutes.)`
    })
    return { msg: "Check your email for your sign-in link." }
  } catch (err) {
    console.error("Email failed", { code: err.code, responseCode: err.responseCode })
    return rep.code(502).send({ error: "Could not send email. Check server settings." })
  }
})

fastify.post("/api/auth", async (req, rep) => {
  const email = userForToken(req.body?.magicLink)
  if (!email) return rep.code(401).send({ error: "Invalid or expired link." })
  return { msg: "Signed in.", authToken: req.body.magicLink, uuid: ensureAccount(email) }
})

// ── MusicXML upload ─────────────────────────────────────────────────────────

fastify.post("/api/upload", async (req, rep) => {
  const user = authenticateUser(req)
  if (!user) return rep.code(401).send({ error: "Please sign in." })
  const file = await req.file()
  if (!file) return rep.code(400).send({ error: "No file supplied." })
  const ext = path.extname(file.filename).toLowerCase()
  if (ext !== ".xml" && ext !== ".musicxml") {
    file.file.resume()
    return rep.code(400).send({ error: "Upload a .xml or .musicxml file." })
  }
  const uploadDir = path.join(accountFolder(user.uuid), "uploads")
  await fs.promises.mkdir(uploadDir, { recursive: true })
  const filename = uuidv4() + ext
  const filepath = path.join(uploadDir, filename)
  try {
    await pipeline(file.file, fs.createWriteStream(filepath))
    const account = readAccount(user.uuid)
    account.uploads.push({ filename, name: path.basename(file.filename) })
    saveAccount(account)
  } catch (err) {
    await fs.promises.unlink(filepath).catch(() => {})
    throw err
  }
  return { success: true, filename, name: path.basename(file.filename),
    scoreUrl: `/api/score/${user.uuid}/${filename}` }
})

// List this user's uploaded scores.
fastify.get("/api/scores", async (req, rep) => {
  const user = authenticateUser(req)
  if (!user) return rep.code(401).send({ error: "Please sign in." })
  const account = readAccount(user.uuid)
  return account.uploads.map(f => ({
    filename: f.filename,
    name: f.name,
    scoreUrl: `/api/score/${user.uuid}/${f.filename}`
  }))
})

// Serve a MusicXML file.
fastify.get("/api/score/:userId/:filename", async (req, rep) => {
  if (!authenticateUser(req)) return rep.code(401).send({ error: "Please sign in." })
  const { userId, filename } = req.params
  if (!/^[0-9a-f-]{36}$/.test(userId) ||
      !/^[0-9a-f-]{36}\.(xml|musicxml)$/.test(filename))
    return rep.code(404).send({ error: "Not found." })
  const filepath = path.join(accountFolder(userId), "uploads", filename)
  if (!fs.existsSync(filepath)) return rep.code(404).send({ error: "Not found." })
  rep.header("Content-Type", "application/xml")
  rep.header("Cache-Control", "private, no-store")
  return rep.send(fs.createReadStream(filepath))
})

// ── Job queue (UI-side) ──────────────────────────────────────────────────────
// The 2nd server polls /api/jobs and pings /api/jobComplete when done.

const JOBS_SIG = process.env.JOBS_SIG || "scorify-secret"

// 2nd server polls this to get pending jobs.
fastify.get("/api/jobs", (req, rep) => {
  if (req.query.sig !== JOBS_SIG) return rep.code(403).send({ error: "Forbidden." })
  const jobs = JSON.parse(fs.readFileSync(jobsFile, "utf8"))
  const pending = Object.values(jobs).filter(j => j.status === "pending")
  return rep.send({ jobs: pending })
})

// Browser submits a job: POST /api/analyze { filename, userId }
fastify.post("/api/analyze", async (req, rep) => {
  const user = authenticateUser(req)
  if (!user) return rep.code(401).send({ error: "Please sign in." })
  const { filename } = req.body || {}
  if (!filename) return rep.code(400).send({ error: "filename required." })
  const filepath = path.join(accountFolder(user.uuid), "uploads", filename)
  if (!fs.existsSync(filepath)) return rep.code(404).send({ error: "File not found." })
  const jobId = uuidv4()
  const jobs = JSON.parse(fs.readFileSync(jobsFile, "utf8"))
  jobs[jobId] = {
    jobId,
    userId: user.uuid,
    filename,
    scoreUrl: `${publicUrl}/api/score/${user.uuid}/${filename}`,
    status: "pending",
    createdAt: Date.now()
  }
  fs.writeFileSync(jobsFile, JSON.stringify(jobs, null, 2))
  // Long-poll: wait up to 5 min for the 2nd server to complete the job.
  const start = Date.now()
  while (Date.now() - start < 300000) {
    await new Promise(r => setTimeout(r, 4000))
    const current = JSON.parse(fs.readFileSync(jobsFile, "utf8"))
    if (current[jobId]?.status === "complete") {
      return rep.send({ jobId, analysisUrl: current[jobId].analysisUrl })
    }
    if (current[jobId]?.status === "error") {
      return rep.code(500).send({ error: current[jobId].errorMsg || "Analysis failed." })
    }
  }
  return rep.code(504).send({ error: "Analysis timed out. Try again later." })
})

// 2nd server pings this when analysis is done.
fastify.get("/api/jobComplete", (req, rep) => {
  if (req.query.sig !== JOBS_SIG) return rep.code(403).send({ error: "Forbidden." })
  const { jobId, analysisUrl, error: errMsg } = req.query
  const jobs = JSON.parse(fs.readFileSync(jobsFile, "utf8"))
  if (!jobs[jobId]) return rep.code(404).send({ error: "Job not found." })
  if (errMsg) {
    jobs[jobId].status = "error"
    jobs[jobId].errorMsg = errMsg
  } else {
    jobs[jobId].status = "complete"
    jobs[jobId].analysisUrl = analysisUrl
  }
  fs.writeFileSync(jobsFile, JSON.stringify(jobs, null, 2))
  return rep.send({ msg: "Updated." })
})

// 2nd server posts the finished analysis file here so we can serve it.
fastify.post("/api/storeAnalysis", async (req, rep) => {
  if (req.headers["x-job-sig"] !== JOBS_SIG) return rep.code(403).send({ error: "Forbidden." })
  const parts = req.parts()
  let jobId, userId, filename, fileBuffer
  for await (const part of parts) {
    if (part.type === "file") {
      const chunks = []
      for await (const chunk of part.file) chunks.push(chunk)
      fileBuffer = Buffer.concat(chunks)
    } else {
      if (part.fieldname === "jobId")    jobId    = part.value
      if (part.fieldname === "userId")   userId   = part.value
      if (part.fieldname === "filename") filename = part.value
    }
  }
  if (!userId || !filename || !fileBuffer) return rep.code(400).send({ error: "Missing fields." })
  const analysisDir = path.join(accountFolder(userId), "analysis")
  await fs.promises.mkdir(analysisDir, { recursive: true })
  await fs.promises.writeFile(path.join(analysisDir, filename), fileBuffer)
  return rep.send({ ok: true })
})

// Serve analysis result XML from /mount.
fastify.get("/api/analysis/:userId/:filename", async (req, rep) => {
  if (!authenticateUser(req)) return rep.code(401).send({ error: "Please sign in." })
  const { userId, filename } = req.params
  const filepath = path.join(accountFolder(userId), "analysis", filename)
  if (!fs.existsSync(filepath)) return rep.code(404).send({ error: "Not found." })
  rep.header("Content-Type", "application/xml")
  return rep.send(fs.createReadStream(filepath))
})

if (require.main === module) {
  fastify.listen({ port: Number(process.env.PORT || 3000), host: "0.0.0.0" }, (err, address) => {
    if (err) { console.error(err); process.exit(1) }
    console.log(`Scorify listening on ${address}`)
  })
}
module.exports = fastify
