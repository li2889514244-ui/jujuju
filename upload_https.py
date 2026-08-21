#!/usr/bin/env python3
"""Upload large files via HTTPS through dl.ddddkiii.com (direct, no Cloudflare)."""
import http.client
import os
import ssl
import sys

def upload_file(local_path, remote_filename, host='dl.ddddkiii.com', port=443):
    file_size = os.path.getsize(local_path)
    print(f"Uploading {local_path} ({file_size:,} bytes) as {remote_filename} to {host}:{port}")

    ctx = ssl.create_default_context()
    ctx.check_hostname = False
    ctx.verify_mode = ssl.CERT_NONE

    conn = http.client.HTTPSConnection(host, port, timeout=600, context=ctx)

    headers = {
        'X-Filename': remote_filename,
        'Content-Type': 'application/octet-stream',
        'Content-Length': str(file_size),
    }

    with open(local_path, 'rb') as f:
        conn.request('POST', '/upload', body=f, headers=headers)

    response = conn.getresponse()
    data = response.read().decode()
    print(f"  Response: {response.status} {data}")
    conn.close()
    return response.status == 200

if __name__ == '__main__':
    zip_path = r"c:\Users\EDY\jujuju\desktop-companion\update-release\pixingyun-mate-portable-3.2.42.zip"
    exe_path = r"c:\Users\EDY\jujuju\desktop-companion\update-release\pixingyun-mate-setup-3.2.42.exe"

    print("Step 1: Upload ZIP")
    ok1 = upload_file(zip_path, "pixingyun-mate-portable-3.2.42.zip")
    if not ok1:
        print("ZIP upload failed!")
        sys.exit(1)

    print("\nStep 2: Upload EXE")
    ok2 = upload_file(exe_path, "pixingyun-mate-setup-3.2.42.exe")
    if not ok2:
        print("EXE upload failed!")
        sys.exit(1)

    print("\nAll uploads complete!")
