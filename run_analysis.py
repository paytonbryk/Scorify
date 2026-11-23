"""
run_analysis.py  —  CLI wrapper for analysisgnn
Usage:
    python run_analysis.py --score_path input.musicxml
Outputs:
    <input>-analysis.csv        (per-note predictions)
    <input>-analysis.musicxml   (harmony elements injected)
"""
import argparse
import os
import sys
import torch
import partitura as pt
from lxml import etree

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

# --- inject <harmony> into MusicXML ---
xml_out = stem + "-analysis.musicxml"
try:
    tree = etree.parse(args.score_path)
    root_el = tree.getroot()
    ns = root_el.nsmap.get(None, "")
    ns_prefix = f"{{{ns}}}" if ns else ""

    measures = root_el.findall(f".//{ns_prefix}measure")
    measure_map = {}
    for m in measures:
        num = m.get("number", "")
        if num:
            measure_map[num] = m

    # one harmony element per unique (measure, romanNumeral) pair
    seen = set()
    for _, row in df.iterrows():
        mnum = str(int(row.get("measure", 0)))
        rn   = str(row.get("romanNumeral", "?"))
        key  = str(row.get("localkey", "?"))
        sig  = (mnum, rn, key)
        if sig in seen or mnum not in measure_map:
            continue
        seen.add(sig)

        m_el = measure_map[mnum]
        harmony = etree.SubElement(m_el, "harmony")
        fn = etree.SubElement(harmony, "function")
        fn.text = f"{key}: {rn}"
        kind_el = etree.SubElement(harmony, "kind")
        kind_el.text = "major"

    tree.write(xml_out, pretty_print=True, xml_declaration=True, encoding="UTF-8")
    print(f"Annotated MusicXML saved: {xml_out}", flush=True)
except Exception as e:
    print(f"Warning: could not write annotated MusicXML ({e}). CSV is still valid.", file=sys.stderr)

print("Done.", flush=True)
