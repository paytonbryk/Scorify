// Scorify 2nd-server – runs on woodforde via tmux.
// Polls the UI server every 30 s for pending analysisgnn jobs, runs analysis, pings back.
require("dotenv").config()
const { execSync } = require("child_process")
const fs = require("fs")
const path = require("path")

const UI_BASE   = process.env.UI_BASE_URL   // e.g. https://scorify.onrender.com
const JOBS_SIG  = process.env.JOBS_SIG      // must match server.js JOBS_SIG
const WORK_DIR  = process.env.WORK_DIR || path.join(process.env.HOME, "scorify_jobs")
const CHORDGNN  = process.env.CHORDGNN_DIR  // path to run_analysis.py (e.g. ~/chordgnn)

const seenJobs = new Set()

fs.mkdirSync(WORK_DIR, { recursive: true })
console.log(`Scorify 2nd-server started. Polling ${UI_BASE} every 30s…`)

setInterval(runCycle, 30000)
runCycle()  // run immediately on start

async function runCycle() {
  try {
    console.log("[poll] Checking for jobs…")
    const resStr = execSync(
      `curl -sf "${UI_BASE}/api/jobs?sig=${JOBS_SIG}"`,
      { encoding: "utf-8" }
    )
    const { jobs } = JSON.parse(resStr)
    if (!jobs?.length) return console.log("[poll] No pending jobs.")

    const newJobs = jobs.filter(j => !seenJobs.has(j.jobId))
    console.log(`[poll] ${newJobs.length} new job(s).`)
    newJobs.forEach(processJob)
  } catch (err) {
    console.error("[poll] Error:", err.message)
  }
}

function processJob(job) {
  seenJobs.add(job.jobId)
  console.log(`[job] Starting ${job.jobId} – ${job.filename}`)

  const jobDir = path.join(WORK_DIR, job.jobId)
  fs.mkdirSync(jobDir, { recursive: true })

  // run_analysis.py derives output paths from the input stem
  const inputPath  = path.join(jobDir, "input.musicxml")
  const outputXml  = path.join(jobDir, "input-analysis.musicxml")
  const outputCsv  = path.join(jobDir, "input-analysis.csv")

  try {
    // 1. Download the MusicXML from the UI server
    execSync(
      `curl -sf -H "X-Job-Sig: ${JOBS_SIG}" "${job.scoreUrl}" -o "${inputPath}"`,
      { encoding: "utf-8" }
    )
    console.log(`[job] Downloaded score for ${job.jobId}`)

    // 2. Run analysisgnn wrapper
    const cmd = [
      `eval "$(conda shell.bash hook)"`,
      `conda activate chordgnn39`,
      `python "${path.join(CHORDGNN, "run_analysis.py")}" --score_path "${inputPath}"`,
    ].join(" && ")

    execSync(cmd, {
      encoding: "utf-8",
      shell: "/bin/bash",
      timeout: 5 * 60 * 1000,   // 5-minute cap
      stdio: "inherit"
    })
    console.log(`[job] Analysis done for ${job.jobId}`)

    // 3. Decide which output file to upload (prefer annotated MusicXML, fall back to CSV)
    let uploadPath, uploadType, uploadExt
    if (fs.existsSync(outputXml)) {
      uploadPath = outputXml
      uploadType = "application/xml"
      uploadExt  = "-analysis.musicxml"
    } else if (fs.existsSync(outputCsv)) {
      uploadPath = outputCsv
      uploadType = "text/csv"
      uploadExt  = "-analysis.csv"
    } else {
      throw new Error("run_analysis.py did not produce an output file.")
    }

    const analysisFilename = job.filename.replace(/\.musicxml?$/i, "") + uploadExt

    // 4. POST result to UI server
    execSync(
      `curl -sf -X POST "${UI_BASE}/api/storeAnalysis" ` +
      `-H "X-Job-Sig: ${JOBS_SIG}" ` +
      `-F "jobId=${job.jobId}" ` +
      `-F "userId=${job.userId}" ` +
      `-F "filename=${analysisFilename}" ` +
      `--form-string "file=@${uploadPath};type=${uploadType}"`,
      { encoding: "utf-8" }
    )

    // 5. Ping jobComplete
    const analysisUrl = `${UI_BASE}/api/analysis/${job.userId}/${analysisFilename}`
    execSync(
      `curl -sf "${UI_BASE}/api/jobComplete?sig=${JOBS_SIG}&jobId=${job.jobId}&analysisUrl=${encodeURIComponent(analysisUrl)}"`,
      { encoding: "utf-8" }
    )
    console.log(`[job] Complete: ${job.jobId}`)

  } catch (err) {
    console.error(`[job] Failed ${job.jobId}:`, err.message)
    try {
      execSync(
        `curl -sf "${UI_BASE}/api/jobComplete?sig=${JOBS_SIG}&jobId=${job.jobId}&error=${encodeURIComponent(err.message)}"`,
        { encoding: "utf-8" }
      )
    } catch (_) {}
  } finally {
    fs.rmSync(jobDir, { recursive: true, force: true })
  }
}
