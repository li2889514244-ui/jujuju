#!/usr/bin/env python3
"""Upload large files to server via chunked base64 over cloud-exec."""
import base64
import os
import sys
import subprocess
import tempfile

def upload_file(local_path, remote_path, chunk_size=500000):
    """Upload a file by splitting into base64 chunks and sending via cloud-exec."""
    file_size = os.path.getsize(local_path)
    print(f"Uploading {local_path} ({file_size} bytes) to {remote_path}")

    # Clear remote file first
    cmd = f'echo -n "" > {remote_path}'
    subprocess.run(['py', '-3', 'c:\\Users\\EDY\\aliyun-bin\\cloud-exec.py', cmd],
                   capture_output=True, text=True, timeout=30)

    total_uploaded = 0
    chunk_num = 0

    with open(local_path, 'rb') as f:
        while True:
            chunk = f.read(chunk_size)
            if not chunk:
                break

            chunk_num += 1
            b64 = base64.b64encode(chunk).decode()

            # Send chunk via cloud-exec
            cmd = f'echo {b64} | base64 -d >> {remote_path}'
            result = subprocess.run(['py', '-3', 'c:\\Users\\EDY\\aliyun-bin\\cloud-exec.py', cmd],
                                   capture_output=True, text=True, timeout=60)

            if result.returncode != 0:
                print(f"Chunk {chunk_num} failed: {result.stderr}")
                return False

            total_uploaded += len(chunk)
            pct = total_uploaded * 100 / file_size
            print(f"Chunk {chunk_num}: {total_uploaded}/{file_size} ({pct:.1f}%)", flush=True)

    # Verify size
    cmd = f'stat -c %s {remote_path}'
    result = subprocess.run(['py', '-3', 'c:\\Users\\EDY\\aliyun-bin\\cloud-exec.py', cmd],
                           capture_output=True, text=True, timeout=30)
    remote_size = int(result.stdout.strip()) if result.stdout.strip().isdigit() else 0

    if remote_size == file_size:
        print(f"Upload complete! Verified: {remote_size} bytes")
        return True
    else:
        print(f"Size mismatch: local={file_size}, remote={remote_size}")
        return False

if __name__ == '__main__':
    if len(sys.argv) < 3:
        print("Usage: python upload_chunked.py <local_file> <remote_path>")
        sys.exit(1)

    success = upload_file(sys.argv[1], sys.argv[2])
    sys.exit(0 if success else 1)
