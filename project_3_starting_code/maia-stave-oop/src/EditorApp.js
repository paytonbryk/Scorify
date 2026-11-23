import { Composition } from './Composition.js';
import { ScoreRenderer } from './ScoreRenderer.js';
import { PlaybackController } from './PlaybackController.js';
import { ScoreCursor } from './ScoreCursor.js';

export class EditorApp {
  constructor(root, { JSONEditor, Vex, Tone }) {
    this.root = root;
    this.events = new AbortController();
    this.editor = new JSONEditor(root.querySelector('#editor'), { mode: 'code', modes: ['code', 'tree'] });
    this.renderer = new ScoreRenderer(root.querySelector('canvas'), { Vex });
    this.cursor = new ScoreCursor(root.querySelector('#cursor'), this.renderer);
    this.playback = new PlaybackController({ Tone, onPosition: beat => this.cursor.move(beat), onStop: () => this.cursor.hide() });
    this.loadVersion = 0;
    const bind = (selector, event, handler) => root.querySelector(selector).addEventListener(event, handler, { signal: this.events.signal });
    bind('#piece', 'change', event => this.loadExample(event.target.value));
    bind('#update', 'click', () => this.update());
    bind('#play', 'click', async () => {
      try {
        const composition = this.update();
        if (composition) {
          await this.playback.play(composition);
          if (this.playback.playing) this.status('Playing with synthesized instruments.');
        }
      } catch (error) { this.playback.stop(); this.status(error.message, true); }
    });
    bind('#stop', 'click', () => { this.playback.stop(); this.status('Stopped.'); });
    bind('#import', 'change', async event => {
      const file = event.target.files[0];
      if (!file) return;
      const version = ++this.loadVersion;
      this.playback.stop();
      try {
        const data = JSON.parse(await file.text());
        if (version !== this.loadVersion) return;
        const composition = new Composition(data);
        this.editor.set(composition.toJSON());
        this.update();
      } catch (error) { if (version === this.loadVersion) this.status(error.message, true); }
      event.target.value = '';
    });
    bind('#export', 'click', () => {
      try {
        const composition = Composition.fromJSON(this.editor.get());
        const url = URL.createObjectURL(new Blob([JSON.stringify(composition, null, 2)], { type: 'application/json' }));
        const link = document.createElement('a');
        link.href = url; link.download = 'composition.json'; link.click();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
      } catch (error) { this.status(error.message, true); }
    });
  }

  status(message, error = false) {
    const status = this.root.querySelector('#status');
    status.textContent = message;
    status.dataset.error = String(error);
  }

  async loadExample(name) {
    const version = ++this.loadVersion;
    this.playback.stop();
    this.status('Loading composition…');
    try {
      const response = await fetch(`./examples/${encodeURIComponent(name)}.json`);
      if (!response.ok) throw new Error(`Could not load ${name}.`);
      const data = await response.json();
      if (version !== this.loadVersion) return;
      this.editor.set(data);
      if (name.endsWith('specification')) {
        this.renderer.clear();
        this.status('Schema reference loaded. Select a composition to render or play.');
      } else this.update();
    } catch (error) { if (version === this.loadVersion) this.status(error.message, true); }
  }

  update() {
    this.playback.stop();
    try {
      const composition = Composition.fromJSON(this.editor.get());
      this.renderer.render(composition);
      this.status(`Rendered ${composition.name}.`);
      return composition;
    } catch (error) {
      this.renderer.clear();
      this.status(error.message, true);
      return null;
    }
  }

  dispose() {
    this.loadVersion++;
    this.events.abort();
    this.playback.dispose();
    this.renderer.dispose();
    this.editor.destroy();
  }
}
