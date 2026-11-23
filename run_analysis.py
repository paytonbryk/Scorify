"""
run_analysis.py  —  CLI wrapper for analysisgnn
Usage:
    python run_analysis.py --score_path input.musicxml
Outputs:
    <input>-analysis.csv        (per-note predictions)
    <input>-analysis.musicxml   (timed Roman numerals above the top staff)
"""
import argparse
import os
import sys
import torch
import partitura as pt
from bisect import bisect_right
from annotate_musicxml import annotate_musicxml

parser = argparse.ArgumentParser()
parser.add_argument("--score_path", required=True, help="Path to input MusicXML file")
parser.add_argument("--ckpt", default=None,
                    help="Path to model.ckpt (auto-detected if omitted)")
args = parser.parse_args()

# --- locate checkpoint ---
if args.ckpt:
    ckpt_path = args.ckpt
else:
    candidates = [
        os.path.join(os.path.dirname(os.path.abspath(__file__)), "checkpoint", "model.ckpt"),
        os.path.expanduser("~/chordgnn/checkpoint/model.ckpt"),
    ]
    ckpt_path = next((p for p in candidates if os.path.exists(p)), None)
    if not ckpt_path:
        print("ERROR: cannot find model.ckpt. Pass --ckpt /path/to/model.ckpt", file=sys.stderr)
        sys.exit(1)

print(f"Using checkpoint: {ckpt_path}", flush=True)

# --- load model ---
try:
    from analysisgnn.inference.hybrid_predictor import HybridAnalysisPredictor, predictions_to_dataframe
except ImportError as e:
    print(f"ERROR: could not import analysisgnn: {e}", file=sys.stderr)
    print("Run: pip install git+https://github.com/manoskary/analysisgnn.git@gradio", file=sys.stderr)
    sys.exit(1)

device = os.environ.get("ANALYSISGNN_DEVICE", "cuda" if torch.cuda.is_available() else "cpu")
print(f"Device: {device}", flush=True)

try:
    predictor = HybridAnalysisPredictor(
        full_checkpoint_path=ckpt_path,
        masked_checkpoint_path=ckpt_path,
        device=device,
    )
    predictor.get_full_model()
except Exception as e:
    print(f"ERROR loading model: {e}", file=sys.stderr)
    sys.exit(1)

# --- load score ---
print(f"Loading score: {args.score_path}", flush=True)
try:
    score = pt.load_score(args.score_path)
except Exception as e:
    print(f"ERROR loading score: {e}", file=sys.stderr)
    sys.exit(1)

# --- run inference ---
print("Running analysis...", flush=True)
with torch.no_grad():
    output, route = predictor.predict(
        score,
        force_route="full",
        aggregation_spec={"mode": "none"},
        return_route=True,
    )

predictions = output[0] if isinstance(output, tuple) else output

tasks = ["localkey", "romanNumeral", "root", "inversion", "quality", "cadence"]
df = predictions_to_dataframe(
    score=score,
    predictions=predictions,
    tasks=tasks,
    include_confidence=True,
    include_class_ids=False,
)

print(df[["onset_beat", "measure", "romanNumeral", "localkey", "root", "quality"]].to_string())

# --- save CSV ---
stem = os.path.splitext(os.path.abspath(args.score_path))[0]
csv_path = stem + "-analysis.csv"
df.to_csv(csv_path, index=False)
print(f"\nCSV saved: {csv_path}", flush=True)

# --- annotate the original MusicXML at the model's written-score positions ---
xml_out = stem + "-analysis.musicxml"
try:
    top_part = score.parts[0]
    measures = list(top_part.iter_all(pt.score.Measure))
    starts = [measure.start.t for measure in measures]
    if not starts:
        raise ValueError("The loaded score has no measures.")
    events = []
    for row in df.to_dict("records"):
        # Beat units may change with meter and pickups. Let Partitura map them
        # back to the score timeline, then express local offsets in quarters.
        position = float(top_part.inv_beat_map(float(row["onset_beat"])))
        measure_index = bisect_right(starts, position + 1e-6) - 1
        if measure_index < 0:
            raise ValueError("Prediction precedes the first measure.")
        offset = float(top_part.quarter_map(position)) - float(top_part.quarter_map(starts[measure_index]))
        events.append({**row, "measure_index": measure_index, "offset_quarter": max(0, offset)})
    count = annotate_musicxml(args.score_path, xml_out, events)
    print(f"Annotated MusicXML saved: {xml_out} ({count} labels)", flush=True)
except Exception as e:
    print(f"ERROR: could not write annotated MusicXML ({e}). CSV saved for diagnosis.", file=sys.stderr)
    sys.exit(1)

print("Done.", flush=True)
