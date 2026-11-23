import { RepeatSequencer } from './RepeatSequencer.js';

/** Controls the dedicated Tone 11 transport used by this standalone demo. */
export class PlaybackController {
  constructor({ Tone, sequencer = new RepeatSequencer(), onPosition = () => {}, onStop = () => {} }) {
    this.Tone = Tone;
    this.sequencer = sequencer;
    this.onPosition = onPosition;
    this.onStop = onStop;
    this.events = [];
    this.instruments = new Map();
    this.generation = 0;
    this.playing = false;
  }

  ticks(beats) { return `${Math.round(beats * this.Tone.Transport.PPQ)}i`; }

  async play(composition) {
    this.stop();
    const generation = this.generation;
    const Tone = this.Tone;
    await Tone.context.resume();
    if (generation !== this.generation) return;
    const data = composition.toJSON();
    const transport = Tone.Transport;
    // All source times are quarter-note beats, independent of written meter.
    transport.timeSignature = 4;
    const start = Math.min(0, ...data.notes.map(n => n.ontime + (n.ontimeAdj || 0)));
    const position = beat => this.ticks(beat - start);
    const schedule = (fn, beat) => this.events.push(transport.schedule(fn, position(beat)));
    const tempos = [...data.tempi].sort((a, b) => a.ontime - b.ontime);
    transport.bpm.value = tempos.findLast(t => t.ontime <= start)?.bpm || tempos[0]?.bpm || 120;
    for (const tempo of tempos) {
      if (tempo.ontime >= start) schedule(time => transport.bpm.setValueAtTime(tempo.bpm, time), tempo.ontime);
    }
    for (const note of data.notes) {
      if (!note.pitch || data.layer.find(layer => layer.staffNo === note.staffNo)?.type === 'sample') continue;
      if (!this.instruments.has(note.staffNo)) {
        const synth = new Tone.PolySynth(16, Tone.Synth).toMaster();
        synth.volume.value = -18;
        this.instruments.set(note.staffNo, synth);
      }
      const instrument = this.instruments.get(note.staffNo);
      const duration = this.ticks(Math.max(0.01, note.duration + (note.offtimeAdj || 0)));
      const pitch = note.pitch;
      schedule(time => instrument.triggerAttackRelease(pitch, duration, time, 0.7), note.ontime + (note.ontimeAdj || 0));
    }
    let jumpIndex = 0;
    this.sequencer.jumps(data.sequencing, data.timeSignatures).forEach(([at, to], index) => {
      schedule(() => {
        if (jumpIndex === index) {
          transport.ticks = Math.round((to - start) * transport.PPQ);
          jumpIndex++;
        }
      }, at - 0.01);
    });
    this.events.push(transport.scheduleRepeat(time => {
      const beat = transport.ticks / transport.PPQ + start;
      Tone.Draw.schedule(() => {
        if (generation === this.generation) this.onPosition(beat);
      }, time);
    }, '32n'));
    const end = Math.max(...data.notes.map(n => n.offtime + (n.ontimeAdj || 0) + (n.offtimeAdj || 0)), ...data.rests.map(n => n.offtime));
    schedule(time => Tone.Draw.schedule(() => {
      if (generation === this.generation) this.stop();
    }, time), end + 0.1);
    this.playing = true;
    transport.start('+0.05', 0);
  }

  stop() {
    this.generation++;
    this.Tone.Transport.stop();
    this.events.forEach(id => this.Tone.Transport.clear(id));
    this.events = [];
    this.instruments.forEach(synth => synth.releaseAll());
    this.playing = false;
    this.onStop();
  }

  dispose() {
    this.stop();
    this.instruments.forEach(synth => synth.dispose());
    this.instruments.clear();
  }
}
