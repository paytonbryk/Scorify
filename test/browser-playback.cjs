// Run with Playwright available in NODE_PATH. Optional SCORE_XML tests a local score.
const { chromium } = require('playwright')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const root = path.join(__dirname, '..')
const wrap = measures => `<score-partwise><part id="P1">${measures}</part></score-partwise>`
const attrs = '<attributes><divisions>1</divisions><time><beats>4</beats><beat-type>4</beat-type></time></attributes>'
const note = (step, octave, duration, extra = '') => `<note><pitch><step>${step}</step><octave>${octave}</octave></pitch><duration>${duration}</duration>${extra}</note>`

async function main() {
  const browser = await chromium.launch({ headless: true, channel: 'chrome' })
  try {
    const page = await browser.newPage()
    const errors = []
    page.on('pageerror', e => errors.push(e.message))
    await page.route('http://scorify.test/**', route => route.fulfill({
      contentType: 'text/html', body: fs.readFileSync(path.join(root, 'src/pages/index.hbs'), 'utf8').replace(/<script[\s\S]*?<\/script>/g, '')
    }))
    await page.goto('http://scorify.test/')
    await page.addScriptTag({ path: path.join(root, 'public/vendor/Tone.11.js') })
    await page.addScriptTag({ path: path.join(root, 'public/client.js') })
    await page.addStyleTag({ content: fs.readFileSync(path.join(root, 'public/style.css'), 'utf8').replace(/^@import.*$/m, '') })
    if (process.env.OSMD_JS) await page.addScriptTag({ path: process.env.OSMD_JS })
    const parse = xml => page.evaluate(xml => parseMusicXML(xml), xml)

    const voices = await parse(wrap(`<measure>${attrs}${note('C', 4, 4, '<staff>1</staff>')}<backup><duration>4</duration></backup>${note('C', 3, 2, '<staff>2</staff><voice>5</voice>')}<forward><duration>1</duration></forward>${note('D', 3, 1, '<staff>2</staff><voice>5</voice>')}</measure>`))
    assert.deepEqual(voices.notes.map(n => n.ontime), [0, 0, 3])
    assert.notEqual(voices.notes[0].staffNo, voices.notes[1].staffNo)
    assert.equal(voices.durationBeats, 4)

    const chord = await parse(wrap(`<measure>${attrs}${note('C', 4, 4)}${note('E', 4, 2, '<chord/>')}</measure>`))
    assert.deepEqual(chord.notes.map(n => n.ontime), [0, 0])

    const tied = await parse(wrap(`<measure>${attrs}${note('C', 4, 4, '<tie type="start"/>')}</measure><measure>${note('C', 4, 4, '<tie type="stop"/><tie type="start"/>')}</measure><measure>${note('C', 4, 4, '<tie type="stop"/>')}</measure>`))
    assert.equal(tied.notes.length, 1)
    assert.equal(tied.notes[0].duration, 12)

    const repeat = await parse(wrap(`<measure>${attrs}<barline><repeat direction="forward"/></barline>${note('C', 4, 4)}</measure><measure>${note('D', 4, 4)}<barline><repeat direction="backward" times="3"/></barline></measure>`))
    assert.deepEqual(repeat.sequencing, [0, 1, 0, 1, 0, 1])
    assert.equal(repeat.durationBeats, 24)

    const nested = await parse(wrap(`<measure>${attrs}<barline><repeat direction="forward"/></barline>${note('C', 4, 4)}</measure><measure><barline><repeat direction="forward"/></barline>${note('D', 4, 4)}<barline><repeat direction="backward"/></barline></measure><measure>${note('E', 4, 4)}<barline><repeat direction="backward"/></barline></measure>`))
    assert.deepEqual(nested.sequencing, [0,1,1,2,0,1,1,2])

    const endings = await parse(wrap(`<measure>${attrs}<barline><repeat direction="forward"/></barline>${note('C', 4, 4)}</measure><measure><barline><ending type="start" number="1,2"/></barline>${note('D', 4, 4)}<barline><ending type="stop" number="1,2"/><repeat direction="backward"/></barline></measure><measure><barline><ending type="start" number="3"/></barline>${note('E', 4, 4)}<barline><ending type="discontinue" number="3"/></barline></measure>`))
    assert.deepEqual(endings.sequencing, [0,1,0,1,0,2])

    const printedWords = await parse(wrap(`<measure>${attrs}<direction><direction-type><words>4X</words></direction-type></direction>${note('C', 4, 4)}<barline><repeat direction="backward"/></barline></measure>`))
    assert.deepEqual(printedWords.sequencing, [0, 0])

    const changingUnits = await parse(wrap(`<measure>${attrs}${note('C', 4, 4)}</measure><measure><attributes><divisions>2</divisions><time><beats>3</beats><beat-type>4</beat-type></time></attributes>${note('D', 4, 6)}</measure><measure>${note('E', 4, 6)}</measure>`))
    assert.deepEqual(changingUnits.notes.map(n => [n.ontime, n.offtime]), [[0,4], [4,7], [7,10]])

    const pickup = await parse(wrap(`<measure implicit="yes">${attrs}${note('C', 4, 1)}</measure><measure>${note('D', 4, 4)}</measure>`))
    assert.equal(pickup.notes[1].ontime, 1)
    console.log('PASS: voices, forward/backup, chords, ties, nested repeats, ending passes, printed-text independence, pickups, changing divisions/meters')

    if (process.env.SCORE_XML) {
      const xml = fs.readFileSync(process.env.SCORE_XML, 'utf8')
      const score = await parse(xml)
      assert.equal(score.notes.find(n => n.staffNo === 1).ontime, 0)
      assert.equal(score.notes.find(n => n.staffNo === 2).ontime, 0)
      const bassTie = score.notes.find(n => n.staffNo === 2 && n.pitch === 'C3' && n.ontime === 2.5)
      assert.equal(bassTie.offtime, 4)
      assert.deepEqual(score.sequencing.slice(0, 9), [0,1,2,3,0,1,2,3,4])
      assert.ok(score.sequencing.length > 34)
      console.log(`PASS: supplied score: simultaneous staves, C3 tie lasts 1.5 beats, encoded repeats; ${score.sequencing.length} performed measures`)
      await page.evaluate(xml => { currentComposition = parseMusicXML(xml) }, xml)
      if (process.env.OSMD_JS) {
        await page.evaluate(async xml => {
          document.getElementById('appSection').hidden = false
          document.getElementById('viewerSection').hidden = false
          scoreDisplay = new opensheetmusicdisplay.OpenSheetMusicDisplay(scoreContainer, {
            backend: 'svg', cursorsOptions: [{ type: 1, color: '#c4701a', alpha: 0.9, follow: false }]
          })
          await scoreDisplay.load(xml)
          scoreDisplay.render()
          updateScoreCursor(0)
        }, xml)
        const cursor = await page.evaluate(() => {
          const first = scoreDisplay.cursor.Iterator.CurrentMeasureIndex
          updateScoreCursor(1)
          const withinMeasure = scoreDisplay.cursor.Iterator.CurrentSourceTimestamp.RealValue
          updateScoreCursor(currentComposition.measureTimeline[2].ontime)
          const third = scoreDisplay.cursor.Iterator.CurrentMeasureIndex
          updateScoreCursor(currentComposition.measureTimeline[4].ontime)
          return { first, withinMeasure, third, repeated: scoreDisplay.cursor.Iterator.CurrentMeasureIndex,
            visible: !scoreDisplay.cursor.Hidden }
        })
        assert.deepEqual(cursor, { first: 0, withinMeasure: 0.25, third: 2, repeated: 0, visible: true })
        console.log('PASS: actual OSMD cursor follows source measures and repeat jumps')
      }
    } else {
      await page.evaluate(score => { currentComposition = score }, voices)
    }
    await page.evaluate(() => {
      document.getElementById('appSection').hidden = false
      document.getElementById('viewerSection').hidden = false
    })
    await page.click('#playBtn')
    await page.waitForFunction(() => document.getElementById('viewerStatus').textContent === 'Playing…')
    const totalBefore = (await page.locator('#playheadTime').textContent()).split(' / ')[1]
    const bar = await page.locator('#playheadBar').boundingBox()
    await page.locator('#playheadBar').click({ position: { x: bar.width / 2, y: bar.height / 2 } })
    await page.waitForTimeout(200)
    assert.equal((await page.locator('#playheadTime').textContent()).split(' / ')[1], totalBefore)
    assert.ok(Math.abs(parseFloat(await page.locator('#playheadFill').evaluate(el => el.style.width)) - 50) < 10)
    await page.locator('#playheadBar').click({ position: { x: bar.width / 4, y: bar.height / 2 } })
    await page.waitForTimeout(200)
    assert.equal((await page.locator('#playheadTime').textContent()).split(' / ')[1], totalBefore)
    assert.ok(Math.abs(parseFloat(await page.locator('#playheadFill').evaluate(el => el.style.width)) - 25) < 10)
    const beatBeforeSpeed = await page.evaluate(() => currentPlaybackBeat())
    await page.selectOption('#playbackSpeed', '0.5')
    await page.waitForTimeout(200)
    assert.ok(Math.abs(await page.evaluate(() => currentPlaybackBeat()) - beatBeforeSpeed) < 2)
    assert.equal(await page.evaluate(() => playbackSpeed), 0.5)
    await page.selectOption('#playbackSpeed', '1')
    await page.click('#playBtn')
    console.log('PASS: repeated seeks preserve duration and absolute progress; live speed change preserves position')
    const audio = await page.evaluate(async () => {
      const meter = new Tone.Analyser('waveform', 2048)
      playbackNodes[0].connect(meter)
      let peak = 0
      for (let i = 0; i < 120; i++) {
        await new Promise(resolve => setTimeout(resolve, 25))
        for (const value of meter.getValue()) peak = Math.max(peak, Math.abs(value))
      }
      const state = Tone.context.state
      meter.dispose()
      stopPlayback()
      return { state, peak, nodes: playbackNodes.length }
    })
    assert.equal(audio.state, 'running')
    assert.ok(audio.peak > 0.0001 && audio.peak < 0.99, `Audio peak ${audio.peak}`)
    assert.equal(audio.nodes, 0)
    assert.deepEqual(errors, [])
    console.log('PASS: real Tone r11 browser audio, non-silent signal below full scale, Stop cleanup', audio)
    const rendered = await page.evaluate(async () => {
      const score = currentComposition
      const tempi = [...score.tempi].sort((a, b) => a.ontime - b.ontime)
      const duration = Math.min(30, playbackSeconds(0, score.durationBeats, tempi) + 3)
      const buffer = await Tone.Offline(() => {
        const synths = createPlaybackSynths(score.notes)
        for (const note of [...score.notes].sort((a, b) => a.ontime - b.ontime)) {
          if (playbackSeconds(0, note.ontime, tempi) >= duration) continue
          synths.get(note.staffNo).triggerAttackRelease(note.pitch,
            playbackSeconds(note.ontime, note.offtime, tempi),
            playbackSeconds(0, note.ontime, tempi), 0.75)
        }
      }, duration)
      let peak = 0, clippedSamples = 0
      for (const channel of buffer.toArray()) {
        for (const sample of channel) {
          peak = Math.max(peak, Math.abs(sample))
          if (Math.abs(sample) >= 1) clippedSamples++
        }
      }
      buffer.dispose()
      playbackNodes.reverse().forEach(node => node.dispose())
      playbackNodes = []
      return { duration, peak, clippedSamples }
    })
    assert.ok(rendered.peak > 0 && rendered.peak < 0.99)
    assert.equal(rendered.clippedSamples, 0)
    console.log('PASS: offline audio render (up to 30 seconds)', rendered)
  } finally { await browser.close() }
}
main().catch(error => { console.error(error); process.exitCode = 1 })
