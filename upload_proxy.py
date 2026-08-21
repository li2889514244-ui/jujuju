#!/usr/bin/env python3
"""Upload files via local proxy directly to server IP (bypass Cloudflare)."""
import http.client
import os
import ssl
import sys
import json
import socket

PROXY_HOST = '127.0.0.1'
PROXY_PORT = 7897
SERVER_IP = '8.134.218.39'
SERVER_HOST = 'dl.ddddkiii.com'
CHUNK_SIZE = 45 * 1024 * 1024

def upload_via_proxy_direct(data_bytes, remote_filename, content_type='application/octet-stream'):
    """Upload bytes through local proxy directly to server IP."""
    size = len(data_bytes)
    print(f"  Uploading {size:,} bytes as {remote_filename}...", flush=True)

    # Connect through proxy to server IP directly
    conn = http.client.HTTPSConnection(PROXY_HOST, PROXY_PORT, timeout=600)

    # Use CONNECT tunnel to server IP:443
    conn.set_tunnel(SERVER_IP, 443)

    # SSL context that doesn't verify (self-signed or mismatched cert)
    ctx = ssl.create_default_context()
    ctx.check_hostname = False
    ctx.verify_mode = ssl.CERT_NONE

    headers = {
        'X-Filename': remote_filename,
        'Content-Type': content_type,
        'Content-Length': str(size),
        'Host': SERVER_HOST,
    }

    conn.request('POST', '/upload', body=data_bytes, headers=headers)
    response = conn.getresponse()
    data = response.read().decode()
    print(f"  Response: {response.status} {data.strip()}", flush=True)
    conn.close()
    return response.status == 200

def upload_file_split(local_path, remote_filename):
    file_size = os.path.getsize(local_path)
    print(f"\nUploading {local_path} ({file_size:,} bytes) as {remote_filename}", flush=True)

    if file_size <= CHUNK_SIZE:
        with open(local_path, 'rb') as f:
            data = f.read()
        return upload_via_proxy_direct(data, remote_filename)

    parts = []
    part_num = 0
    with open(local_path, 'rb') as f:
        while True:
            chunk = f.read(CHUNK_SIZE)
            if not chunk:
                break
            part_num += 1
            part_name = f"{remote_filename}.part{part_num}"
            print(f"\n  Part {part_num}/{(file_size + CHUNK_SIZE - 1) // CHUNK_SIZE} ({len(chunk):,} bytes)...", flush=True)
            ok = upload_via_proxy_direct(chunk, part_name)
            if not ok:
                print(f"  Part {part_num} failed!", flush=True)
                return False
            parts.append(part_name)

    print(f"\n  Reassembling {len(parts)} parts on server...", flush=True)
    parts_json = json.dumps({'parts': parts, 'output': remote_filename})
    ok = upload_via_proxy_direct(parts_json.encode(), f"_reassemble_{remote_filename}", 'application/json')
    return ok

if __name__ == '__main__':
    zip_path = r"c:\Users\EDY\jujuju\desktop-companion\update-release\pixingyun-mate-portable-3.2.42.zip"
    exe_path = r"c:\Users\EDY\jujuju\desktop-companion\update-release\pixingyun-mate-setup-3.2.42.exe"

    print("=" * 60)
    print("Step 1: Upload ZIP")
    print("=" * 60)
    ok1 = upload_file_split(zip_path, "pixingyun-mate-portable-3.2.42.zip")
    if not ok1:
        print("ZIP upload failed!")
        sys.exit(1)

    print("\n" + "=" * 60)
    print("Step 2: Upload EXE")
    print("=" * 60)
    ok2 = upload_file_split(exe_path, "pixingyun-mate-setup-3.2.42.exe")
    if not ok2:
        print("EXE upload failed!")
        sys.exit(1)

    print("\nAll uploads complete!")
