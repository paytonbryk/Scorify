const { test } = require('node:test')
const assert = require('node:assert/strict')
const vm = require('node:vm')
const fs = require('node:fs')
const path = require('node:path')

function setup(resume = async () => {}) {
  const elements = new Map()
  const events = []
  const nodes = []
  const attacks = []
  const element = id => {
    if (!elements.has(id)) elements.set(id, {
      style: {}, listeners: {},
      addEventListener(type, callback) { this.listeners[type] = callback }
    })
    return elements.get(id)
  }
  class AudioNode {
    constructor() { nodes.push(this) }
    toMaster() { return this }
    connect() { return this }
    set() {}
    dispose() { this.disposed = true }
    triggerAttackRelease(...args) { attacks.push(args) }
  }
  const transport = {
    PPQ: 192, bpm: { value: 120 },
    cancel() {}, stop() { this.started = false }, clear() {},
    schedule(callback, time) { events.push({ callback, time }); return events.length },
    start() { this.started = true }
  }
  const context = vm.createContext({
    localStorage: { getItem() {} }, console: { error() {} },
    window: { addEventListener() {} },
    document: { getElementById: element, addEventListener() {} },
    requestAnimationFrame() { return 1 }, cancelAnimationFrame() {},
    Tone: { context: { resume }, Transport: transport,
      Freeverb: AudioNode, Volume: AudioNode, PolySynth: AudioNode, Synth: AudioNode }
  })
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../public/client.js'), 'utf8'), context)
  vm.runInContext(`currentComposition = {
    notes: [{ pitch: 'C4', ontime: 0, offtime: 1, staffNo: 1 },
            { pitch: 'E4', ontime: 1, offtime: 2, staffNo: 1 }],
    tempi: [{ bpm: 120, ontime: 0 }]
  }`, context)
  return { context, element, events, nodes, attacks, transport }
}

test('a real click argument schedules and triggers the loaded notes', async () => {
  const s = setup()
  await s.element('playBtn').listeners.click({ type: 'click' })
  assert.equal(s.transport.started, true)
  assert.deepEqual(s.events.map(e => e.time), ['0i', '192i', '480i'])
  s.events[0].callback(10)
  assert.deepEqual(s.attacks[0], ['C4', 0.5, 10, 0.75])
  s.element('stopBtn').listeners.click()
  assert.ok(s.nodes.every(n => n.disposed))
  assert.equal(s.transport.started, false)
})

test('numeric seek starts at the requested beat', async () => {
  const s = setup()
  await vm.runInContext('playScore(1)', s.context)
  assert.deepEqual(s.events.map(e => e.time), ['0i', '288i'])
  s.events[0].callback(10)
  assert.equal(s.attacks[0][0], 'E4')
})

test('Stop during audio startup prevents delayed playback', async () => {
  let resolve
  const s = setup(() => new Promise(r => { resolve = r }))
  const pending = s.element('playBtn').listeners.click({ type: 'click' })
  s.element('stopBtn').listeners.click()
  resolve()
  await pending
  assert.equal(s.events.length, 0)
})

test('audio startup failures are shown in the viewer', async () => {
  const s = setup(async () => { throw new Error('Audio unavailable') })
  await s.element('playBtn').listeners.click({ type: 'click' })
  assert.match(s.element('viewerStatus').textContent, /Unable to play score: Audio unavailable/)
})
