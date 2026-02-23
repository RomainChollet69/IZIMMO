#!/usr/bin/env python3
"""
Upload DPE JSON files to Supabase Storage.
Requires SUPABASE_SERVICE_ROLE_KEY environment variable.

Usage:
    export SUPABASE_SERVICE_ROLE_KEY="your-service-role-key"
    python3 scripts/upload-dpe-storage.py
"""

import os
import sys
import glob
import time
import requests

SUPABASE_URL = "https://aofrngjcfemiptljtyif.supabase.co"
BUCKET = "dpe-data"
INPUT_DIR = os.path.expanduser("~/Downloads/DPE/dpe-data")


def get_service_key():
    key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "")
    if not key:
        print("ERROR: Set SUPABASE_SERVICE_ROLE_KEY environment variable.")
        print("Find it at: Supabase Dashboard > Settings > API > service_role key")
        sys.exit(1)
    return key


def create_bucket(key):
    """Create public bucket if it doesn't exist."""
    url = f"{SUPABASE_URL}/storage/v1/bucket"
    headers = {
        "Authorization": f"Bearer {key}",
        "apikey": key,
        "Content-Type": "application/json",
    }
    payload = {
        "id": BUCKET,
        "name": BUCKET,
        "public": True,
        "allowed_mime_types": ["application/json"],
        "file_size_limit": 50 * 1024 * 1024,  # 50 MB max per file
    }

    resp = requests.post(url, json=payload, headers=headers)
    if resp.status_code == 200:
        print(f"Bucket '{BUCKET}' created (public)")
    elif resp.status_code == 409 or "already exists" in resp.text or "Duplicate" in resp.text:
        print(f"Bucket '{BUCKET}' already exists")
    else:
        print(f"Bucket creation failed: {resp.status_code} {resp.text}")
        sys.exit(1)


def upload_file(key, file_path, object_name):
    """Upload a single file to the bucket."""
    url = f"{SUPABASE_URL}/storage/v1/object/{BUCKET}/{object_name}"
    headers = {
        "Authorization": f"Bearer {key}",
        "apikey": key,
        "Content-Type": "application/json",
        "x-upsert": "true",
    }

    with open(file_path, "rb") as f:
        resp = requests.post(url, data=f, headers=headers)

    return resp.status_code in (200, 201)


def main():
    key = get_service_key()

    # Check input directory
    json_files = sorted(glob.glob(os.path.join(INPUT_DIR, "*.json")))
    if not json_files:
        print(f"No JSON files in {INPUT_DIR}")
        print("Run generate-dpe-json.py first.")
        sys.exit(1)

    print(f"Found {len(json_files)} files to upload")
    print(f"Target: {SUPABASE_URL}/storage/v1/object/public/{BUCKET}/")
    print("=" * 60)

    # Create bucket
    create_bucket(key)

    # Upload all files
    success = 0
    failed = 0
    total_size = 0
    start = time.time()

    for i, path in enumerate(json_files):
        name = os.path.basename(path)
        size = os.path.getsize(path)
        total_size += size

        ok = upload_file(key, path, name)
        status = "OK" if ok else "FAIL"
        if ok:
            success += 1
        else:
            failed += 1

        print(f"  [{i+1:2d}/{len(json_files)}] {name:>12s}  {size/1024/1024:>6.1f} MB  {status}")

    elapsed = time.time() - start
    print("=" * 60)
    print(f"Done: {success} uploaded, {failed} failed, {total_size/1024/1024:.1f} MB total")
    print(f"Time: {elapsed:.1f}s")
    print(f"\nPublic URL: {SUPABASE_URL}/storage/v1/object/public/{BUCKET}/index.json")


if __name__ == "__main__":
    main()
