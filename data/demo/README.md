# MS2Int Webserver — ZIP Archives (Example Inputs)

This directory contains ready-to-use **ZIP archives** for quick example runs in the web UI.

## Archive list

- `demo_BATCH.zip`: BATCH (CSV batch prediction)
- `demo_FASTA.zip`: FASTA (digestion → batch prediction)
- `demo_RESCORE.zip`: RESCORE (rescoring pipeline)
- `demo_PTM_LOC.zip`: PTM LOC (phosphosite localization / FLR)

## How to extract

From the `MS2Int-webserver/` root:

```bash
unzip data/demo/demo_BATCH.zip -d data/demo
unzip data/demo/demo_FASTA.zip -d data/demo
unzip data/demo/demo_RESCORE.zip -d data/demo
unzip data/demo/demo_PTM_LOC.zip -d data/demo
```

You should get the corresponding folders (`batch/`, `fasta/`, `rescore/`, `ptm_loc/`), each containing its own `README.md`.
