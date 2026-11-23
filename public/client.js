/* ============================================================
   Scorify – client.js
   MusicXML → Composition object → OpenSheetMusicDisplay render + Tone.js playback
   + ChordGNN analysis via 2nd-server job queue
   ============================================================ */

// ── State ─────────────────────────────────────────────────────────────────
let authToken = localStorage.getItem("scorify_token") || null
let currentComposition = null   // parsed Composition object
let transport = null            // Tone.Transport handle
let scheduledEvents = []        // Tone event IDs for cleanup
let playbackNodes = []          // Synths and effects owned by the current playback
let playbackRequest = 0         // Invalidates audio startup after Stop or another Play

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
const scoreContainer = document.getElementById("scoreContainer")
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
      localStorage.setItem("scorify_token", authToken)
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
  localStorage.removeItem("scorify_token")
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
    li.innerHTML = `<span class="score-name">${esc(score.name)}</span><button class="deleteBtn" title="Delete">✕</button>`
    li.querySelector(".score-name").addEventListener("click", () => openScore(score))
    li.querySelector(".deleteBtn").addEventListener("click", async e => {
      e.stopPropagation()
      if (!confirm(`Delete "${score.name}"?`)) return
      const res = await apiFetch(`/api/score/${score.filename}`, "DELETE")
      if (res.error) return alert(res.error)
      loadScoreList()
    })
    scoreList.appendChild(li)
  })
}


// ── Demo scores ───────────────────────────────────────────────────────────
document.querySelectorAll(".demo-score").forEach(el => {
  el.addEventListener("click", () => loadDemoScore(el.dataset.path, el.textContent))
})

async function loadDemoScore(path, name) {
  const version = ++scoreLoadVersion
  annotatedScoreXML = null
  document.getElementById("exportAnalysisBtn").disabled = true
  stopPlayback()
  currentComposition = null
  scoreDisplay?.clear()
  scoreDisplay = null
  scoreContainer.innerHTML = ""
  viewerSection.hidden = false
  analysisSection.hidden = true
  analysisResult.textContent = ""
  scoreTitle.textContent = name
  currentScore = { name, filename: null, scoreUrl: null, demoPath: path }
  setStatus(viewerStatus, "Loading…")

  document.querySelectorAll(".demo-score").forEach(el => {
    el.closest("li").classList.toggle("active", el.dataset.path === path)
  })

  try {
    const xml = await fetch(path).then(r => r.text())
    if (version !== scoreLoadVersion) return
    currentComposition = parseMusicXML(xml)
    await renderMusicXML(xml, version)
    if (version !== scoreLoadVersion) return
    updatePlayhead(0)
    setStatus(viewerStatus, "Ready. Press Play to hear it.")
  } catch (err) {
    setStatus(viewerStatus, `Error loading demo: ${err.message}`, true)
  }
}

// ── Open & render a score ─────────────────────────────────────────────────
let scoreDisplay = null
let scoreCursorKey = null
let playbackSpeed = 1
let annotatedScoreXML = null
let scoreLoadVersion = 0
let currentScore = null  // { filename, name, scoreUrl }

async function openScore(score) {
  currentScore = score
  const version = ++scoreLoadVersion
  annotatedScoreXML = null
  document.getElementById("exportAnalysisBtn").disabled = true
  stopPlayback()
  currentComposition = null
  scoreDisplay?.clear()
  scoreDisplay = null
  scoreContainer.innerHTML = ""
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

    if (version !== scoreLoadVersion) return
    currentComposition = parseMusicXML(xml)
    await renderMusicXML(xml, version)
    if (version !== scoreLoadVersion) return
    updatePlayhead(0)

    setStatus(viewerStatus, "Ready. Press Play to hear it.")
  } catch (err) {
    console.error("Load error:", err.message, err.stack)
    setStatus(viewerStatus, `Error loading score: ${err.message}`, true)
  }
}

// Load before replacing the current drawing, so a failed render can be retried.
async function renderMusicXML(xml, version = scoreLoadVersion) {
  const osmd = scoreDisplay || new opensheetmusicdisplay.OpenSheetMusicDisplay(scoreContainer, {
    autoResize: true, backend: "svg", drawTitle: true, drawComposer: true,
    drawingParameters: "default",
    cursorsOptions: [{ type: 1, color: "#c4701a", alpha: 0.9, follow: false }]
  })
  await osmd.load(xml)
  if (version !== scoreLoadVersion) return
  scoreDisplay = osmd
  osmd.render()
  scoreCursorKey = null
  document.getElementById("scoreViewport").scrollTop = 0
}

// ── Play / Stop ───────────────────────────────────────────────────────────
document.getElementById("playBtn").addEventListener("click", () => playScore())
document.getElementById("stopBtn").addEventListener("click", stopPlayback)

// Playhead state
let playheadRAF = null
let playStartBeat = 0

async function playScore(fromBeat = null) {
  try {
    await startPlayback(fromBeat)
  } catch (err) {
    stopPlayback()
    console.error("Playback error:", err)
    setStatus(viewerStatus, `Unable to play score: ${err.message}`, true)
  }
}

async function startPlayback(fromBeat = null) {
  if (!currentComposition) return setStatus(viewerStatus, "Open a score first.", true)
  stopPlayback()
  const request = playbackRequest
  await Tone.context.resume()
  if (request !== playbackRequest) return
  transport = Tone.Transport
  transport.cancel()
  transport.stop()

  const { notes, tempi } = currentComposition

  const validNotes = notes.filter(n => n.pitch && Number.isFinite(n.ontime) && Number.isFinite(n.offtime) && n.offtime > n.ontime)
  if (!validNotes.length) throw new Error("This score has no playable pitched notes.")
  playStartBeat = Number.isFinite(fromBeat) ? Math.max(0, fromBeat) : 0
  const sortedTempi = [...tempi].sort((a, b) => a.ontime - b.ontime)
  transport.bpm.value = (sortedTempi.filter(t => t.ontime <= playStartBeat).at(-1)?.bpm || 120) * playbackSpeed
  transport.timeSignature = 4

  sortedTempi.forEach(t => {
    if (t.ontime > playStartBeat && Number.isFinite(t.ontime) && t.bpm > 0) {
      const tickVal = Math.round((t.ontime - playStartBeat) * transport.PPQ)
      if (!isNaN(tickVal)) {
        const id = transport.schedule(time => {
          transport.bpm.setValueAtTime(t.bpm * playbackSpeed, time)
        }, `${tickVal}i`)
        scheduledEvents.push(id)
      }
    }
  })

  const synths = createPlaybackSynths(notes)

  const endBeat = validNotes.reduce((m, n) => Math.max(m, n.offtime), currentComposition.durationBeats || 0)

  // Schedule notes from playStartBeat onward
  validNotes.forEach(note => {
    if (!note.pitch || note.offtime <= playStartBeat) return
    if (isNaN(note.ontime) || isNaN(note.offtime)) return
    const synth = synths.get(note.staffNo)
    if (!synth) return
    const noteStart = Math.max(note.ontime, playStartBeat)
    const onTickVal  = Math.round((noteStart - playStartBeat) * transport.PPQ)
    // Duration must be in seconds inside a Transport callback, not ticks
    const durSecs = Math.max(0.01, playbackSeconds(noteStart, note.offtime, sortedTempi) / playbackSpeed)
    if (isNaN(onTickVal) || isNaN(durSecs)) return
    const onTick  = `${onTickVal}i`
    const id = transport.schedule(time => {
      synth.triggerAttackRelease(note.pitch, durSecs, time, 0.75)
    }, onTick)
    scheduledEvents.push(id)
  })

  const endTickVal = Math.round((endBeat - playStartBeat + 0.5) * transport.PPQ)
  const endId = transport.schedule(() => stopPlayback(), `${isNaN(endTickVal) ? 0 : endTickVal}i`)
  scheduledEvents.push(endId)

  transport.start("+0.05", 0)
  setStatus(viewerStatus, "Playing…")
  startPlayhead()
}

function createPlaybackSynths(notes) {
  // Piano-like triangle synth with a short attack and a decaying envelope.
  const limiter = new Tone.Limiter(-3).toMaster()
  playbackNodes.push(limiter)
  const reverb = new Tone.Freeverb(0.5, 2500).connect(limiter)
  playbackNodes.push(reverb)
  const vol = new Tone.Volume(-10).connect(reverb)
  playbackNodes.push(vol)
  const synths = new Map()
  notes.forEach(note => {
    if (!note.pitch) return
    if (!synths.has(note.staffNo)) {
      const synth = new Tone.PolySynth(16, Tone.Synth)
      playbackNodes.push(synth)
      synth.set({
        volume: -12,
        oscillator: { type: "triangle8" },
        envelope: { attack: 0.005, decay: 0.8, sustain: 0.1, release: 1.4 }
      })
      synth.connect(vol)
      synths.set(note.staffNo, synth)
    }
  })

  return synths
}

function playbackSeconds(start, end, tempi) {
  let bpm = 120, cursor = start, seconds = 0
  for (const tempo of tempi) {
    if (tempo.ontime <= start) bpm = tempo.bpm
    else if (tempo.ontime < end) {
      seconds += (tempo.ontime - cursor) * 60 / bpm
      cursor = tempo.ontime
      bpm = tempo.bpm
    }
  }
  return seconds + (end - cursor) * 60 / bpm
}

function scoreDurationBeats() {
  if (!currentComposition) return 0
  return currentComposition.notes.reduce((end, note) => Math.max(end, note.offtime), currentComposition.durationBeats || 0)
}

function currentPlaybackBeat() {
  return Math.min(scoreDurationBeats(), playStartBeat + (transport?.ticks || 0) / (transport?.PPQ || 192))
}

function updatePlayhead(beat) {
  const bar = document.getElementById("playheadBar")
  if (!bar || !currentComposition) return
  bar.style.display = "block"
  const tempi = [...currentComposition.tempi].sort((a, b) => a.ontime - b.ontime)
  const total = playbackSeconds(0, scoreDurationBeats(), tempi)
  const elapsed = Math.max(0, Math.min(total, playbackSeconds(0, beat, tempi)))
  document.getElementById("playheadFill").style.width = `${total > 0 ? elapsed / total * 100 : 0}%`
  document.getElementById("playheadTime").textContent = `${fmt(elapsed / playbackSpeed)} / ${fmt(total / playbackSpeed)}`
}

function updateScoreCursor(beat) {
  if (!scoreDisplay || !currentComposition?.measureTimeline) return
  const visit = currentComposition.measureTimeline.find(m => beat >= m.ontime && beat < m.offtime)
  if (!visit) return
  const measure = scoreDisplay.Sheet.SourceMeasures[visit.measureIndex]
  const offset = (beat - visit.ontime) / 4
  const entries = measure.VerticalSourceStaffEntryContainers
  let timestamp = new opensheetmusicdisplay.Fraction(0, 1)
  for (const entry of entries) {
    if (entry.Timestamp.RealValue <= offset + 1e-8) timestamp = entry.Timestamp
  }
  const key = `${visit.measureIndex}:${timestamp.RealValue}`
  if (key === scoreCursorKey) return
  scoreCursorKey = key
  const sourceTime = opensheetmusicdisplay.Fraction.plus(measure.AbsoluteTimestamp, timestamp)
  scoreDisplay.cursor.iterator = new opensheetmusicdisplay.MusicPartManagerIterator(
    scoreDisplay.Sheet, sourceTime
  )
  scoreDisplay.cursor.show()
  // Scroll only the score viewport; never move the surrounding page.
  const viewport = document.getElementById("scoreViewport")
  const line = scoreDisplay.cursor.cursorElement.getBoundingClientRect()
  const box = viewport.getBoundingClientRect()
  if (line.top < box.top + 24 || line.bottom > box.bottom - 24) {
    viewport.scrollTop += line.top - box.top - Math.max(24, (viewport.clientHeight - line.height) / 2)
  }
  if (line.left < box.left || line.right > box.right) viewport.scrollLeft += line.left - box.left - 24
}

function startPlayhead() {
  function tick() {
    const beat = currentPlaybackBeat()
    updatePlayhead(beat)
    updateScoreCursor(beat)
    playheadRAF = requestAnimationFrame(tick)
  }
  tick()
}

function fmt(sec) {
  const m = Math.floor(sec / 60), s = Math.floor(sec % 60)
  return `${m}:${String(s).padStart(2,"0")}`
}

function stopPlayback() {
  playbackRequest++
  if (playheadRAF) { cancelAnimationFrame(playheadRAF); playheadRAF = null }
  updatePlayhead(0)
  scoreDisplay?.cursor.hide()
  scoreCursorKey = null
  if (transport) {
    transport.stop()
    scheduledEvents.forEach(id => transport.clear(id))
    scheduledEvents = []
  }
  playbackNodes.reverse().forEach(node => node.dispose())
  playbackNodes = []
  setStatus(viewerStatus, "")
}

// Seek on the complete score timeline, including tempo changes and repeats.
document.getElementById("playheadBar").addEventListener("click", e => {
  if (!currentComposition) return
  const rect = e.currentTarget.getBoundingClientRect()
  const pct = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width))
  const tempi = [...currentComposition.tempi].sort((a, b) => a.ontime - b.ontime)
  const targetSeconds = pct * playbackSeconds(0, scoreDurationBeats(), tempi)
  let low = 0, high = scoreDurationBeats()
  for (let i = 0; i < 40; i++) {
    const mid = (low + high) / 2
    if (playbackSeconds(0, mid, tempi) < targetSeconds) low = mid
    else high = mid
  }
  playScore((low + high) / 2)
})

document.getElementById("playbackSpeed").addEventListener("change", e => {
  const speed = Number(e.target.value)
  if (!Number.isFinite(speed) || speed < 0.25 || speed > 2) return
  const playing = transport?.state === "started"
  const beat = playing ? currentPlaybackBeat() : 0
  playbackSpeed = speed
  if (playing) playScore(beat)
  else updatePlayhead(0)
})

// ── ChordGNN analysis ─────────────────────────────────────────────────────
document.getElementById("analyseBtn").addEventListener("click", async () => {
  if (!currentScore) return setStatus(viewerStatus, "Open a score first.", true)
  let score = currentScore
  const version = scoreLoadVersion
  const button = document.getElementById("analyseBtn")
  button.disabled = true
  setStatus(viewerStatus, "Analysing harmony… (may take 1–5 min)")
  try {
    // Demo scores have no filename — upload silently first to get one
    if (!score.filename) {
      const demoXml = await fetch(score.demoPath).then(r => r.blob())
      const form = new FormData()
      form.append("file", demoXml, score.name + ".xml")
      const up = await fetch("/api/upload", {
        method: "POST",
        headers: { Authorization: `Bearer ${authToken}` },
        body: form
      }).then(r => r.json())
      if (up.error) throw new Error(up.error)
      score = { ...score, filename: up.filename }
      currentScore = score
    }
    const res = await apiFetch("/api/analyze", "POST", { filename: score.filename })
    if (version !== scoreLoadVersion) return
    if (res.error) throw new Error(res.error)
    const response = await fetch(res.analysisUrl, {
      headers: { Authorization: `Bearer ${authToken}` }
    })
    if (!response.ok) throw new Error("Could not fetch the annotated score.")
    const xml = await response.text()
    if (version !== scoreLoadVersion) return
    await displayAnalysis(xml, version)
  } catch (err) {
    if (version === scoreLoadVersion) setStatus(viewerStatus, `Analysis failed: ${err.message}`, true)
  } finally {
    button.disabled = false
  }
})

async function displayAnalysis(xmlText, version = scoreLoadVersion) {
  const doc = new DOMParser().parseFromString(xmlText, "application/xml")
  if (doc.querySelector("parsererror")) throw new Error("The analysis worker did not return valid MusicXML.")
  const annotations = doc.querySelectorAll('direction[id^="scorify-analysis-"]')
  if (!annotations.length) {
    throw new Error("No timed harmonic annotations were returned. Update the analysis worker and run analysis again.")
  }
  const composition = parseMusicXML(xmlText)
  stopPlayback()
  await renderMusicXML(xmlText, version)
  if (version !== scoreLoadVersion) return
  currentComposition = composition
  annotatedScoreXML = xmlText
  document.getElementById("exportAnalysisBtn").disabled = false
  analysisSection.hidden = true
  updatePlayhead(0)
  setStatus(viewerStatus, `Analysis complete: ${annotations.length} harmonic labels added above the top staff. Ready to export.`)
}

document.getElementById("exportAnalysisBtn").addEventListener("click", () => {
  if (!annotatedScoreXML || !currentScore) return
  const url = URL.createObjectURL(new Blob([annotatedScoreXML], { type: "application/vnd.recordare.musicxml+xml" }))
  const link = document.createElement("a")
  link.href = url
  link.download = `${currentScore.name.replace(/\.(musicxml|xml)$/i, "")}-analysis.musicxml`
  document.body.appendChild(link)
  link.click()
  link.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
})

// ── MusicXML → Composition ────────────────────────────────────────────────
// Adapted from maia_vex.js (professor's parser) using JavaScript array functions.

function parseMusicXML(xmlText) {
  const doc = new DOMParser().parseFromString(xmlText, "application/xml")
  if (doc.querySelector("parsererror")) throw new Error("Invalid MusicXML.")
  if (doc.documentElement.localName !== "score-partwise") {
    throw new Error("Playback requires partwise MusicXML.")
  }
  const text = (el, selector) => el.querySelector(selector)?.textContent.trim() || ""
  const number = (el, selector, fallback = 0) => {
    const value = text(el, selector)
    return value && Number.isFinite(Number(value)) ? Number(value) : fallback
  }
  const parts = Array.from(doc.querySelectorAll("part"))
  const layer = []
  const measures = []
  const timeSignatures = []
  const keySignatures = []
  const clefChanges = []

  parts.forEach(part => {
    let divisions = 1, measureBeats = 4, transpose = 0, bpm = 120
    const staffIds = new Map()
    const staffId = local => {
      if (!staffIds.has(local)) {
        const id = layer.length + 1
        staffIds.set(local, id)
        layer.push({ staffNo: id, partId: part.getAttribute("id"), vexflow: {} })
      }
      return staffIds.get(local)
    }
    Array.from(part.children).filter(el => el.localName === "measure").forEach((measure, index) => {
      const data = measures[index] ||= {
        notes: [], rests: [], tempi: [], duration: 0, forward: false, backward: false,
        times: null, endingStart: null, endingStop: false,
        initialBpm: bpm, number: measure.getAttribute("number")
      }
      let cursor = 0, extent = 0, lastOnset = 0
      for (const el of measure.children) {
        if (el.localName === "attributes") {
          divisions = number(el, "divisions", divisions)
          if (!(divisions > 0)) throw new Error("MusicXML divisions must be positive.")
          const ts = el.querySelector("time")
          if (ts) {
            const topNo = text(ts, "beats").split("+").reduce((sum, v) => sum + Number(v), 0)
            const bottomNo = number(ts, "beat-type", 4)
            measureBeats = topNo * 4 / bottomNo
            timeSignatures.push({ topNo, bottomNo, ontime: 0 })
          }
          const trans = el.querySelector("transpose")
          if (trans) transpose = number(trans, "chromatic") + 12 * number(trans, "octave-change")
          const key = el.querySelector("key")
          if (key) keySignatures.push({ fifths: number(key, "fifths"), mode: text(key, "mode") || "major", ontime: 0 })
          el.querySelectorAll("clef").forEach(c => clefChanges.push({
            sign: text(c, "sign"), line: number(c, "line"), ontime: 0,
            staffNo: staffId(Number(c.getAttribute("number")) || 1)
          }))
        } else if (el.localName === "backup" || el.localName === "forward") {
          cursor += (el.localName === "backup" ? -1 : 1) * number(el, "duration") / divisions
          extent = Math.max(extent, cursor)
        } else if (el.localName === "direction" || el.localName === "sound") {
          const sound = el.localName === "sound" ? el : el.querySelector("sound[tempo]")
          const tempo = Number(sound?.getAttribute("tempo"))
          if (tempo > 0) {
            bpm = tempo
            data.tempi.push({ ontime: cursor + number(el, "offset") / divisions, bpm })
          }
        } else if (el.localName === "barline") {
          for (const ending of el.querySelectorAll("ending")) {
            if (ending.getAttribute("type") === "start") {
              data.endingStart = ending.getAttribute("number").split(",").map(n => Number(n.trim()))
            } else data.endingStop = true
          }
          for (const repeat of el.querySelectorAll("repeat")) {
            if (repeat.getAttribute("direction") === "forward") data.forward = true
            if (repeat.getAttribute("direction") === "backward") {
              data.backward = true
              if (repeat.hasAttribute("times")) data.times = Number(repeat.getAttribute("times"))
            }
          }
        } else if (el.localName === "note") {
          if (el.querySelector("grace")) continue
          const duration = number(el, "duration") / divisions
          const chord = !!el.querySelector("chord")
          const ontime = chord ? lastOnset : cursor
          if (!chord) { lastOnset = ontime; cursor += duration }
          extent = Math.max(extent, ontime + duration)
          if (!(duration > 0)) continue
          const staffNo = staffId(number(el, "staff", 1))
          const voiceNo = text(el, "voice") || "1"
          const note = {
            ontime, offtime: ontime + duration, duration, staffNo, voiceNo,
            durationType: text(el, "type") || "quarter", dotCount: el.querySelectorAll("dot").length,
            tieStart: !!el.querySelector('tie[type="start"]'),
            tieStop: !!el.querySelector('tie[type="stop"]')
          }
          if (el.querySelector("rest")) data.rests.push(note)
          else {
            const pitch = el.querySelector("pitch")
            if (!pitch) continue
            const step = text(pitch, "step")
            const octave = number(pitch, "octave")
            const alter = number(pitch, "alter")
            const accidental = alter > 0 ? "#".repeat(alter) : "b".repeat(-alter)
            const written = `${step}${accidental}${octave}`
            note.pitch = transpose ? transposePitch(written, transpose) : written
            data.notes.push(note)
          }
        }
      }
      // Voices share a measure; their durations must never be added together.
      const duration = measure.getAttribute("implicit") === "yes" && extent > 0
        ? extent : Math.max(measureBeats, extent)
      data.duration = Math.max(data.duration, duration)
    })
  })

  // Unfold the score before joining ties, so ties follow the performed order.
  const sequencing = []
  const repeatPasses = new Map()
  const repeatStarts = new Map()
  const openRepeats = []
  measures.forEach((measure, index) => {
    if (measure.forward) openRepeats.push(index)
    if (measure.backward) {
      repeatStarts.set(index, openRepeats.pop() ?? 0)
    }
  })
  const endings = []
  let activeEnding = null
  measures.forEach((measure, index) => {
    if (measure.endingStart) {
      activeEnding = { start: index, end: index, passes: measure.endingStart }
      endings.push(activeEnding)
    }
    if (activeEnding) activeEnding.end = index
    if (measure.endingStop) activeEnding = null
  })
  endings.forEach((ending, i) => {
    ending.repeatEnd = [...repeatStarts.keys()].find(end => end >= ending.start && end <= ending.end)
    if (ending.repeatEnd === undefined && i > 0 && endings[i - 1].end + 1 === ending.start) {
      ending.repeatEnd = endings[i - 1].repeatEnd
    }
  })
  let index = 0
  while (index < measures.length) {
    if (sequencing.length >= 10000) throw new Error("Repeat expansion exceeds 10,000 measures.")
    const measure = measures[index]
    const ending = endings.find(e => e.start === index && e.repeatEnd !== undefined)
    if (ending && !ending.passes.includes(repeatPasses.get(ending.repeatEnd) || 1)) {
      index = ending.end + 1
      continue
    }
    sequencing.push(index)
    if (measure.backward) {
      const repeatStart = repeatStarts.get(index)
      const passes = repeatPasses.get(index) || 1
      const endingPasses = endings.filter(e => e.repeatEnd === index).flatMap(e => e.passes)
      const times = measure.times ?? Math.max(2, ...endingPasses)
      if (!Number.isInteger(times) || times < 1 || times > 100) throw new Error("Invalid repeat count.")
      if (passes < times) {
        repeatPasses.set(index, passes + 1)
        // A larger repeat plays any inner repeated sections again.
        for (const end of repeatPasses.keys()) {
          if (end >= repeatStart && end < index) repeatPasses.delete(end)
        }
        index = repeatStart
        continue
      }
    }
    index++
  }

  const notes = [], rests = [], tempi = [], measureTimeline = []
  const pendingTies = new Map()
  let beat = 0, previousMeasure = -1
  for (const index of sequencing) {
    const measure = measures[index]
    measureTimeline.push({ measureIndex: index, ontime: beat, offtime: beat + measure.duration })
    if (index !== previousMeasure + 1 || previousMeasure < 0) {
      tempi.push({ ontime: beat, bpm: measure.initialBpm })
    }
    for (const tempo of measure.tempi) tempi.push({ ...tempo, ontime: beat + tempo.ontime })
    for (const source of measure.notes) {
      const note = { ...source, ontime: beat + source.ontime, offtime: beat + source.offtime }
      const key = `${note.staffNo}:${note.voiceNo}:${note.pitch}`
      const held = pendingTies.get(key)
      if (note.tieStop && held && Math.abs(held.offtime - note.ontime) < 1e-8) {
        held.offtime = note.offtime
        held.duration = held.offtime - held.ontime
        if (!note.tieStart) pendingTies.delete(key)
      } else {
        notes.push(note)
        pendingTies.delete(key)
        if (note.tieStart) pendingTies.set(key, note)
      }
    }
    for (const rest of measure.rests) rests.push({ ...rest, ontime: beat + rest.ontime, offtime: beat + rest.offtime })
    beat += measure.duration
    previousMeasure = index
  }
  return {
    name: text(doc, "work-title") || text(doc, "movement-title") || "Untitled",
    layer, notes, rests, tempi, timeSignatures, keySignatures, clefChanges,
    sequencing, measureTimeline, durationBeats: beat, expressions: [], miscXML: { anacrusis: 0 },
    pageLayout: { pageWidth: 1200, pageHeight: 1700, margins: { left: 70, right: 70, top: 88, bottom: 88 } }
  }
}

// Transpose a pitch string like "C#4" by n semitones (positive = up)
function transposePitch(pitch, semitones) {
  const notes = ["C","C#","D","D#","E","F","F#","G","G#","A","A#","B"]
  const m = pitch.match(/^([A-G]#?)(\d+)$/)
  if (!m) return pitch
  let idx = notes.indexOf(m[1])
  if (idx === -1) {
    // Handle flats: Bb->A#, Eb->D#, Ab->G#, Db->C#, Gb->F#
    const flatMap = { "Bb":"A#","Eb":"D#","Ab":"G#","Db":"C#","Gb":"F#","Cb":"B","Fb":"E" }
    idx = notes.indexOf(flatMap[m[1]] || m[1])
    if (idx === -1) return pitch
  }
  let oct = parseInt(m[2])
  let newIdx = idx + semitones
  while (newIdx < 0)  { newIdx += 12; oct-- }
  while (newIdx >= 12){ newIdx -= 12; oct++ }
  return notes[newIdx] + oct
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
