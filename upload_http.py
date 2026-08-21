#!/usr/bin/env python3
"""Upload large files to server via direct HTTP POST."""
import http.client
import os
import sys
import socket

def upload_file(local_path, remote_filename, host='8.134.218.39', port=9876):
    file_size = os.path.getsize(local_path)
    print(f"Uploading {local_path} ({file_size:,} bytes) as {remote_filename} to {host}:{port}")

    # Disable proxy
    import urllib.request
    proxy_handler = urllib.request.ProxyHandler({})
    opener = urllib.request.build_opener(proxy_handler)
    urllib.request.install_opener(opener)

    # Use raw socket for upload
    conn = http.client.HTTPConnection(host, port, timeout=600)

    headers = {
        'X-Filename': remote_filename,
        'Content-Type': 'application/octet-stream',
        'Content-Length': str(file_size),
    }

    conn.request('POST', '/', body=open(local_path, 'rb'), headers=headers)
    response = conn.getresponse()
    data = response.read().decode()
    print(f"Response: {response.status} {data}")
    conn.close()
    return response.status == 200

if __name__ == '__main__':
    if len(sys.argv) < 3:
        print("Usage: python upload_http.py <local_file> <remote_filename>")
        sys.exit(1)
    success = upload_file(sys.argv[1], sys.argv[2])
    sys.exit(0 if success else 1)
