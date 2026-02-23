#!/usr/bin/env python3
"""
Pre-process DVF+ CSV files into compact JSON per department.
Converts Lambert 93 / UTM coordinates to WGS84 (lat/lng).
Reads from ~/Downloads/DVF/dvfplus/{dept}.csv
Outputs to ~/Downloads/DVF/dvf-data/{dept}.json + index.json
"""

import csv
import json
import os
import sys
import glob
import time
from pyproj import Transformer

csv.field_size_limit(sys.maxsize)

INPUT_DIR = os.path.expanduser("~/Downloads/DVF/dvfplus")
OUTPUT_DIR = os.path.expanduser("~/Downloads/DVF/dvf-data")

# Mutations to keep
VALID_MUTATIONS = {
    "Vente",
    "Vente en l'état futur d'achèvement",
    "Vente terrain à bâtir",
}

# CRS per department (source → WGS84)
CRS_MAP = {
    "971": "EPSG:32620",  # Guadeloupe — UTM 20N
    "972": "EPSG:32620",  # Martinique — UTM 20N
    "973": "EPSG:2972",   # Guyane — RGFG95 UTM 22N
    "974": "EPSG:2975",   # Réunion — RGR92 UTM 40S
}
DEFAULT_CRS = "EPSG:2154"  # Lambert 93 (métropole)

# Pre-build transformers
_transformers = {}

def get_transformer(dept):
    """Get or create a pyproj Transformer for the given department."""
    crs = CRS_MAP.get(dept, DEFAULT_CRS)
    if crs not in _transformers:
        _transformers[crs] = Transformer.from_crs(crs, "EPSG:4326", always_xy=True)
    return _transformers[crs]

def get_type_code(libtypbien, nblocapt, nblocmai):
    """Map property type to compact code."""
    tb = libtypbien.upper()
    if "APPARTEMENT" in tb or nblocapt > 0:
        return 1  # Appartement
    if "MAISON" in tb or nblocmai > 0:
        return 2  # Maison
    if "TERRAIN" in tb or "DEPENDANCE" in tb or "DÉPENDANCE" in tb:
        return 3  # Terrain
    if "ACTIVITE" in tb or "ACTIVITÉ" in tb or "MIXTE" in tb:
        return 4  # Local pro
    return 5  # Autre

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

def process_department(csv_path):
    """Process a single department CSV into compact data with WGS84 coords."""
    dept = os.path.basename(csv_path).replace(".csv", "")
    transformer = get_transformer(dept)
    rows = []
    min_lng, min_lat, max_lng, max_lat = 180, 90, -180, -90
    skipped = {"no_mutation": 0, "no_price": 0, "no_coords": 0, "bad_coords": 0}

    with open(csv_path, "r", encoding="utf-8") as f:
        reader = csv.DictReader(f, delimiter="|")
        for row in reader:
            if row.get("libnatmut", "") not in VALID_MUTATIONS:
                skipped["no_mutation"] += 1
                continue

            price = parse_float(row.get("valeurfonc", ""))
            if price <= 0:
                skipped["no_price"] += 1
                continue

            # Source coordinates (projected)
            x = parse_float(row.get("geompar_x", ""))
            y = parse_float(row.get("geompar_y", ""))
            if x == 0 or y == 0:
                skipped["no_coords"] += 1
                continue

            # Convert to WGS84
            try:
                lng, lat = transformer.transform(x, y)
            except Exception:
                skipped["bad_coords"] += 1
                continue

            if not (-90 <= lat <= 90 and -180 <= lng <= 180):
                skipped["bad_coords"] += 1
                continue

            # Date as YYYYMMDD integer
            date_str = row.get("datemut", "")
            try:
                date_int = int(date_str.replace("-", ""))
            except (ValueError, AttributeError):
                continue

            nblocapt = parse_int(row.get("nblocapt", "0"))
            nblocmai = parse_int(row.get("nblocmai", "0"))
            type_code = get_type_code(row.get("libtypbien", ""), nblocapt, nblocmai)

            surf_bati = round(parse_float(row.get("sbati", "0")))
            surf_terrain = round(parse_float(row.get("sterr", "0")))

            # Round to 4 decimals (~11m precision)
            lng_r = round(lng, 4)
            lat_r = round(lat, 4)

            min_lng = min(min_lng, lng_r)
            min_lat = min(min_lat, lat_r)
            max_lng = max(max_lng, lng_r)
            max_lat = max(max_lat, lat_r)

            # [date, price, type, surf_bati, surf_terrain, lng, lat]
            rows.append([
                date_int,
                round(price),
                type_code,
                surf_bati,
                surf_terrain,
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

        skip_info = f"skip: mut={skipped['no_mutation']}, prix={skipped['no_price']}, coords={skipped['no_coords']}, bad={skipped['bad_coords']}"
        print(f"  [{i+1:2d}/{len(csv_files)}] {dept:>4s}: {count:>8,} rows, {file_size/1024/1024:>6.1f} MB  ({skip_info})")

    # Write index
    index_path = os.path.join(OUTPUT_DIR, "index.json")
    with open(index_path, "w", encoding="utf-8") as f:
        json.dump(index, f, separators=(",", ":"), sort_keys=True)

    elapsed = time.time() - start
    print("=" * 60)
    print(f"Total: {total_rows:,} rows, {total_size/1024/1024:.1f} MB")
    print(f"Index: {os.path.getsize(index_path)/1024:.1f} KB")
    print(f"Time: {elapsed:.1f}s")

if __name__ == "__main__":
    main()
