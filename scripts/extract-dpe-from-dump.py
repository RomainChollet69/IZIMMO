#!/usr/bin/env python3
"""
Extract DPE data from ADEME PostgreSQL dump (dump_dpev2_prod_fdld.sql.gz).

Single-pass streaming through the gzip file — no PostgreSQL needed.
Filters: date_etablissement_dpe >= 2022-01-01, desactive = false.
Outputs compact JSON per department (same format as generate-dpe-json.py).

Usage:
    python3 scripts/extract-dpe-from-dump.py
"""

import gzip
import json
import os
import sys
import time

# Force unbuffered output for progress monitoring
sys.stdout.reconfigure(line_buffering=True)

from pyproj import Transformer

# ── Config ──────────────────────────────────────────────────────────

INPUT_FILE = os.path.expanduser("~/Downloads/dump_dpev2_prod_fdld.sql.gz")
OUTPUT_DIR = os.path.expanduser("~/Downloads/DPE/dpe-data")
MIN_DATE = "2022-01-01"

# DPE class mapping: letter → compact code
CLASS_MAP = {"A": 1, "B": 2, "C": 3, "D": 4, "E": 5, "F": 6, "G": 7}

# Building type mapping
TYPE_MAP = {"appartement": 1, "maison": 2, "immeuble": 3}

# Lambert-93 → WGS84 transformer
L93_TO_WGS84 = Transformer.from_crs("EPSG:2154", "EPSG:4326", always_xy=True)

# Tables we need (in the order they appear in the dump, alphabetical)
TABLES_NEEDED = {
    "public.dpe",
    "public.dpe_caracteristique_generale",
    "public.dpe_emission_ges",
    "public.dpe_enum_methode_application_dpe_log",
    "public.dpe_ep_conso",
    "public.dpe_geolocalisation",
    "public.dpe_t_adresse",
}

# ── Helpers ─────────────────────────────────────────────────────────


def parse_float(val):
    if val == "\\N" or val == "" or val is None:
        return 0.0
    try:
        return float(val)
    except (ValueError, TypeError):
        return 0.0


def parse_int(val):
    if val == "\\N" or val == "" or val is None:
        return 0
    try:
        return int(float(val))
    except (ValueError, TypeError):
        return 0


def convert_coords(x, y):
    """Convert BAN coordinates to WGS84 (lng, lat).

    BAN x/y are in Lambert-93 (EPSG:2154) for metropolitan France.
    x = easting (100k-1.2M), y = northing (6M-7.2M).
    """
    try:
        xf, yf = float(x), float(y)
    except (ValueError, TypeError):
        return None, None

    # Check if already WGS84 (unlikely but safe)
    if -180 <= xf <= 180 and -90 <= yf <= 90:
        return round(xf, 4), round(yf, 4)

    # Lambert-93 range check
    if 100000 <= xf <= 1300000 and 6000000 <= yf <= 7200000:
        lng, lat = L93_TO_WGS84.transform(xf, yf)
        if -180 <= lng <= 180 and -90 <= lat <= 90:
            return round(lng, 4), round(lat, 4)

    return None, None


def fmt_progress(current, total_bytes):
    pct = current / total_bytes * 100 if total_bytes else 0
    return f"{pct:.1f}%"


# ── Main ────────────────────────────────────────────────────────────


def main():
    if not os.path.exists(INPUT_FILE):
        print(f"ERROR: File not found: {INPUT_FILE}")
        sys.exit(1)

    file_size = os.path.getsize(INPUT_FILE)
    print(f"Input:  {INPUT_FILE}")
    print(f"Size:   {file_size / 1024**3:.1f} GB compressed")
    print(f"Filter: date >= {MIN_DATE}")
    print(f"Output: {OUTPUT_DIR}")
    print("=" * 70)

    os.makedirs(OUTPUT_DIR, exist_ok=True)

    # ── Data stores ─────────────────────────────────────────────────
    valid_ids = {}              # DPE UUIDs post-2022 and active → date_etablissement_dpe
    carac = {}                  # dpe_id → (surface, year, type_enum_id)
    energy = {}                 # dpe_id → (classe_bilan_dpe, ep_conso_5_usages_m2)
    ges = {}                    # dpe_id → (classe_emission_ges, emission_ges_5_usages_m2)
    type_enum = {}              # enum_id → type_batiment string
    geo_links = {}              # dpe_id → adresse_bien_id
    needed_addr_ids = set()
    addresses = {}              # address_id → (x, y, postcode, dept, label, complement)

    current_table = None
    col_idx = None  # dict mapping column name → index

    # Counters
    rows_read = 0
    tables_processed = set()
    bytes_read = 0
    last_report = time.time()
    start = time.time()

    print("Pass: streaming through dump...")
    print()

    with gzip.open(INPUT_FILE, "rt", encoding="utf-8", errors="replace") as f:
        for line in f:
            bytes_read += len(line.encode("utf-8"))

            # ── Detect COPY block start ─────────────────────────────
            if line.startswith("COPY "):
                # Format: COPY public.table (col1, col2, ...) FROM stdin;
                paren_start = line.find("(")
                if paren_start == -1:
                    current_table = None
                    continue

                table = line[5:paren_start].strip()

                if table in TABLES_NEEDED:
                    paren_end = line.find(")", paren_start)
                    cols_str = line[paren_start + 1:paren_end]
                    cols = [c.strip() for c in cols_str.split(",")]
                    col_idx = {name: i for i, name in enumerate(cols)}
                    current_table = table
                    tables_processed.add(table)
                    print(f"  Reading {table}...")
                else:
                    current_table = None
                continue

            # ── Detect COPY block end ───────────────────────────────
            if line.startswith("\\."):
                if current_table:
                    print(f"    done.")
                current_table = None
                col_idx = None
                continue

            # ── Skip if not in a needed table ───────────────────────
            if current_table is None:
                continue

            # ── Parse tab-separated row ─────────────────────────────
            vals = line.rstrip("\n").split("\t")
            rows_read += 1

            # Progress report every 10s
            now = time.time()
            if now - last_report > 10:
                last_report = now
                elapsed = now - start
                speed = bytes_read / elapsed / 1024**2 if elapsed > 0 else 0
                print(f"    [{fmt_progress(bytes_read, file_size)}] "
                      f"{rows_read:,} rows | {elapsed:.0f}s | {speed:.0f} MB/s")

            # ── TABLE: dpe ──────────────────────────────────────────
            if current_table == "public.dpe":
                try:
                    dpe_id = vals[col_idx["id"]]
                    date_str = vals[col_idx["date_etablissement_dpe"]]
                    desactive = vals[col_idx["desactive"]]

                    # Filter: active only
                    if desactive == "t":
                        continue

                    # Filter: date >= 2022
                    if date_str == "\\N" or date_str < MIN_DATE:
                        continue

                    # Store date (YYYY-MM-DD → YYYYMMDD integer for compactness)
                    date_int = int(date_str[:10].replace("-", "")) if date_str != "\\N" else 0
                    valid_ids[dpe_id] = date_int
                except (KeyError, IndexError):
                    continue

            # ── TABLE: dpe_caracteristique_generale ──────────────────
            elif current_table == "public.dpe_caracteristique_generale":
                try:
                    dpe_id = vals[col_idx["dpe_id"]]
                    if dpe_id not in valid_ids:
                        continue

                    surface = parse_float(vals[col_idx["surface_habitable_logement"]])
                    year = parse_int(vals[col_idx["annee_construction"]])
                    type_enum_id = parse_int(vals[col_idx["enum_methode_application_dpe_log_id"]])

                    carac[dpe_id] = (surface, year, type_enum_id)
                except (KeyError, IndexError):
                    continue

            # ── TABLE: dpe_emission_ges ──────────────────────────────
            elif current_table == "public.dpe_emission_ges":
                try:
                    dpe_id = vals[col_idx["dpe_id"]]
                    if dpe_id not in valid_ids:
                        continue

                    classe = vals[col_idx["classe_emission_ges"]].strip().upper()
                    emission = parse_float(vals[col_idx["emission_ges_5_usages_m2"]])

                    ges[dpe_id] = (classe, emission)
                except (KeyError, IndexError):
                    continue

            # ── TABLE: dpe_enum_methode_application_dpe_log ─────────
            elif current_table == "public.dpe_enum_methode_application_dpe_log":
                try:
                    enum_id = parse_int(vals[col_idx["id"]])
                    tb = vals[col_idx["type_batiment"]].strip().lower()
                    if tb != "\\N":
                        type_enum[enum_id] = tb
                except (KeyError, IndexError):
                    continue

            # ── TABLE: dpe_ep_conso ─────────────────────────────────
            elif current_table == "public.dpe_ep_conso":
                try:
                    dpe_id = vals[col_idx["dpe_id"]]
                    if dpe_id not in valid_ids:
                        continue

                    classe = vals[col_idx["classe_bilan_dpe"]].strip().upper()
                    conso = parse_float(vals[col_idx["ep_conso_5_usages_m2"]])

                    energy[dpe_id] = (classe, conso)
                except (KeyError, IndexError):
                    continue

            # ── TABLE: dpe_geolocalisation ──────────────────────────
            elif current_table == "public.dpe_geolocalisation":
                try:
                    admin_id = vals[col_idx["administratif_id"]]
                    if admin_id not in valid_ids:
                        continue

                    addr_id = vals[col_idx["adresse_bien_id"]]
                    if addr_id != "\\N":
                        geo_links[admin_id] = addr_id
                        needed_addr_ids.add(addr_id)
                except (KeyError, IndexError):
                    continue

            # ── TABLE: dpe_t_adresse ────────────────────────────────
            elif current_table == "public.dpe_t_adresse":
                try:
                    addr_id = vals[col_idx["id"]]
                    if addr_id not in needed_addr_ids:
                        continue

                    x = vals[col_idx["ban_x"]]
                    y = vals[col_idx["ban_y"]]
                    postcode = vals[col_idx.get("ban_postcode", -1)] if "ban_postcode" in col_idx else ""
                    dept = vals[col_idx.get("ban_departement", -1)] if "ban_departement" in col_idx else ""

                    # Adresse textuelle (label BAN ou champ adresse)
                    label = ""
                    for field in ("ban_label", "adresse_brut", "nom_rue"):
                        if field in col_idx:
                            val = vals[col_idx[field]]
                            if val and val != "\\N":
                                label = val.strip()
                                break

                    # Complément d'adresse (étage, porte, bâtiment)
                    complement = ""
                    for field in ("complement_adresse_logement", "complement_adresse"):
                        if field in col_idx:
                            val = vals[col_idx[field]]
                            if val and val != "\\N":
                                complement = val.strip()
                                break

                    if x == "\\N" or y == "\\N":
                        continue

                    if postcode == "\\N":
                        postcode = ""
                    if dept == "\\N":
                        dept = ""

                    addresses[addr_id] = (x, y, postcode, dept, label, complement)
                except (KeyError, IndexError):
                    continue

    elapsed = time.time() - start
    print()
    print(f"Streaming done in {elapsed:.0f}s ({elapsed/60:.1f} min)")
    print(f"Tables processed: {len(tables_processed)}")
    print(f"Valid DPE (post-2022, active): {len(valid_ids):,} (with dates)")
    print(f"  with characteristics: {len(carac):,}")
    print(f"  with energy class:    {len(energy):,}")
    print(f"  with GES:             {len(ges):,}")
    print(f"  with geo link:        {len(geo_links):,}")
    print(f"  addresses loaded:     {len(addresses):,}")
    print(f"  type enum entries:    {len(type_enum)}")
    print()

    # ── Join & group by department ──────────────────────────────────
    print("Joining data and grouping by department...")

    dept_data = {}  # dept → list of compact rows
    skipped = {"no_energy": 0, "no_class": 0, "no_geo": 0, "no_addr": 0, "no_coords": 0}

    for dpe_id in valid_ids:
        # Must have energy class
        if dpe_id not in energy:
            skipped["no_energy"] += 1
            continue

        dpe_class_letter, conso = energy[dpe_id]
        if dpe_class_letter not in CLASS_MAP:
            skipped["no_class"] += 1
            continue

        # Must have geo link and address
        if dpe_id not in geo_links:
            skipped["no_geo"] += 1
            continue

        addr_id = geo_links[dpe_id]
        if addr_id not in addresses:
            skipped["no_addr"] += 1
            continue

        x_str, y_str, postcode, dept, addr_label, addr_complement = addresses[addr_id]

        # Convert coordinates
        lng, lat = convert_coords(x_str, y_str)
        if lng is None or lat is None:
            skipped["no_coords"] += 1
            continue

        # Get GES
        ges_class_letter = ""
        ges_emission = 0
        if dpe_id in ges:
            ges_class_letter, ges_emission = ges[dpe_id]

        ges_code = CLASS_MAP.get(ges_class_letter, 0)

        # Get characteristics
        surface = 0
        year = 0
        type_code = 0
        if dpe_id in carac:
            surface, year, type_enum_id = carac[dpe_id]
            type_str = type_enum.get(type_enum_id, "")
            type_code = TYPE_MAP.get(type_str, 0)

        # Determine department from BAN data or postal code
        if not dept or dept == "\\N":
            if postcode and len(postcode) >= 2:
                # 2A, 2B for Corsica; 97x for DOM
                if postcode.startswith("20"):
                    # Corsica: 20000-20190 = 2A, 20200+ = 2B
                    dept = "2A" if int(postcode[:5]) < 20200 else "2B"
                elif postcode.startswith("97"):
                    dept = postcode[:3]
                else:
                    dept = postcode[:2]
            else:
                continue

        # Clean department code
        dept = dept.strip()
        if not dept:
            continue

        # Date du DPE
        dpe_date = valid_ids[dpe_id]  # YYYYMMDD int

        # Compact row: [dpe_class, ges_class, conso, ges, surface, type, year, postal, lng, lat, date, addr, complement]
        row = [
            CLASS_MAP[dpe_class_letter],
            ges_code,
            round(conso),
            round(ges_emission),
            round(surface),
            type_code,
            year,
            postcode[:5] if postcode else "",
            lng,
            lat,
            dpe_date,
            addr_label,
            addr_complement,
        ]

        if dept not in dept_data:
            dept_data[dept] = []
        dept_data[dept].append(row)

    print(f"Skipped: {skipped}")
    print(f"Departments with data: {len(dept_data)}")
    print()

    # ── Write JSON per department ───────────────────────────────────
    print("Writing JSON files...")

    index = {}
    total_rows = 0
    total_size = 0

    for dept in sorted(dept_data.keys()):
        rows = dept_data[dept]
        count = len(rows)
        total_rows += count

        # Compute bounding box
        min_lng = min(r[8] for r in rows)
        min_lat = min(r[9] for r in rows)
        max_lng = max(r[8] for r in rows)
        max_lat = max(r[9] for r in rows)
        bbox = [round(min_lng, 4), round(min_lat, 4), round(max_lng, 4), round(max_lat, 4)]

        output = {
            "dept": dept,
            "count": count,
            "bbox": bbox,
            "data": rows,
        }

        out_path = os.path.join(OUTPUT_DIR, f"{dept}.json")
        with open(out_path, "w", encoding="utf-8") as f:
            json.dump(output, f, separators=(",", ":"))

        file_size = os.path.getsize(out_path)
        total_size += file_size

        index[dept] = {
            "count": count,
            "bbox": bbox,
            "size": file_size,
        }

        print(f"  {dept:>4s}: {count:>8,} DPE, {file_size/1024/1024:>6.1f} MB")

    # Write index
    index_path = os.path.join(OUTPUT_DIR, "index.json")
    with open(index_path, "w", encoding="utf-8") as f:
        json.dump(index, f, separators=(",", ":"), sort_keys=True)

    total_elapsed = time.time() - start
    print()
    print("=" * 70)
    print(f"Total: {total_rows:,} DPE across {len(dept_data)} departments")
    print(f"Size:  {total_size/1024/1024:.1f} MB ({total_size/1024/1024/1024:.2f} GB)")
    print(f"Index: {os.path.getsize(index_path)/1024:.1f} KB")
    print(f"Time:  {total_elapsed:.0f}s ({total_elapsed/60:.1f} min)")
    print(f"\nNext step: python3 scripts/upload-dpe-storage.py")


if __name__ == "__main__":
    main()
