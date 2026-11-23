/** A separate overlay leaves the rendered score untouched during playback. */
export class ScoreCursor {
  constructor(element, renderer) { this.element = element; this.renderer = renderer; }
  hide() { this.element.hidden = true; }
  move(beat) {
    const result = this.renderer.result;
    if (!result) return this.hide();
    const system = result.systemBarLimits.findLastIndex(s => beat >= s.systemOntime);
    const starts = result.verticalStarts[system];
    if (!starts?.length) return this.hide();
    const keys = Object.keys(result.ontimeXLoc).map(Number).sort((a, b) => a - b)
      .filter(k => result.systemBarLimits.findLastIndex(s => k >= s.systemOntime) === system);
    const before = keys.findLast(k => k <= beat);
    const after = keys.find(k => k > beat);
    if (before === undefined) return this.hide();
    const left = result.ontimeXLoc[before][0];
    const x = after === undefined ? left : left + (result.ontimeXLoc[after][0] - left) * (beat - before) / (after - before);
    this.element.style.left = `${x}px`;
    this.element.style.top = `${starts[0]}px`;
    this.element.style.height = `${starts.at(-1) - starts[0] + result.misc.staffSpacer}px`;
    this.element.hidden = false;
  }
}
