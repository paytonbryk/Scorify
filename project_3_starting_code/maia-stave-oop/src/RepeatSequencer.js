import { EngravingEngine } from './EngravingEngine.js';

/** Preserves the original limited repeat/first-and-second-ending interpretation. */
export class RepeatSequencer {
  constructor(timing = new EngravingEngine()) { this.timing = timing; }
jumps(seq, timeSigs){
  var cumu = 0;
  var agc = []; // Format of [at_ontime, goto_ontime, cumulative_ontime].

  var backStop = seq.filter(function(s){
    return s.endingType !== undefined && s.endingType == "stop" &&
      s.repeatDir !== undefined && s.repeatDir == "backward";
  });

  while (backStop.length > 0){
    var endingNo = 1;
    // There is at least one repetition sign that remains unresolved, so we must
    // deal with it.
    var forwardStart = seq.filter(function(s){
      return s.repeatDir !== undefined && s.repeatDir == "forward";
    });
    if (forwardStart.length == 0) {
      // There was no specified location to which to return, so assume it's the
      // beginning of bar number 1.
      forwardStart.push({
        barNo: 1,
        type: 'barline',
        location: 'left',
        repeatDir: 'forward',
        ontime: 0
      });
    }

    // Derive the triple to push to agc.
    var a = cumu +
      this.timing.ontime_of_bar_and_beat_number(backStop[0].barNo + 1, 1, timeSigs);
      // mu.this.timing.ontime_of_bar_and_beat_number(backStop[0].barNo + 1, 1, timeSignatures);
    var g = forwardStart[0].ontime;
    if (agc.length == 0){
      cumu = a;
    }
    else {
      cumu = cumu + g - agc[agc.length - 1][1];
    }
    agc.push([a, g, cumu]);

    // Catch any first or second time bars...
    var forwardStop = seq.filter(function(s){
      return s.endingType !== undefined && s.endingType == "start" &&
        s.endingNo !== undefined && s.endingNo == endingNo.toString();
    });
    var backStart = seq.filter(function(s){
      return s.endingType !== undefined && s.endingType == "start" &&
        s.endingNo !== undefined && s.endingNo == (endingNo + 1).toString();
    });
    if (forwardStop.length > 0 && backStart.length > 0){
      // Handle first and second time bars.
      var a = forwardStop[0].ontime;
      var g = backStart[0].ontime;
      cumu = cumu + a - agc[agc.length - 1][1];
      agc.push([a, g, cumu]);
    }

    // Resolved the current repetition sign, so make backStop and forwardStart
    // one shorter each.
    backStop.shift();
    forwardStart.shift();
    endingNo++;
  }
  return agc;
}
}
