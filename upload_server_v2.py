#!/usr/bin/env python3
"""Enhanced HTTP file upload server with split-file reassembly."""
import http.server
import socketserver
import os
import sys
import json

PORT = 9876
UPLOAD_DIR = '/tmp/companion-upload'

os.makedirs(UPLOAD_DIR, exist_ok=True)

class UploadHandler(http.server.BaseHTTPRequestHandler):
    def do_POST(self):
        content_type = self.headers.get('Content-Type', '')
        filename = self.headers.get('X-Filename', 'upload.bin')
        content_length = int(self.headers.get('Content-Length', 0))
        filepath = os.path.join(UPLOAD_DIR, filename)

        # Check for reassembly request
        if filename.startswith('_reassemble_'):
            body = self.rfile.read(content_length)
            try:
                req = json.loads(body)
                output_name = req['output']
                parts = req['parts']
                output_path = os.path.join(UPLOAD_DIR, output_name)
                with open(output_path, 'wb') as out:
                    for part in parts:
                        part_path = os.path.join(UPLOAD_DIR, part)
                        if not os.path.exists(part_path):
                            self.send_error(400, f'Missing part: {part}')
                            return
                        with open(part_path, 'rb') as pf:
                            out.write(pf.read())
                        os.remove(part_path)  # Clean up part
                size = os.path.getsize(output_path)
                self.send_response(200)
                self.send_header('Content-Type', 'text/plain')
                self.end_headers()
                self.wfile.write(f'Reassembled: {output_name} ({size} bytes)\n'.encode())
                print(f'[reassemble] {output_name} = {size} bytes from {len(parts)} parts', file=sys.stderr)
            except Exception as e:
                self.send_error(500, f'Reassembly error: {e}')
            return

        # Regular file upload (raw body)
        with open(filepath, 'wb') as f:
            remaining = content_length
            while remaining > 0:
                chunk = self.rfile.read(min(65536, remaining))
                if not chunk:
                    break
                f.write(chunk)
                remaining -= len(chunk)
        size = os.path.getsize(filepath)
        self.send_response(200)
        self.send_header('Content-Type', 'text/plain')
        self.end_headers()
        self.wfile.write(f'OK: {filename} ({size} bytes)\n'.encode())
        print(f'[upload] {filename} = {size} bytes', file=sys.stderr)

    def do_GET(self):
        self.send_response(200)
        self.send_header('Content-Type', 'text/plain')
        self.end_headers()
        self.wfile.write(b'Upload server ready\n')

    def log_message(self, format, *args):
        pass  # Suppress default logging

print(f'Upload server on port {PORT}, dir={UPLOAD_DIR}', file=sys.stderr)
with socketserver.TCPServer(('0.0.0.0', PORT), UploadHandler) as httpd:
    httpd.serve_forever()
