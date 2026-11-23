import { Composition } from './Composition.js';
import { EngravingEngine } from './EngravingEngine.js';

/** Owns one canvas and its latest rendering; the engraving engine is injectable. */
export class ScoreRenderer {
  constructor(canvas, { Vex, engine, options = {} } = {}) {
    if (!canvas?.getContext) throw new TypeError('A canvas is required.');
    this.canvas = canvas;
    // The original uses only shallow $.extend; no jQuery runtime is necessary.
    this.engine = engine || new EngravingEngine({ Vex, jquery: { extend: Object.assign } });
    this.options = {
      notationWidth: 1000, colorNoteheads: true, hideStaveNames: true,
      logging: false, ...options,
      padding: { left: 25, right: 25, voice: 125, ...options.padding }
    };
    this.result = null;
  }

  render(composition, options = {}) {
    this.result = null;
    const model = composition instanceof Composition ? composition : new Composition(composition);
    const params = { ...this.options, ...options, padding: { ...this.options.padding, ...options.padding } };
    if (!Number.isFinite(params.notationWidth) || params.notationWidth <= 0) {
      throw new TypeError('notationWidth must be positive.');
    }
    // The inherited algorithms sort and annotate data. Never pass caller data.
    const data = model.toJSON();
    data.notes.sort((a, b) => a.ontime - b.ontime);
    data.rests.sort((a, b) => a.ontime - b.ontime);
    this.clear();
    try {
      this.result = this.engine.cobj2vex(this.canvas, data, params);
      return this.result;
    } catch (error) {
      this.clear();
      throw error;
    }
  }

  clear() {
    this.canvas.getContext('2d').clearRect(0, 0, this.canvas.width, this.canvas.height);
    this.result = null;
  }

  dispose() { this.clear(); }
}
