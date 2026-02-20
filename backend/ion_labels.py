"""Ion annotation matrix and theoretical m/z computation.

Replicates the 31×29 ANNOTATION_MATRIX layout used during training,
and provides helpers to convert a (29, 31) intensity matrix into a
labelled ion list with theoretical m/z values.
"""

from __future__ import annotations

import numpy as np

# ── Constants ──────────────────────────────────────────────────────────────
ION_ROWS = 31  # ion-type dimension (b, b²⁺, y, y²⁺, m-series …)
ION_COLS = 29  # position dimension (max peptide length - 1)

# Standard amino acid monoisotopic residue masses (Da)
AA_MASS: dict[str, float] = {
    "G": 57.02146,  "A": 71.03711,  "V": 99.06841,  "L": 113.08406,
    "I": 113.08406, "P": 97.05276,  "F": 147.06841, "W": 186.07931,
    "M": 131.04049, "S": 87.03203,  "T": 101.04768, "C": 103.00919,
    "Y": 163.06333, "H": 137.05891, "D": 115.02694, "E": 129.04259,
    "N": 114.04293, "Q": 128.05858, "K": 128.09496, "R": 156.10111,
}

# Modification delta masses (Da)
MOD_MASS: dict[str, float] = {
    "Oxidation": 15.99491,
    "Carbamidomethyl": 57.02146,
    "Phospho": 79.96633,
    "Acetyl": 42.01057,
    "Dimethyl": 28.03130,
    "Trimethyl": 42.04695,
    "Formyl": 27.99492,
    "Methyl": 14.01565,
    "GG": 114.04293,
    "Glu->pyro-Glu": -18.01056,
    "Gln->pyro-Glu": -17.02655,
    "Propionyl": 56.02621,
    "Succinyl": 100.01604,
    "Biotin": 226.07760,
    "HexNAc": 203.07937,
    "Nitro": 44.98508,
}

PROTON_MASS = 1.007276
WATER_MASS = 18.01056


def _build_annotation_matrix() -> tuple[np.ndarray, dict[str, int]]:
    """Build the (31, 29) annotation matrix and name → flat-index mapping."""
    mat = np.full((ION_ROWS, ION_COLS), "", dtype=object)
    # b series (row 0)
    for i in range(ION_COLS):
        mat[0, i] = f"b{i + 1}"
    # b²⁺ series (row 1)
    for i in range(ION_COLS):
        mat[1, i] = f"b{i + 1}^2"
    # y series (row 2)
    for i in range(ION_COLS):
        mat[2, i] = f"y{i + 1}"
    # y²⁺ series (row 3)
    for i in range(ION_COLS):
        mat[3, i] = f"y{i + 1}^2"
    # m (internal) ranges (rows 4–30)
    for row in range(4, ION_ROWS):
        for col in range(ION_COLS):
            m_start = col + 2
            m_end = m_start + (row - 2)
            if m_end <= ION_COLS:
                mat[row, col] = f"m{m_start}:{m_end}"
    # Immonium ions override last column
    mat[0, 28] = "IH"
    mat[1, 28] = "IR"
    mat[2, 28] = "IF"
    mat[3, 28] = "IY"

    ion_to_idx = {name: i for i, name in enumerate(mat.ravel().tolist()) if name}
    return mat, ion_to_idx


ANNOTATION_MATRIX, ION_TO_IDX = _build_annotation_matrix()


# ── Tokenizer (mirrors preprocess.py) ─────────────────────────────────────

def tokenize_peptide(seq: str) -> list[str]:
    """Tokenize an annotated peptide string into residue tokens."""
    tokens: list[str] = []
    i, n = 0, len(seq)
    if seq.startswith("["):
        j = seq.find("]-", 0)
        if j == -1:
            raise ValueError("N-terminus modification missing ']-'")
        tokens.append(seq[: j + 2])
        i = j + 2
    while i < n:
        if seq.startswith("-[]", i):
            tokens.append("-[]")
            i += 3
            continue
        ch = seq[i]
        if "A" <= ch <= "Z":
            i += 1
            if i < n and seq[i] == "[":
                j = seq.find("]", i)
                if j == -1:
                    raise ValueError("Residue modification missing ']'")
                tokens.append(ch + seq[i : j + 1])
                i = j + 1
            else:
                tokens.append(ch)
        else:
            raise ValueError(f"Invalid character '{ch}' at pos {i}")
    return tokens


def _residue_masses(tokens: list[str]) -> list[float]:
    """Convert tokens to a list of residue masses."""
    masses: list[float] = []
    for tok in tokens:
        if tok in ("[]-", "-[]"):
            continue
        if tok.startswith("[") and tok.endswith("]-"):
            mod_name = tok[1:-2]
            masses.append(MOD_MASS.get(mod_name, 0.0))
            continue
        aa = tok[0]
        base = AA_MASS.get(aa, 0.0)
        if "[" in tok:
            mod_name = tok[2:-1]
            base += MOD_MASS.get(mod_name, 0.0)
        masses.append(base)
    return masses


def compute_theoretical_mz(sequence: str, charge: int) -> dict[str, float]:
    """Compute theoretical m/z for b and y ions (charge 1+ and 2+).

    Returns a dict mapping ion label → m/z.
    """
    tokens = tokenize_peptide(sequence)
    residue_masses = _residue_masses(tokens)
    n = len(residue_masses)
    if n == 0:
        return {}

    # N-term offset for Acetyl etc.
    nterm_offset = 0.0
    if tokens and tokens[0].startswith("[") and tokens[0].endswith("]-"):
        nterm_offset = MOD_MASS.get(tokens[0][1:-2], 0.0)

    # Prefix sums for b ions
    prefix = [0.0] * (n + 1)
    for i in range(n):
        prefix[i + 1] = prefix[i] + residue_masses[i]

    total_mass = prefix[n]
    mz_map: dict[str, float] = {}

    for i in range(1, n):  # b1 .. b(n-1)
        b_mass = prefix[i] + nterm_offset
        mz_map[f"b{i}"] = (b_mass + PROTON_MASS) / 1
        mz_map[f"b{i}^2"] = (b_mass + 2 * PROTON_MASS) / 2

        y_mass = total_mass - prefix[i] + WATER_MASS
        mz_map[f"y{i}"] = (y_mass + PROTON_MASS) / 1
        mz_map[f"y{i}^2"] = (y_mass + 2 * PROTON_MASS) / 2

    return mz_map


def intensity_matrix_to_ion_list(
    intensity_matrix: np.ndarray,
    sequence: str,
    charge: int,
    min_intensity: float = 0.0,
) -> list[dict]:
    """Convert a (29, 31) intensity matrix to a list of ion dicts.

    Each dict: {"label": str, "mz": float, "intensity": float, "type": str}
    """
    mz_map = compute_theoretical_mz(sequence, charge)
    ions: list[dict] = []

    for pos in range(intensity_matrix.shape[0]):   # 0..28
        for ion_type in range(intensity_matrix.shape[1]):  # 0..30
            intensity = float(intensity_matrix[pos, ion_type])
            if intensity <= min_intensity:
                continue
            label = str(ANNOTATION_MATRIX[ion_type, pos])
            if not label:
                continue

            ion_dict: dict = {
                "label": label,
                "intensity": round(intensity, 6),
            }
            # Determine ion type category
            if label.startswith("b"):
                ion_dict["type"] = "b"
            elif label.startswith("y"):
                ion_dict["type"] = "y"
            elif label.startswith("m"):
                ion_dict["type"] = "internal"
            elif label.startswith("I"):
                ion_dict["type"] = "immonium"
            else:
                ion_dict["type"] = "other"

            ion_dict["mz"] = round(mz_map.get(label, 0.0), 4)
            ions.append(ion_dict)

    # Sort by intensity descending
    ions.sort(key=lambda x: x["intensity"], reverse=True)
    return ions
