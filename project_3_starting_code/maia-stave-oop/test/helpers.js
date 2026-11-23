import fs from 'node:fs';
import vm from 'node:vm';
import { createCanvas } from '@napi-rs/canvas';
export const loadExample = name => JSON.parse(fs.readFileSync(new URL(`../examples/${name}.json`, import.meta.url), 'utf8'));
export function makeCanvas() {
  const canvas = createCanvas(1000, 1000);
  canvas.style = {};
  canvas.setAttribute = (key, value) => { canvas[key] = value; };
  return canvas;
}
export function legacyContext() {
  const context = vm.createContext({ document: { getElementById: () => null }, console: { log() {}, warn() {}, error() {} }, $: { extend: Object.assign } });
  vm.runInContext(fs.readFileSync(new URL('../vendor/vexflow.min.js', import.meta.url), 'utf8'), context);
  vm.runInContext(fs.readFileSync(new URL('../../maia-stave/public/composition/lib/maia_vex.js', import.meta.url), 'utf8'), context);
  return context;
}
