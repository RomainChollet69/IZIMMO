#!/usr/bin/env python3
"""
Génère les JSON DVF compacts de Léon à partir des DVF GÉOLOCALISÉES d'Etalab
(geo-dvf, files.data.gouv.fr) — qui contiennent déjà lat/lon (pas de pyproj).

Entrée  : ~/Downloads/DVF/geodvf/{dept}_{year}.csv.gz  (un par dept/année, 2021→2025)
Sortie  : ~/Downloads/DVF/dvf-data/{dept}.json + index.json  (format lu par dvf.html)

geo-dvf = 1 ligne par LOCAL → on AGRÈGE par mutation (id_mutation) pour avoir
1 vente = 1 entrée (sinon prix/m² faussé). Format de sortie identique à
generate-dvf-json.py : data = [[date_int, prix, type_code, sbati, sterr, lng, lat], ...]
"""
import csv, gzip, json, os, sys, glob, time

csv.field_size_limit(sys.maxsize)

INPUT_DIR = os.path.expanduser("~/Downloads/DVF/geodvf")
OUTPUT_DIR = os.path.expanduser("~/Downloads/DVF/dvf-data")
YEARS = [2021, 2022, 2023, 2024, 2025]
VALID_MUTATIONS = {"Vente", "Vente en l'état futur d'achèvement", "Vente terrain à bâtir"}


def fnum(v):
    try:
        return float(v)
    except (ValueError, TypeError):
        return 0.0


def type_code(types, sum_bati, sum_terr):
    """Type dominant de la mutation → code compact (même sémantique que l'ancien script)."""
    t = " ".join(types).upper()
    if "APPARTEMENT" in t:
        return 1
    if "MAISON" in t:
        return 2
    if "LOCAL" in t or "INDUSTRIEL" in t or "COMMERCIAL" in t or "ACTIVIT" in t:
        return 4
    if "DEPENDANCE" in t or "DÉPENDANCE" in t or "TERRAIN" in t or (sum_bati == 0 and sum_terr > 0):
        return 3
    return 5


def process_department(dept):
    """Lit les fichiers {dept}_{year}.csv.gz, agrège par mutation, renvoie les lignes compactes."""
    muts = {}  # id_mutation -> accumulateur
    for year in YEARS:
        path = os.path.join(INPUT_DIR, f"{dept}_{year}.csv.gz")
        if not os.path.exists(path):
            continue
        with gzip.open(path, "rt", encoding="utf-8", newline="") as f:
            reader = csv.DictReader(f)
            for r in reader:
                if r.get("nature_mutation", "") not in VALID_MUTATIONS:
                    continue
                mid = r.get("id_mutation", "")
                if not mid:
                    continue
                m = muts.get(mid)
                if m is None:
                    m = {"price": 0.0, "date": 0, "types": [], "bati": 0.0,
                         "terr": 0.0, "lat": None, "lng": None, "parcels": set()}
                    muts[mid] = m
                price = fnum(r.get("valeur_fonciere"))
                if price > m["price"]:
                    m["price"] = price  # identique sur toutes les lignes d'une mutation
                if not m["date"]:
                    d = (r.get("date_mutation", "") or "").replace("-", "")
                    if d.isdigit():
                        m["date"] = int(d)
                tl = r.get("type_local", "")
                if tl:
                    m["types"].append(tl)
                m["bati"] += fnum(r.get("surface_reelle_bati"))
                pid = r.get("id_parcelle", "")
                st = fnum(r.get("surface_terrain"))
                if st and pid not in m["parcels"]:
                    m["terr"] += st
                    m["parcels"].add(pid)
                if m["lat"] is None:
                    lat = fnum(r.get("latitude"))
                    lng = fnum(r.get("longitude"))
                    if lat and lng:
                        m["lat"] = round(lat, 4)
                        m["lng"] = round(lng, 4)

    rows = []
    for m in muts.values():
        if m["price"] <= 0 or m["lat"] is None or not m["date"]:
            continue
        rows.append([
            m["date"],
            round(m["price"]),
            type_code(m["types"], m["bati"], m["terr"]),
            round(m["bati"]),
            round(m["terr"]),
            m["lng"],
            m["lat"],
        ])
    return rows


def main():
    os.makedirs(OUTPUT_DIR, exist_ok=True)
    # Liste des départements présents (déduite des fichiers téléchargés)
    depts = sorted({os.path.basename(p).split("_")[0]
                    for p in glob.glob(os.path.join(INPUT_DIR, "*_*.csv.gz"))})
    if not depts:
        print(f"Aucun fichier dans {INPUT_DIR}")
        sys.exit(1)

    print(f"{len(depts)} départements à traiter → {OUTPUT_DIR}")
    print("=" * 60)
    index = {}
    total = 0
    start = time.time()
    for i, dept in enumerate(depts):
        rows = process_department(dept)
        if not rows:
            print(f"  [{i+1:2d}/{len(depts)}] {dept:>4s}: 0 (ignoré)")
            continue
        lngs = [r[5] for r in rows]
        lats = [r[6] for r in rows]
        bbox = [round(min(lngs), 4), round(min(lats), 4), round(max(lngs), 4), round(max(lats), 4)]
        out = {"dept": dept, "count": len(rows), "bbox": bbox, "data": rows}
        p = os.path.join(OUTPUT_DIR, f"{dept}.json")
        with open(p, "w", encoding="utf-8") as f:
            json.dump(out, f, separators=(",", ":"))
        size = os.path.getsize(p)
        index[dept] = {"count": len(rows), "bbox": bbox, "size": size}
        total += len(rows)
        print(f"  [{i+1:2d}/{len(depts)}] {dept:>4s}: {len(rows):>8,} ventes, {size/1024/1024:>5.1f} Mo")

    with open(os.path.join(OUTPUT_DIR, "index.json"), "w", encoding="utf-8") as f:
        json.dump(index, f, separators=(",", ":"), sort_keys=True)
    print("=" * 60)
    print(f"Total : {total:,} ventes, {len(index)} départements, {time.time()-start:.0f}s")


if __name__ == "__main__":
    main()
