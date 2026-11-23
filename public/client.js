/* ============================================================
   Scorify – client.js
   MusicXML → Composition object → VexFlow render + Tone.js playback
   + ChordGNN analysis via 2nd-server job queue
   ============================================================ */

// ── State ─────────────────────────────────────────────────────────────────
let authToken = sessionStorage.getItem("scorify_token") || null
let currentComposition = null   // parsed Composition object
let transport = null            // Tone.Transport handle
let scheduledEvents = []        // Tone event IDs for cleanup

// ── DOM refs ──────────────────────────────────────────────────────────────
const authSection   = document.getElementById("authSection")
const appSection    = document.getElementById("appSection")
const authStatus    = document.getElementById("authStatus")
const userLabel     = document.getElementById("userLabel")
const emailForm     = document.getElementById("emailForm")
const emailInput    = document.getElementById("emailAddr")
const uploadStatus  = document.getElementById("uploadStatus")
const scoreList     = document.getElementById("scoreList")
const viewerSection = document.getElementById("viewerSection")
const scoreTitle    = document.getElementById("scoreTitle")
const scoreCanvas   = document.getElementById("scoreCanvas")
const viewerStatus  = document.getElementById("viewerStatus")
const analysisSection = document.getElementById("analysisSection")
const analysisResult  = document.getElementById("analysisResult")

// ── Init ──────────────────────────────────────────────────────────────────
window.addEventListener("DOMContentLoaded", async () => {
  // Handle magic-link token in URL
  const params = new URLSearchParams(location.search)
  const mlk = params.get("mlk")
  if (mlk) {
    history.replaceState({}, "", "/")
    const res = await apiFetch("/api/auth", "POST", { magicLink: mlk })
    if (res.authToken) {
      authToken = res.authToken
      sessionStorage.setItem("scorify_token", authToken)
    } else {
      setStatus(authStatus, res.error || "Link invalid.", true)
    }
  }
  if (authToken) showApp()
})

// ── Auth ──────────────────────────────────────────────────────────────────
emailForm.addEventListener("submit", async e => {
  e.preventDefault()
  setStatus(authStatus, "Sending…")
  const res = await apiFetch("/api/magicLink", "POST", { emailAddr: emailInput.value })
  setStatus(authStatus, res.msg || res.error, !!res.error)
})

document.getElementById("signOutBtn").addEventListener("click", () => {
  authToken = null
  sessionStorage.removeItem("scorify_token")
  appSection.hidden = true
  authSection.hidden = false
})

// ── Upload ────────────────────────────────────────────────────────────────
document.getElementById("uploadBtn").addEventListener("click", async () => {
  const fileInput = document.getElementById("xmlFile")
  if (!fileInput.files.length) return setStatus(uploadStatus, "Choose a file first.", true)
  const form = new FormData()
  form.append("file", fileInput.files[0])
  setStatus(uploadStatus, "Uploading…")
  const res = await fetch("/api/upload", {
    method: "POST",
    headers: { Authorization: `Bearer ${authToken}` },
    body: form
  }).then(r => r.json())
  if (res.error) return setStatus(uploadStatus, res.error, true)
  setStatus(uploadStatus, `Uploaded: ${res.name}`, false)
  loadScoreList()
})

// ── Score list ────────────────────────────────────────────────────────────
async function loadScoreList() {
  const scores = await apiFetch("/api/scores", "GET")
  if (!Array.isArray(scores)) return
  scoreList.innerHTML = ""
  scores.forEach(score => {
    const li = document.createElement("li")
    li.innerHTML = `<span class="score-name">${esc(score.name)}</span>`
    li.addEventListener("click", () => openScore(score))
    scoreList.appendChild(li)
  })
}

// ── Open & render a score ─────────────────────────────────────────────────
let currentScore = null  // { filename, name, scoreUrl }

async function openScore(score) {
  currentScore = score
  stopPlayback()
  viewerSection.hidden = false
  analysisSection.hidden = true
  analysisResult.textContent = ""
  scoreTitle.textContent = score.name
  setStatus(viewerStatus, "Loading MusicXML…")

  // Highlight active item in list
  document.querySelectorAll("#scoreList li").forEach(li => {
    li.classList.toggle("active", li.querySelector(".score-name").textContent === score.name)
  })

  try {
    const xml = await fetch(score.scoreUrl, {
      headers: { Authorization: `Bearer ${authToken}` }
    }).then(r => r.text())

    currentComposition = parseMusicXML(xml)
    renderScore(currentComposition)
    setStatus(viewerStatus, "Ready. Press Play to hear it.")
  } catch (err) {
    console.error("Load error:", err.message, err.stack)
    setStatus(viewerStatus, `Error loading score: ${err.message}`, true)
  }
}

// ── Play / Stop ───────────────────────────────────────────────────────────
document.getElementById("playBtn").addEventListener("click", playScore)
document.getElementById("stopBtn").addEventListener("click", stopPlayback)

async function playScore() {
  if (!currentComposition) return setStatus(viewerStatus, "Open a score first.", true)
  stopPlayback()
  await Tone.context.resume()
  transport = Tone.Transport
  transport.cancel()
  transport.stop()

  const { notes, tempi } = currentComposition

  // Set initial tempo
  const sortedTempi = [...tempi].sort((a, b) => a.ontime - b.ontime)
  transport.bpm.value = sortedTempi[0]?.bpm || 120
  transport.timeSignature = 4  // internal; all ontimes are quarter-note beats

  // Schedule tempo changes
  sortedTempi.forEach(t => {
    if (t.ontime > 0) {
      const id = transport.schedule(time => {
        transport.bpm.setValueAtTime(t.bpm, time)
      }, `${Math.round(t.ontime * transport.PPQ)}i`)
      scheduledEvents.push(id)
    }
  })

  // Build one PolySynth per staff
  const synths = new Map()
  notes.forEach(note => {
    if (!note.pitch) return
    if (!synths.has(note.staffNo)) {
      const synth = new Tone.PolySynth(16, Tone.Synth).toMaster()
      synth.volume.value = -16
      synths.set(note.staffNo, synth)
    }
  })

  const startBeat = Math.min(0, ...notes.map(n => n.ontime))

  // Schedule every note using Tone.Transport.schedule()
  notes.forEach(note => {
    if (!note.pitch) return
    const synth = synths.get(note.staffNo)
    const onTick  = `${Math.round((note.ontime  - startBeat) * transport.PPQ)}i`
    const durTick  = `${Math.round(Math.max(0.01, note.duration) * transport.PPQ)}i`
    const id = transport.schedule(time => {
      synth.triggerAttackRelease(note.pitch, durTick, time, 0.7)
    }, onTick)
    scheduledEvents.push(id)
  })

  // Schedule stop at end
  const endBeat = Math.max(...notes.map(n => n.offtime), 0)
  const endId = transport.schedule(() => stopPlayback(), `${Math.round((endBeat - startBeat + 0.5) * transport.PPQ)}i`)
  scheduledEvents.push(endId)

  transport.start("+0.05", 0)
  setStatus(viewerStatus, "Playing…")
}

function stopPlayback() {
  if (transport) {
    transport.stop()
    scheduledEvents.forEach(id => transport.clear(id))
    scheduledEvents = []
  }
  setStatus(viewerStatus, "")
}

// ── ChordGNN analysis ─────────────────────────────────────────────────────
document.getElementById("analyseBtn").addEventListener("click", async () => {
  if (!currentScore) return setStatus(viewerStatus, "Open a score first.", true)
  setStatus(viewerStatus, "Submitting to ChordGNN… (may take 1–2 min)")
  document.getElementById("analyseBtn").disabled = true

  const res = await apiFetch("/api/analyze", "POST", { filename: currentScore.filename })
  document.getElementById("analyseBtn").disabled = false

  if (res.error) return setStatus(viewerStatus, res.error, true)

  // Fetch the annotated analysis XML and display Roman numerals
  try {
    const xml = await fetch(res.analysisUrl, {
      headers: { Authorization: `Bearer ${authToken}` }
    }).then(r => r.text())
    displayAnalysis(xml)
    analysisSection.hidden = false
    setStatus(viewerStatus, "Analysis complete.")
  } catch (err) {
    setStatus(viewerStatus, "Analysis done but could not fetch result.", true)
  }
})

// Extract and display Roman numeral annotations from ChordGNN output XML
function displayAnalysis(xmlText) {
  const parser = new DOMParser()
  const doc = parser.parseFromString(xmlText, "application/xml")
  // ChordGNN adds <harmony> elements with <kind> and Roman numeral text
  const harmonies = [...doc.querySelectorAll("harmony")]
  if (!harmonies.length) {
    analysisResult.textContent = "No harmonic annotations found in result."
    return
  }
  // Build a table of measure → Roman numeral
  const rows = harmonies.map(h => {
    const measure = h.closest("measure")?.getAttribute("number") || "?"
    const root   = h.querySelector("root > root-step")?.textContent || ""
    const kind   = h.querySelector("kind")?.textContent || ""
    // ChordGNN stores its RNA in a <function> or text node; grab whatever text is there
    const text   = h.querySelector("function")?.textContent
                || h.querySelector("kind")?.getAttribute("text")
                || `${root} ${kind}`
    return `  m.${measure.padStart(3)}: ${text}`
  })
  analysisResult.textContent = rows.join("\n")
}

// ── MusicXML → Composition ────────────────────────────────────────────────
// Adapted from maia_vex.js (professor's parser) using JavaScript array functions.

function parseMusicXML(xmlText) {
  const parser = new DOMParser()
  const doc = parser.parseFromString(xmlText, "application/xml")

  // ── Helpers ──────────────────────────────────────────────────────────
  const text  = (el, sel) => el?.querySelector(sel)?.textContent?.trim() || ""
  const num   = (el, sel) => parseFloat(text(el, sel)) || 0

  // ── Divisions (ticks per quarter note) ───────────────────────────────
  const divEl = doc.querySelector("divisions")
  const divisions = divEl ? parseInt(divEl.textContent) : 1

  // ── Time signatures ───────────────────────────────────────────────────
  const timeSignatures = [...doc.querySelectorAll("time")].map((ts, i) => ({
    topNo: num(ts, "beats"),
    bottomNo: num(ts, "beat-type"),
    ontime: 0  // simplified: all from beat 0 (extend if needed)
  }))
  if (!timeSignatures.length) timeSignatures.push({ topNo: 4, bottomNo: 4, ontime: 0 })

  // ── Key signatures ────────────────────────────────────────────────────
  const keySignatures = [...doc.querySelectorAll("key")].map(k => ({
    fifths: num(k, "fifths"),
    mode: text(k, "mode") || "major",
    ontime: 0
  }))
  if (!keySignatures.length) keySignatures.push({ fifths: 0, mode: "major", ontime: 0 })

  // ── Tempi ─────────────────────────────────────────────────────────────
  const tempi = [...doc.querySelectorAll("sound[tempo]")].map(s => ({
    bpm: parseFloat(s.getAttribute("tempo")),
    ontime: 0
  })).filter(t => t.bpm > 0)
  if (!tempi.length) tempi.push({ bpm: 120, ontime: 0 })

  // ── Stave layers ──────────────────────────────────────────────────────
  const partIds = [...doc.querySelectorAll("part")].map(p => p.getAttribute("id"))
  const layer = partIds.map((id, i) => ({
    staffNo: i + 1,
    partId: id,
    vexflow: {}
  }))

  // ── Notes and rests ───────────────────────────────────────────────────
  // Walk every <part> → <measure> → <note>, tracking cumulative beat position.
  const notes = []
  const rests = []

  doc.querySelectorAll("part").forEach((part, partIndex) => {
    const staffNo = partIndex + 1
    let beatCursor = 0  // quarter-note beats from start of piece

    // Array.from + .forEach uses JS array functions as required
    Array.from(part.querySelectorAll("measure")).forEach(measure => {
      let measureCursor = beatCursor

      Array.from(measure.querySelectorAll("note")).forEach(note => {
        const isChord    = !!note.querySelector("chord")
        const isRest     = !!note.querySelector("rest")
        const durationTicks = num(note, "duration")
        const durationBeats = durationTicks / divisions
        const voiceNo    = parseInt(text(note, "voice")) || 1

        const ontime  = isChord ? measureCursor - durationBeats : measureCursor
        const offtime = ontime + durationBeats

        if (!isChord) measureCursor += durationBeats

        const durationType = text(note, "type") || "quarter"
        const dotCount = note.querySelectorAll("dot").length

        if (isRest) {
          rests.push({
            ontime, offtime, duration: durationBeats,
            barOn: 0, barOff: 0, beatOn: ontime, beatOff: offtime,
            staffNo, voiceNo,
            durationType, dotCount
          })
        } else {
          // Pitch: e.g. C4, F#5
          const step    = text(note, "step")
          const octave  = text(note, "octave")
          const alter   = num(note, "alter")  // -1=flat, 0=natural, 1=sharp
          const accidental = alter === 1 ? "#" : alter === -1 ? "b" : ""
          const pitch   = step && octave ? `${step}${accidental}${octave}` : null

          notes.push({
            ontime, offtime, duration: durationBeats,
            barOn: 0, barOff: 0, beatOn: ontime, beatOff: offtime,
            staffNo, voiceNo,
            pitch,
            durationType, dotCount
          })
        }
      })

      // Advance cursor by the measure's worth of beats (top/bottom time sig)
      const ts = timeSignatures[0]
      const measureBeats = ts.topNo * (4 / ts.bottomNo)
      beatCursor += measureBeats
    })
  })

  // ── Page layout (required by Composition schema) ──────────────────────
  const pageLayout = {
    pageWidth: 1200, pageHeight: 1700,
    margins: { left: 70, right: 70, top: 88, bottom: 88 }
  }
  const miscXML = { anacrusis: 0 }

  // ── Sequencing (no repeats for now) ──────────────────────────────────
  const sequencing = []

  // ── Clef changes ─────────────────────────────────────────────────────
  const clefChanges = [...doc.querySelectorAll("clef")].map(c => ({
    sign: text(c, "sign"),
    line: num(c, "line"),
    ontime: 0,
    staffNo: parseInt(c.getAttribute("number")) || 1
  }))

  return {
    name: text(doc, "work-title") || text(doc, "movement-title") || "Untitled",
    layer, notes, rests,
    timeSignatures, keySignatures, tempi,
    clefChanges,
    expressions: [],
    sequencing,
    pageLayout,
    miscXML
  }
}

// ── VexFlow renderer ──────────────────────────────────────────────────────
function renderScore(composition) {
  const { notes, rests, timeSignatures, keySignatures, clefChanges } = composition

  const W = scoreCanvas.parentElement.clientWidth || 860
  scoreCanvas.width  = W
  scoreCanvas.height = 300

  const VF = Vex.Flow
  const renderer = new VF.Renderer(scoreCanvas, VF.Renderer.Backends.CANVAS)
  renderer.resize(W, 300)
  const ctx = renderer.getContext()
  ctx.clearRect(0, 0, W, 300)

  const stave = new VF.Stave(10, 40, W - 20)
  const clef = clefChanges.find(c => c.staffNo === 1)
  stave.addClef(clef ? clef.sign.toLowerCase() : "treble")
  const ts = timeSignatures[0]
  if (ts) stave.addTimeSignature(`${ts.topNo}/${ts.bottomNo}`)
  const ks = keySignatures[0]
  if (ks) stave.addKeySignature(fifthsToKey(ks.fifths, ks.mode))
  stave.setContext(ctx).draw()

  // Gather staff 1 notes from first measure only
  const beatsPerMeasure = ts ? (ts.topNo * (4 / ts.bottomNo)) : 4
  const staff1 = [...notes.filter(n => n.staffNo === 1 && n.pitch),
                   ...rests.filter(r => r.staffNo === 1)]
    .sort((a, b) => a.ontime - b.ontime)
    .filter(evt => evt.ontime < beatsPerMeasure)

  // Build VexFlow notes — wrap each construction so one bad note can't crash all
  const vfNotes = []
  for (const evt of staff1) {
    try {
      const dur = durationTypeToVF(evt.durationType)
      const dots = evt.dotCount || 0
      const isRest = !evt.pitch
      const key = isRest ? "b/4" : pitchToVFKey(evt.pitch)
      const durStr = isRest ? dur + "r" : dur
      const vfNote = new VF.StaveNote({ clef: "treble", keys: [key], duration: durStr })
      for (let d = 0; d < dots; d++) {
        if (vfNote.addDotToAll) vfNote.addDotToAll()
      }
      vfNotes.push(vfNote)
    } catch (e) {
      console.warn("Skipping note:", evt.durationType, evt.pitch || "rest", e.message)
    }
  }

  if (!vfNotes.length) {
    console.warn("VexFlow: no valid notes in first measure — drawing stave only")
    return
  }

  try {
    const numBeats = ts ? ts.topNo : 4
    const beatValue = ts ? ts.bottomNo : 4
    const voice = new VF.Voice({ num_beats: numBeats, beat_value: beatValue })
      .setMode(VF.Voice.Mode.SOFT)
    voice.addTickables(vfNotes)
    new VF.Formatter().joinVoices([voice]).format([voice], W - 80)
    voice.draw(ctx, stave)
  } catch (e) {
    console.error("VexFlow formatter error:", e.message)
  }
}

// ── VexFlow helpers ───────────────────────────────────────────────────────
function pitchToVFKey(pitch) {
  // "C#4" → "c#/4", "Bb3" → "bb/3"
  const m = pitch.match(/^([A-G])(#|b)?(\d+)$/)
  if (!m) return "b/4"
  return `${m[1].toLowerCase()}${m[2] || ""}/${m[3]}`
}

function durationTypeToVF(type) {
  const map = { whole: "w", half: "h", quarter: "q", eighth: "8",
    "16th": "16", "32nd": "32", "64th": "64" }
  return map[type] || "q"
}

function fifthsToKey(fifths, mode) {
  const major = ["C","G","D","A","E","B","F#","C#","Cb","Gb","Db","Ab","Eb","Bb","F"]
  const minor = ["a","e","b","f#","c#","g#","d#","a#","ab","eb","bb","f","c","g","d"]
  const idx = ((fifths % 15) + 15) % 15
  return mode === "minor" ? minor[idx] : major[idx]
}

// ── Utilities ─────────────────────────────────────────────────────────────
async function apiFetch(url, method = "GET", body = null) {
  const opts = {
    method,
    headers: { "Content-Type": "application/json" }
  }
  if (authToken) opts.headers["Authorization"] = `Bearer ${authToken}`
  if (body) opts.body = JSON.stringify(body)
  const res = await fetch(url, opts)
  return res.json()
}

function setStatus(el, msg, isError = false) {
  el.textContent = msg || ""
  el.className = isError ? "error" : (msg ? "success" : "")
}

function esc(str) {
  return String(str).replace(/[&<>"']/g, c => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  }[c]))
}

function showApp() {
  authSection.hidden = true
  appSection.hidden  = false
  loadScoreList()
}
