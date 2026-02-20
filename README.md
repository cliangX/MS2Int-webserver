# MS2Int Web Server

Web interface for MS2Int peptide MS/MS spectrum prediction.

## Features

- **Single Mode**: Predict spectrum for one peptide — returns annotated PNG + ion table
- **Batch Mode**: Upload CSV/TSV → async job queue → download H5 results
- **Pixel Art UI**: NES-inspired design with dark mode support

## Quick Start

```bash
# 1. Activate conda environment
conda activate mamba

# 2. Install frontend dependencies (first time only)
cd webserver/frontend && npm install && cd ..

# 3. Start both servers
bash start.sh
# Options: --gpu 0 --port 8000 --frontend-port 5173
```

Open `http://localhost:5173` in your browser.

## Architecture

```
webserver/
├── backend/          # FastAPI (Python)
│   ├── app.py        # Main app + API routes
│   ├── config.py     # Paths, GPU, model config
│   ├── predictor.py  # Model loading + inference
│   ├── ion_labels.py # Ion annotation + m/z calc
│   ├── spectrum_render.py  # spectrum_utils PNG
│   ├── schemas.py    # Pydantic models
│   └── job_manager.py     # Batch job queue
├── frontend/         # React + Vite + TailwindCSS v4
│   └── src/
│       ├── components/    # UI components
│       ├── api.ts         # API client
│       └── index.css      # Pixel art design tokens
├── start.sh          # One-click launcher
└── PLAN.md           # Full development plan
```

## API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/health` | Health check + model status |
| POST | `/api/predict` | Single peptide prediction |
| GET | `/api/supported-modifications` | List supported PTMs |
| POST | `/api/jobs/submit` | Submit batch CSV/TSV |
| GET | `/api/jobs/{job_id}` | Query job progress |
| GET | `/api/jobs/{job_id}/download` | Download H5 results |
| GET | `/api/jobs` | List all jobs |

## Single Prediction Example

```bash
curl -X POST http://localhost:8000/api/predict \
  -H "Content-Type: application/json" \
  -d '{"sequence":"PEPTIDEK","charge":2,"collision_energy":30,"fragmentation":"HCD"}'
```

## Batch CSV Format

```csv
Sequence,Charge,collision_energy,Fragmentation
PEPTIDEK,2,30,HCD
[Acetyl]-ALLS[Phospho]LATHK,3,25,HCD
```

Required columns: `Sequence`, `Charge`, `collision_energy`, `Fragmentation`

## Supported Parameters

- **Charges**: 1–6
- **Collision Energies**: 10, 20, 23, 25, 26, 27, 28, 29, 30, 35, 40, 42
- **Fragmentation**: HCD, CID
- **Max peptide length**: 30 amino acids
- **Modifications**: M[Oxidation], S[Phospho], T[Phospho], C[Carbamidomethyl], [Acetyl]-, K[Acetyl], K[GG], and more

## Requirements

- Python 3.10+ with `mamba_ssm`, `torch`, `fastapi`, `spectrum-utils`
- Node.js 18+ for frontend
- CUDA GPU (~50MB VRAM for model)
