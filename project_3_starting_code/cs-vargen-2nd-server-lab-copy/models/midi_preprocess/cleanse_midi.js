// Modified by Chenyu Gao, 22nd Jul 2024

// Copyright Tom Collins, 26.5.2023
// A method for importing user-supplied MIDI, estimating and correcting for
// downbeat location, quantising, and re-exporting as a "cleansed MIDI file"
// that could be used to condition a generative model such as MAIA Markov or
// Fast Transformer.

// node cleanse_midi.js -u test -f piano_introduction.mid -j Job1

// Requires
const argv = require('minimist')(process.argv.slice(2))
console.log("argv:", argv)
const fs = require("fs")
const path = require("path")
const { Midi } = require('@tonejs/midi')


// Individual user paths
const mainPaths = {
  "vargen": {
    "inputDir": path.join(
      "/home", "vargen", "tmp_io"
    ),
    "outputDir": path.join(
      "/home", "vargen", "tmp_io"
    ),
    "trackName": "Piano"
  },
  "test": {
    "inputDir": path.join(
      __dirname, "out"
    ),
    "outputDir": path.join(
      __dirname, "out"
    ),
    "trackName": "Piano"
  },
}

// Parameters
const param = {
  "downbeat": {
    "histType": "drumsFalseVelocityTrue",
    "drumsOnly": false,
    "rounding": true,
    "granularity": 4,
    "beatsInMeasure": 4,
    "velocityIndex": 4,
    "ontimeIndex": 0
  },
  "ontimeIndex": 0,
  "noteIndices": {
    "ontimeIndex": 0,
    "mnnIndex": 1,
    "durationIndex": 2,
    "channelIndex": 3,
    "velocityIndex": 4
  },
  "controlChanges": null,
  "scaleFactor": 0.5,
  "timeSigtopNo": 4,
  "timeSigBottomNo": 4
}
const quantSet = [0, 1/8, 1/6, 1/4, 1/3, 3/8, 1/2, 5/8, 2/3, 3/4, 5/6, 7/8, 1]

// Import and clean.
// Grab user name from command line to set path to data.
const mainPath = mainPaths[argv.u]
console.log("mainPath:", mainPath)
const trackName = mainPath["trackName"]
const fnam = argv.f.split(".mid")[0]
const jobId = argv.j
const outFnam = fnam.split("_preprocess")[0]

// Import and analyse the MIDI file.
  
const midiData = fs.readFileSync(
  path.join(mainPath["inputDir"], jobId, fnam + ".mid")
)
const midi = new Midi(midiData)
let timeSigs = [
  { "barNo": 1, "topNo": 4, "bottomNo": 4, "ontime": 0 }
]
if (
  midi.header &&
  midi.header.timeSignatures &&
  midi.header.timeSignatures.length > 0
){
  timeSigs = [midi.header.timeSignatures.map(function(ts){
    return {
      "barNo": ts.measures + 1,
      "topNo": ts.timeSignature[0],
      "bottomNo": ts.timeSignature[1],
      "ontime": ts.ticks/midi.header.ppq
    }
  })[0]]
}

// Load tempo information.
let theme_bpm = 120
if (
    midi.header &&
    midi.header.tempos &&
    midi.header.tempos.length > 0
){
    theme_bpm = midi.header.tempos[0].bpm
}
console.log("theme_bpm", theme_bpm)

if (timeSigs[0].topNo !== 4){
  console.log("timeSigs:", timeSigs)
}
let allPoints = [], dbPoints = [], tonalPoints = [], trgPoints = []
midi.tracks.forEach(function(track, idx){
  const trgTestStr = track.instrument.family + " -> " + track.instrument.name
  console.log("trgTestStr:", trgTestStr)
  // console.log("track.instrument.family:", track.instrument.family)
  // console.log("track.instrument.name:", track.instrument.name)
  track.notes.forEach(function(n){
    let pt = [
      n.ticks/midi.header.ppq,
      n.midi,
      n.durationTicks/midi.header.ppq,
      0,//track.channel,
      Math.round(1000*n.velocity)/1000
    ]
    allPoints.push(pt)
    if (
      !param.downbeat.drumsOnly ||
      param.downbeat.drumsOnly && track.instrument.family === "drums"
    ){
      dbPoints.push(pt)
    }
    if (track.instrument.family !== "drums"){
      tonalPoints.push(pt)
    }
    trgPoints.push(pt)
  })
})
if (dbPoints.length === 0) {
  console.log("No downbeat detection points. Reverting to full dataset!")
  dbPoints = allPoints
}

// We will use tonalPoints instead of trgPoints as we need to exclude drum notes.
// Since downbeat estimation is not correct enough, we don't use it here.

/**
 * Slice first 8 bars if the input is longer than 8 bars.
 */
let maxOntime = tonalPoints[tonalPoints.length - 1][0]
let tmp_start_ontime = 0
if (maxOntime > 8 * 4){
    maxOntime = 8 * 4
}
let tmp_end_ontime = maxOntime
let tmp_pattern = slicePoints(tonalPoints, tmp_start_ontime, tmp_end_ontime)[0]

const midiOut = new Midi()
let ntracks = 1
// console.log("tmp_pattern", tmp_pattern)
const tmp_out_points = tmp_pattern
for (let i_track = 0; i_track < ntracks; i_track++){
  const track = midiOut.addTrack()
  track.name = trackName
  track["channel"] = i_track
  tmp_out_points.forEach(function(p){
    track.addNote({
      midi: p[param.noteIndices.mnnIndex],
      time: param.scaleFactor*(p[param.noteIndices.ontimeIndex]),
      duration: param.scaleFactor*p[param.noteIndices.durationIndex],
      velocity: p[param.noteIndices.velocityIndex]
    })
  })
}

midiOut.header.tempos = [
    { bpm: theme_bpm, ticks: 0, time: 0 }
]

fs.writeFileSync(
  path.join(mainPath["outputDir"], jobId, outFnam + ".mid"),
  new Buffer.from(midiOut.toArray())
)
console.log("Data has been written to MIDI file.")


/**
 * A filter to return a set of points whose ontime in [beg_time, end_time].
 * @param {Array} point_set - A pointset [[ontime1, pitch1], [ontime2, pitch2], ...]
 * @param {number} beg_time - The beginning time of the selected piece.
 * @param {number} end_time - The end time of the selected piece.
 */
function slicePoints(point_set, beg_time, end_time){
    let selectedPointSet = []
    let slicedStartIdx = 0
    let slicedEndIdx = point_set.length - 1
    for(let i = 0; i < point_set.length; i++){
      if((point_set[i][0] >= beg_time) && (point_set[i][0] <= end_time)){
        selectedPointSet.push(point_set[i])
      }
    }
    slicedStartIdx = slicedEndIdx - selectedPointSet.length + 1
    // console.log("[selectedPointSet", selectedPointSet, "],[slicedStartIdx", slicedStartIdx, "],[slicedEndIdx",slicedEndIdx, "]")
    return [selectedPointSet, slicedStartIdx, slicedEndIdx]
  }