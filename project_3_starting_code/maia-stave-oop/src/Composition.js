/** Owns Composition Object data without dropping MusicXML notation metadata. */
export class Composition {
  #data;

  constructor(data) {
    if (!data || typeof data !== 'object' || Array.isArray(data)) {
      throw new TypeError('A composition must be a JSON object.');
    }
    this.#data = structuredClone(data);
    this.validate();
  }

  static fromJSON(json) {
    return new Composition(typeof json === 'string' ? JSON.parse(json) : json);
  }

  get name() { return this.#data.name || 'Untitled composition'; }
  toJSON() { return structuredClone(this.#data); }

  validate() {
    const data = this.#data;
    for (const key of ['layer', 'notes', 'rests', 'timeSignatures', 'keySignatures',
      'clefChanges', 'expressions', 'sequencing', 'tempi']) {
      if (!Array.isArray(data[key])) throw new TypeError(`${key} must be an array.`);
    }
    if (!data.layer.length || !data.timeSignatures.length || !data.keySignatures.length) {
      throw new TypeError('At least one staff, time signature, and key signature are required.');
    }
    if (!data.notes.length && !data.rests.length) {
      throw new TypeError('Select a piece with notes or rests; the specifications are schema examples.');
    }
    if (!data.pageLayout || !data.miscXML || !Number.isFinite(data.miscXML.anacrusis)) {
      throw new TypeError('pageLayout and miscXML.anacrusis are required.');
    }
    const staffNumbers = new Set(data.layer.map(layer => layer.staffNo));
    for (const key of ['notes', 'rests']) {
      data[key].forEach((event, index) => {
        if (data.layer.find(layer => layer.staffNo === event.staffNo)?.vexflow?.hidden) return;
        for (const field of ['ontime', 'offtime', 'duration', 'barOn', 'barOff', 'beatOn', 'beatOff', 'staffNo', 'voiceNo']) {
          if (!Number.isFinite(event[field])) throw new TypeError(`${key}[${index}].${field} must be a number.`);
        }
        if (event.duration <= 0 || event.offtime <= event.ontime) {
          throw new TypeError(`${key}[${index}] must have a positive duration.`);
        }
        if (!staffNumbers.has(event.staffNo)) throw new TypeError(`${key}[${index}] refers to an unknown staff.`);
        if (key === 'notes' && typeof event.pitch !== 'string') {
          throw new TypeError(`notes[${index}].pitch must be a string.`);
        }
      });
    }
    for (const signature of data.timeSignatures) {
      if (!(signature.topNo > 0 && signature.bottomNo > 0) || !Number.isFinite(signature.ontime)) {
        throw new TypeError('Time signatures require positive topNo/bottomNo and numeric ontime.');
      }
    }
    for (const tempo of data.tempi) {
      if (!Number.isFinite(tempo.bpm) || tempo.bpm <= 0 || !Number.isFinite(tempo.ontime)) {
        throw new TypeError('Tempi require positive bpm and numeric ontime.');
      }
    }
    return this;
  }
}
