/* ============================================================
   Scorify – client.js
   MusicXML → Composition object → VexFlow render + Tone.js playback
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

// ── Open & render a score ─────────────────────────────────────────────────
let currentScore = null  // { filename, name, scoreUrl }

async function openScore(score) {
  currentScore = score
  stopPlayback()
  currentComposition = null
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

    // Parse for playback
    currentComposition = parseMusicXML(xml)

    // Render with OSMD
    scoreContainer.innerHTML = ""
    const osmd = new opensheetmusicdisplay.OpenSheetMusicDisplay(scoreContainer, {
      autoResize: true,
      backend: "svg",
      drawTitle: true,
      drawComposer: true,
      drawingParameters: "default"
    })
    await osmd.load(xml)
    await osmd.render()

    setStatus(viewerStatus, "Ready. Press Play to hear it.")
  } catch (err) {
    console.error("Load error:", err.message, err.stack)
    setStatus(viewerStatus, `Error loading score: ${err.message}`, true)
  }
}

// ── Play / Stop ───────────────────────────────────────────────────────────
document.getElementById("playBtn").addEventListener("click", () => playScore())
document.getElementById("stopBtn").addEventListener("click", stopPlayback)

// Playhead state
let playheadRAF = null
let playDurationBeats = 0
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
  transport.bpm.value = sortedTempi.filter(t => t.ontime <= playStartBeat).at(-1)?.bpm || 120
  transport.timeSignature = 4

  sortedTempi.forEach(t => {
    if (t.ontime > playStartBeat && Number.isFinite(t.ontime) && t.bpm > 0) {
      const tickVal = Math.round((t.ontime - playStartBeat) * transport.PPQ)
      if (!isNaN(tickVal)) {
        const id = transport.schedule(time => {
          transport.bpm.setValueAtTime(t.bpm, time)
        }, `${tickVal}i`)
        scheduledEvents.push(id)
      }
    }
  })

  const synths = createPlaybackSynths(notes)

  const endBeat = validNotes.reduce((m, n) => Math.max(m, n.offtime), currentComposition.durationBeats || 0)
  playDurationBeats = endBeat - playStartBeat

  // Schedule notes from playStartBeat onward
  validNotes.forEach(note => {
    if (!note.pitch || note.offtime <= playStartBeat) return
    if (isNaN(note.ontime) || isNaN(note.offtime)) return
    const synth = synths.get(note.staffNo)
    if (!synth) return
    const noteStart = Math.max(note.ontime, playStartBeat)
    const onTickVal  = Math.round((noteStart - playStartBeat) * transport.PPQ)
    // Duration must be in seconds inside a Transport callback, not ticks
    const durSecs = Math.max(0.01, playbackSeconds(noteStart, note.offtime, sortedTempi))
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
  const vol = new Tone.Volume(-18).connect(reverb)
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

function startPlayhead() {
  const bar  = document.getElementById("playheadBar")
  const fill = document.getElementById("playheadFill")
  const time = document.getElementById("playheadTime")
  if (!bar) return
  bar.style.display = "block"

  function tick() {
    const beats = transport.ticks / transport.PPQ
    const pct = playDurationBeats > 0 ? Math.min(beats / playDurationBeats, 1) : 0
    fill.style.width = (pct * 100) + "%"
    const tempi = [...currentComposition.tempi].sort((a, b) => a.ontime - b.ontime)
    const totalSec = playbackSeconds(playStartBeat, playStartBeat + playDurationBeats, tempi)
    const curSec = playbackSeconds(playStartBeat, playStartBeat + beats, tempi)
    time.textContent = `${fmt(curSec)} / ${fmt(totalSec)}`
    playheadRAF = requestAnimationFrame(tick)
  }
  playheadRAF = requestAnimationFrame(tick)
}

function fmt(sec) {
  const m = Math.floor(sec / 60), s = Math.floor(sec % 60)
  return `${m}:${String(s).padStart(2,"0")}`
}

function stopPlayback() {
  playbackRequest++
  if (playheadRAF) { cancelAnimationFrame(playheadRAF); playheadRAF = null }
  const fill = document.getElementById("playheadFill")
  if (fill) fill.style.width = "0%"
  if (transport) {
    transport.stop()
    scheduledEvents.forEach(id => transport.clear(id))
    scheduledEvents = []
  }
  playbackNodes.reverse().forEach(node => node.dispose())
  playbackNodes = []
  setStatus(viewerStatus, "")
}

// ── Seek: click on playhead bar ───────────────────────────────────────────
document.addEventListener("DOMContentLoaded", () => {
  const bar = document.getElementById("playheadBar")
  if (!bar) return
  bar.addEventListener("click", e => {
    if (!currentComposition) return
    const rect = bar.getBoundingClientRect()
    const pct = (e.clientX - rect.left) / rect.width
    const seekBeat = playStartBeat + pct * playDurationBeats
    playScore(seekBeat)
  })
})

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

  const notes = [], rests = [], tempi = []
  const pendingTies = new Map()
  let beat = 0, previousMeasure = -1
  for (const index of sequencing) {
    const measure = measures[index]
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
    sequencing, durationBeats: beat, expressions: [], miscXML: { anacrusis: 0 },
    pageLayout: { pageWidth: 1200, pageHeight: 1700, margins: { left: 70, right: 70, top: 88, bottom: 88 } }
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
  const clefMap = { g: 'treble', f: 'bass', c: 'alto', p: 'percussion' }
  const clefName = clef ? (clefMap[clef.sign.toLowerCase()] || 'treble') : 'treble'
  stave.addClef(clefName)
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
