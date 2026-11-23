// Scorify 2nd-server – runs on woodforde via tmux.
// Polls the UI server every 30 s for pending ChordGNN jobs, runs analysis, pings back.
require("dotenv").config()
const { execSync } = require("child_process")
const fs = require("fs")
const path = require("path")

const UI_BASE   = process.env.UI_BASE_URL   // e.g. https://scorify.onrender.com
const JOBS_SIG  = process.env.JOBS_SIG      // must match server.js JOBS_SIG
const WORK_DIR  = process.env.WORK_DIR || path.join(process.env.HOME, "scorify_jobs")
const CHORDGNN  = process.env.CHORDGNN_DIR  // path to cloned chordgnn repo

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

    // Filter jobs we haven't processed yet
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

  const inputPath  = path.join(jobDir, "input.musicxml")
  const outputBase = path.join(jobDir, "input-analysis")
  const outputPath = outputBase + ".musicxml"

  try {
    // 1. Download the MusicXML from the UI server
    execSync(
      `curl -sf -H "X-Job-Sig: ${JOBS_SIG}" "${job.scoreUrl}" -o "${inputPath}"`,
      { encoding: "utf-8" }
    )
    console.log(`[job] Downloaded score for ${job.jobId}`)

    // 2. Run ChordGNN
    const cmd = [
      `eval "$(conda shell.bash hook)"`,
      `conda activate chordgnn`,
      `cd "${CHORDGNN}"`,
      `python analyse_score.py --score_path "${inputPath}"`,
      `conda deactivate`
    ].join("\n")

    execSync(cmd, { encoding: "utf-8", shell: "/bin/bash" })
    console.log(`[job] ChordGNN done for ${job.jobId}`)

    // ChordGNN saves output as <input_stem>-analysis.musicxml in same dir.
    // The script saves next to the input file, so copy it back.
    const chordgnnOut = path.join(CHORDGNN, "input-analysis.musicxml")
    if (fs.existsSync(chordgnnOut)) {
      fs.copyFileSync(chordgnnOut, outputPath)
      fs.unlinkSync(chordgnnOut)
    } else if (!fs.existsSync(outputPath)) {
      throw new Error("ChordGNN did not produce output file.")
    }

    // 3. Upload result back to UI server's /mount via scp or HTTP PUT
    // Here we POST it as a multipart file to the UI server's internal store endpoint.
    const analysisFilename = `${job.filename.replace(/\.musicxml?$/, "")}-analysis.musicxml`
    execSync(
      `curl -sf -X POST "${UI_BASE}/api/storeAnalysis" ` +
      `-H "X-Job-Sig: ${JOBS_SIG}" ` +
      `-F "jobId=${job.jobId}" ` +
      `-F "userId=${job.userId}" ` +
      `-F "filename=${analysisFilename}" ` +
      `--form-string "file=@${outputPath};type=application/xml"`,
      { encoding: "utf-8" }
    )

    // 4. Ping jobComplete
    const analysisUrl = `${UI_BASE}/api/analysis/${job.userId}/${analysisFilename}`
    execSync(
      `curl -sf "${UI_BASE}/api/jobComplete?sig=${JOBS_SIG}&jobId=${job.jobId}&analysisUrl=${encodeURIComponent(analysisUrl)}"`,
      { encoding: "utf-8" }
    )
    console.log(`[job] Complete: ${job.jobId}`)

  } catch (err) {
    console.error(`[job] Failed ${job.jobId}:`, err.message)
    // Notify UI server of error so the browser gets unblocked
    try {
      execSync(
        `curl -sf "${UI_BASE}/api/jobComplete?sig=${JOBS_SIG}&jobId=${job.jobId}&error=${encodeURIComponent(err.message)}"`,
        { encoding: "utf-8" }
      )
    } catch (_) {}
  } finally {
    // Clean up job working dir
    fs.rmSync(jobDir, { recursive: true, force: true })
  }
}
