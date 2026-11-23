import { EditorApp } from './EditorApp.js';
const app = new EditorApp(document.querySelector('main'), {
  JSONEditor: window.JSONEditor, Vex: window.Vex, Tone: window.Tone
});
app.loadExample('if_ye_love_me');
window.addEventListener('pagehide', () => app.dispose(), { once: true });
