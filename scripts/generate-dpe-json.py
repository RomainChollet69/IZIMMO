#!/usr/bin/env python3
"""
Pre-process DPE CSV files (downloaded from ADEME) into compact JSON per department.
Reads from ~/Downloads/DPE/raw/{dept}.csv
Outputs to ~/Downloads/DPE/dpe-data/{dept}.json + index.json

Format per row (compact array):
  [dpe_class, ges_class, conso, ges, surface, type, year, postal, lng, lat]
"""

import csv
import json
import os
import sys
import glob
import time

csv.field_size_limit(sys.maxsize)

INPUT_DIR = os.path.expanduser("~/Downloads/DPE/raw")
OUTPUT_DIR = os.path.expanduser("~/Downloads/DPE/dpe-data")

# DPE class mapping: letter → compact code
CLASS_MAP = {"A": 1, "B": 2, "C": 3, "D": 4, "E": 5, "F": 6, "G": 7}

# Building type mapping
TYPE_MAP = {"appartement": 1, "maison": 2, "immeuble": 3}


def parse_float(val):
    try:
        return float(val)
    except (ValueError, TypeError):
        return 0.0


def parse_int(val):
    try:
        return int(float(val))
    except (ValueError, TypeError):
        return 0


def parse_geopoint(val):
    """Parse _geopoint field: 'lat,lng' → (lat, lng) floats."""
    if not val or "," not in val:
        return None, None
    try:
        parts = val.split(",")
        lat = float(parts[0].strip())
        lng = float(parts[1].strip())
        if -90 <= lat <= 90 and -180 <= lng <= 180:
            return lat, lng
    except (ValueError, IndexError):
        pass
    return None, None


def process_department(csv_path):
    """Process a single department CSV into compact data."""
    dept = os.path.basename(csv_path).replace(".csv", "")
    rows = []
    min_lng, min_lat, max_lng, max_lat = 180, 90, -180, -90
    skipped = {"no_class": 0, "no_coords": 0, "bad_coords": 0}

    with open(csv_path, "r", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        for row in reader:
            # Must have DPE class
            dpe_letter = (row.get("etiquette_dpe") or "").strip().upper()
            if dpe_letter not in CLASS_MAP:
                skipped["no_class"] += 1
                continue

            # Must have coordinates
            lat, lng = parse_geopoint(row.get("_geopoint", ""))
            if lat is None or lng is None:
                skipped["no_coords"] += 1
                continue

            ges_letter = (row.get("etiquette_ges") or "").strip().upper()
            ges_code = CLASS_MAP.get(ges_letter, 0)

            conso = round(parse_float(row.get("conso_5_usages_par_m2_ep", "")))
            ges = round(parse_float(row.get("emission_ges_5_usages_par_m2", "")))
            surface = round(parse_float(row.get("surface_habitable_logement", "")))

            type_str = (row.get("type_batiment") or "").strip().lower()
            type_code = TYPE_MAP.get(type_str, 0)

            year = parse_int(row.get("annee_construction", ""))
            postal = (row.get("code_postal_ban") or "").strip()[:5]

            # Round coords to 4 decimals (~11m precision)
            lng_r = round(lng, 4)
            lat_r = round(lat, 4)

            min_lng = min(min_lng, lng_r)
            min_lat = min(min_lat, lat_r)
            max_lng = max(max_lng, lng_r)
            max_lat = max(max_lat, lat_r)

            # [dpe_class, ges_class, conso, ges, surface, type, year, postal, lng, lat]
            rows.append([
                CLASS_MAP[dpe_letter],
                ges_code,
                conso,
                ges,
                surface,
                type_code,
                year,
                postal,
                lng_r,
                lat_r,
            ])

    bbox = [round(min_lng, 4), round(min_lat, 4), round(max_lng, 4), round(max_lat, 4)]
    return dept, rows, bbox, skipped


def main():
    os.makedirs(OUTPUT_DIR, exist_ok=True)

    csv_files = sorted(glob.glob(os.path.join(INPUT_DIR, "*.csv")))
    if not csv_files:
        print(f"No CSV files found in {INPUT_DIR}")
        print("Run download-dpe-ademe.py first.")
        sys.exit(1)

    print(f"Found {len(csv_files)} department CSV files")
    print(f"Output: {OUTPUT_DIR}")
    print("=" * 60)

    index = {}
    total_rows = 0
    total_size = 0
    start = time.time()

    for i, csv_path in enumerate(csv_files):
        dept, rows, bbox, skipped = process_department(csv_path)
        count = len(rows)
        total_rows += count

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

        skip_info = f"skip: class={skipped['no_class']}, coords={skipped['no_coords']}, bad={skipped['bad_coords']}"
        print(f"  [{i+1:2d}/{len(csv_files)}] {dept:>4s}: {count:>8,} DPE, {file_size/1024/1024:>6.1f} MB  ({skip_info})")

    # Write index
    index_path = os.path.join(OUTPUT_DIR, "index.json")
    with open(index_path, "w", encoding="utf-8") as f:
        json.dump(index, f, separators=(",", ":"), sort_keys=True)

    elapsed = time.time() - start
    print("=" * 60)
    print(f"Total: {total_rows:,} DPE, {total_size/1024/1024:.1f} MB")
    print(f"Index: {os.path.getsize(index_path)/1024:.1f} KB")
    print(f"Time: {elapsed:.1f}s")


if __name__ == "__main__":
    main()
