# Woodforde Setup — Scorify 2nd-server

## Deploying in-score harmonic annotations

The analysis worker must use the updated `run_analysis.py` and its companion
`annotate_musicxml.py`. Copy both files from this repository into the directory
specified by `CHORDGNN_DIR`, alongside the existing checkpoint directory. Updating
only the web app does not update this worker code. The poller launches the Python
wrapper for each job, so subsequent jobs use the new files without a poller restart.

Run a new analysis after updating the worker. The wrapper now uses Partitura's beat
and quarter maps to place Roman-numeral text directions at their predicted times,
on staff 1 of the first part. The browser renders that annotated score and exports
the same MusicXML through **Export annotated MusicXML**. Original uploads are kept;
older results with untimed `<harmony>` elements need to be regenerated.

Local annotation checks (no model/checkpoint required):

```bash
python3 -m unittest discover -s test -p 'test_*.py'
```

Do this once. After that just `tmux attach -t scorify` to check on it.

## 1. Connect to woodforde

```bash
# Be on ACoRN VPN first (vpn.acorn.miami.edu via GlobalProtect)
ssh YOUR_USERNAME@10.141.132.109
```

## 2. Clone ChordGNN and set up conda env

```bash
cd ~
git clone https://github.com/manoskary/chordgnn
cd chordgnn

conda create -n chordgnn python=3.8 -y
conda activate chordgnn

# PyTorch — pick the right CUDA version. Check with: nvcc --version
# woodforde has A10 GPUs (CUDA 11.x), so:
conda install pytorch==1.12.0 cudatoolkit=11.3 -c pytorch -y

# torch-scatter (must match PyTorch + CUDA)
pip install torch-scatter -f https://data.pyg.org/whl/torch-1.12.0+cu113.html

pip install -r requirements.txt

conda deactivate
```

**Test it works** (do this on a sample file first):
```bash
conda activate chordgnn
python analyse_score.py --score_path /path/to/some.musicxml
# Should produce some-analysis.musicxml in the same directory
conda deactivate
```

On first run ChordGNN downloads its pretrained weights from Weights & Biases.  
You'll need to log in once: `wandb login` (get a free API key at wandb.ai).

## 3. Clone the Scorify 2nd-server

```bash
cd ~
git clone https://github.com/YOUR_GITHUB_USERNAME/scorify scorify-2nd-server
# OR just scp the 2nd-server/ folder up:
#   scp -r ./2nd-server YOUR_USERNAME@10.141.132.109:~/scorify-2nd-server
```

## 4. Configure .env

```bash
cd ~/scorify-2nd-server
cp .env.example .env
nano .env
```

Fill in:
```
UI_BASE_URL=https://scorify.onrender.com   ← your Render URL
JOBS_SIG=same-secret-as-on-render
CHORDGNN_DIR=/home/YOUR_USERNAME/chordgnn
WORK_DIR=/home/YOUR_USERNAME/scorify_jobs
```

## 5. Install Node dependencies

```bash
cd ~/scorify-2nd-server
# Check Node is available:
node -v   # should be 14+; if not: conda install nodejs or use nvm
npm install
```

## 6. Start in tmux

```bash
tmux new -s scorify
cd ~/scorify-2nd-server
node poll_jobs.js
# You'll see: "Scorify 2nd-server started. Polling https://... every 30s"

# Detach (leave running):  Ctrl+B, then D
```

## Day-to-day commands

```bash
# Reattach to check logs:
tmux attach -t scorify

# Kill and restart after a code change:
tmux attach -t scorify
# Ctrl+C to stop, then:
git pull   # or scp new poll_jobs.js
node poll_jobs.js
# Ctrl+B, D to detach again

# See all sessions:
tmux ls

# Monitor GPU while a job runs (new SSH window):
watch -n 1 nvidia-smi
```

## Troubleshooting

| Problem | Fix |
|---------|-----|
| `conda: command not found` | Add conda to PATH: `export PATH="$HOME/miniconda3/bin:$PATH"` |
| `wandb` login prompt | Run `wandb login` once; paste API key from wandb.ai |
| `torch_scatter` error | Reinstall matching your CUDA: `nvcc --version` → pick right wheel URL |
| Analysis file not found | Check `CHORDGNN_DIR` path and that `analyse_score.py` is in that dir |
| Curl to Render times out | Render free tier spins down; first request is slow — that's normal |
