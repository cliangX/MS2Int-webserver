"""MGF (Mascot Generic Format) file parser.

Replaces pyopenms mzML reading in the rescore pipeline.
Supports both plain .mgf and gzip-compressed .mgf.gz files.
"""

from __future__ import annotations

import gzip
import io
import re
from pathlib import Path
from typing import Optional

import numpy as np


def parse_mgf(mgf_path: str) -> list[dict]:
    """Parse an MGF file and return a list of spectrum dicts.

    Each spectrum dict contains:
        title    : str           - raw TITLE line
        scan     : int | None    - scan number extracted from TITLE
        pepmass  : float         - precursor m/z
        charge   : int           - precursor charge
        mz_array : np.ndarray    - fragment m/z values
        int_array: np.ndarray    - fragment intensities (normalized to [0, 1])
    """
    path = Path(mgf_path)
    if path.suffix == ".gz" or path.name.endswith(".mgf.gz"):
        with gzip.open(path, "rt", encoding="utf-8") as fh:
            return _parse_mgf_handle(fh)
    else:
        with open(path, "r", encoding="utf-8") as fh:
            return _parse_mgf_handle(fh)


def _parse_mgf_handle(fh) -> list[dict]:
    """Parse spectra from a file-like object."""
    spectra: list[dict] = []
    in_ions = False
    title = ""
    pepmass = 0.0
    charge = 0
    mzs: list[float] = []
    ints: list[float] = []

    for line in fh:
        line = line.strip()

        if line == "BEGIN IONS":
            in_ions = True
            title = ""
            pepmass = 0.0
            charge = 0
            mzs = []
            ints = []
            continue

        if line == "END IONS":
            in_ions = False
            mz_arr = np.array(mzs, dtype=np.float64)
            int_arr = np.array(ints, dtype=np.float64)
            # Normalize intensities to [0, 1]
            max_int = int_arr.max() if int_arr.size > 0 else 1.0
            if max_int > 0:
                int_arr = int_arr / max_int

            spectra.append({
                "title": title,
                "scan": _extract_scan(title),
                "pepmass": pepmass,
                "charge": charge,
                "mz_array": mz_arr,
                "int_array": int_arr,
            })
            continue

        if not in_ions:
            continue

        # Header fields
        if line.startswith("TITLE="):
            title = line[6:]
            continue
        if line.startswith("PEPMASS="):
            parts = line[8:].split()
            pepmass = float(parts[0])
            continue
        if line.startswith("CHARGE="):
            charge = _parse_charge(line[7:])
            continue
        if line.startswith("RTINSECONDS="):
            continue
        if "=" in line and not line[0].isdigit():
            continue

        # Peak data: m/z intensity
        parts = line.split()
        if len(parts) >= 2:
            try:
                mzs.append(float(parts[0]))
                ints.append(float(parts[1]))
            except ValueError:
                continue

    return spectra


# ── Scan number extraction ────────────────────────────────────────────────

# Common TITLE formats:
#   "RawFile.scan.scan.charge File:..." (msconvert default)
#   "controllerType=0 controllerNumber=1 scan=12345"
#   "index=1234"
#   "scan: 12345"
_SCAN_PATTERNS = [
    re.compile(r"scan=(\d+)"),                    # NativeID format
    re.compile(r"\.(\d+)\.\d+\.\d+\s"),           # msconvert dotted format
    re.compile(r"scans?[:\s]+(\d+)", re.I),        # "scan: 12345" or "scans: 12345"
    re.compile(r"index=(\d+)"),                    # index-based
]


def _extract_scan(title: str) -> Optional[int]:
    """Try to extract scan number from MGF TITLE string."""
    for pattern in _SCAN_PATTERNS:
        m = pattern.search(title)
        if m:
            return int(m.group(1))
    return None


def _parse_charge(s: str) -> int:
    """Parse charge string like '2+', '3-', or just '2'."""
    s = s.strip().rstrip("+-")
    try:
        return int(s)
    except ValueError:
        return 0


def get_mgf_summary(mgf_path: str) -> dict:
    """Quick summary without fully parsing all peaks.

    Returns: {"num_spectra": int, "scan_range": (min, max) | None}
    """
    path = Path(mgf_path)
    opener = gzip.open if (path.suffix == ".gz" or path.name.endswith(".mgf.gz")) else open

    count = 0
    scans: list[int] = []
    with opener(path, "rt", encoding="utf-8") as fh:
        for line in fh:
            line = line.strip()
            if line == "BEGIN IONS":
                count += 1
            elif line.startswith("TITLE="):
                scan = _extract_scan(line[6:])
                if scan is not None:
                    scans.append(scan)

    return {
        "num_spectra": count,
        "scan_range": (min(scans), max(scans)) if scans else None,
    }
