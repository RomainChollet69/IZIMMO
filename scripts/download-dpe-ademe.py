#!/usr/bin/env python3
"""
Download DPE data from ADEME open data API, by department.
Saves raw CSV files to ~/Downloads/DPE/raw/{dept}.csv

API: https://data.ademe.fr/data-fair/api/v1/datasets/dpe03existant/lines
Rate limit: 600 req / 60s (anonymous)

Usage:
    python3 scripts/download-dpe-ademe.py                 # All departments
    python3 scripts/download-dpe-ademe.py 69              # Single dept
    python3 scripts/download-dpe-ademe.py 69 01 38 42     # Multiple depts
"""

import csv
import os
import sys
import time
import requests

OUTPUT_DIR = os.path.expanduser("~/Downloads/DPE/raw")

API_BASE = "https://data.ademe.fr/data-fair/api/v1/datasets/dpe03existant/lines"

FIELDS = [
    "numero_dpe",
    "date_etablissement_dpe",
    "etiquette_dpe",
    "etiquette_ges",
    "conso_5_usages_par_m2_ep",
    "emission_ges_5_usages_par_m2",
    "surface_habitable_logement",
    "type_batiment",
    "annee_construction",
    "code_postal_ban",
    "code_insee_ban",
    "_geopoint",
]

# All French departments (metro + DOM)
ALL_DEPTS = [
    "01", "02", "03", "04", "05", "06", "07", "08", "09", "10",
    "11", "12", "13", "14", "15", "16", "17", "18", "19", "21",
    "22", "23", "24", "25", "26", "27", "28", "29", "2A", "2B",
    "30", "31", "32", "33", "34", "35", "36", "37", "38", "39",
    "40", "41", "42", "43", "44", "45", "46", "47", "48", "49",
    "50", "51", "52", "53", "54", "55", "56", "57", "58", "59",
    "60", "61", "62", "63", "64", "65", "66", "67", "68", "69",
    "70", "71", "72", "73", "74", "75", "76", "77", "78", "79",
    "80", "81", "82", "83", "84", "85", "86", "87", "88", "89",
    "90", "91", "92", "93", "94", "95",
    "971", "972", "973", "974", "976",
]

PAGE_SIZE = 10000
RETRY_WAIT = 5
MAX_RETRIES = 5


def download_department(dept, session):
    """Download all DPE records for a department via paginated API calls."""
    params = {
        "q_fields": "code_departement_ban",
        "q": dept,
        "select": ",".join(FIELDS),
        "size": PAGE_SIZE,
    }

    all_rows = []
    page = 0
    after = None

    while True:
        p = dict(params)
        if after:
            p["after"] = after

        # Retry loop
        for attempt in range(MAX_RETRIES):
            try:
                resp = session.get(API_BASE, params=p, timeout=60)
                if resp.status_code == 429:
                    wait = RETRY_WAIT * (attempt + 1)
                    print(f"    Rate limited, waiting {wait}s...")
                    time.sleep(wait)
                    continue
                resp.raise_for_status()
                break
            except requests.exceptions.RequestException as e:
                if attempt < MAX_RETRIES - 1:
                    wait = RETRY_WAIT * (attempt + 1)
                    print(f"    Error: {e}, retrying in {wait}s...")
                    time.sleep(wait)
                else:
                    raise

        data = resp.json()
        results = data.get("results", [])
        if not results:
            break

        all_rows.extend(results)
        page += 1

        # Get next page token
        after = data.get("next")
        if not after:
            break

        # Progress
        total = data.get("total", "?")
        print(f"    Page {page}: {len(all_rows)}/{total} rows fetched...")

        # Small delay to respect rate limits
        time.sleep(0.15)

    return all_rows


def save_csv(dept, rows):
    """Save rows as CSV file."""
    if not rows:
        return 0

    out_path = os.path.join(OUTPUT_DIR, f"{dept}.csv")
    with open(out_path, "w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=FIELDS)
        writer.writeheader()
        for row in rows:
            writer.writerow({k: row.get(k, "") for k in FIELDS})

    return os.path.getsize(out_path)


def main():
    os.makedirs(OUTPUT_DIR, exist_ok=True)

    # Determine which departments to download
    if len(sys.argv) > 1:
        depts = sys.argv[1:]
    else:
        depts = ALL_DEPTS

    print(f"Downloading DPE data for {len(depts)} department(s)")
    print(f"Output: {OUTPUT_DIR}")
    print("=" * 60)

    session = requests.Session()
    session.headers["User-Agent"] = "IZIMMO-DPE-Downloader/1.0"

    total_rows = 0
    total_size = 0
    start = time.time()

    for i, dept in enumerate(depts):
        dept_start = time.time()
        print(f"  [{i+1:3d}/{len(depts)}] Dept {dept}...", end="", flush=True)

        try:
            rows = download_department(dept, session)
            size = save_csv(dept, rows)
            total_rows += len(rows)
            total_size += size
            elapsed = time.time() - dept_start
            print(f" {len(rows):>8,} DPE, {size/1024/1024:>5.1f} MB ({elapsed:.0f}s)")
        except Exception as e:
            print(f" ERROR: {e}")

    elapsed = time.time() - start
    print("=" * 60)
    print(f"Total: {total_rows:,} DPE, {total_size/1024/1024:.1f} MB")
    print(f"Time: {elapsed:.0f}s ({elapsed/60:.1f} min)")


if __name__ == "__main__":
    main()
