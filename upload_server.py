#!/usr/bin/env python3
"""Temporary HTTP file upload server for large file transfers."""
import http.server
import socketserver
import os
import sys
import cgi

PORT = 9876
UPLOAD_DIR = '/tmp/companion-upload'

os.makedirs(UPLOAD_DIR, exist_ok=True)

class UploadHandler(http.server.BaseHTTPRequestHandler):
    def do_POST(self):
        content_type = self.headers.get('Content-Type', '')
        if 'multipart/form-data' in content_type:
            form = cgi.FieldStorage(
                fp=self.rfile,
                headers=self.headers,
                environ={'REQUEST_METHOD': 'POST', 'CONTENT_TYPE': content_type}
            )
            for field in form.list:
                if field.filename:
                    filepath = os.path.join(UPLOAD_DIR, field.filename)
                    with open(filepath, 'wb') as f:
                        f.write(field.file.read())
                    size = os.path.getsize(filepath)
                    self.send_response(200)
                    self.send_header('Content-Type', 'text/plain')
                    self.end_headers()
                    self.wfile.write(f'OK: {field.filename} ({size} bytes)\n'.encode())
                    return
        else:
            # Raw body upload
            filename = self.headers.get('X-Filename', 'upload.bin')
            content_length = int(self.headers.get('Content-Length', 0))
            filepath = os.path.join(UPLOAD_DIR, filename)
            with open(filepath, 'wb') as f:
                remaining = content_length
                while remaining > 0:
                    chunk = self.rfile.read(min(8192, remaining))
                    if not chunk:
                        break
                    f.write(chunk)
                    remaining -= len(chunk)
            size = os.path.getsize(filepath)
            self.send_response(200)
            self.send_header('Content-Type', 'text/plain')
            self.end_headers()
            self.wfile.write(f'OK: {filename} ({size} bytes)\n'.encode())

    def do_GET(self):
        self.send_response(200)
        self.send_header('Content-Type', 'text/plain')
        self.end_headers()
        self.wfile.write(b'Upload server ready\n')

    def log_message(self, format, *args):
        sys.stderr.write(f'[upload] {args}\n')

print(f'Upload server on port {PORT}, dir={UPLOAD_DIR}', file=sys.stderr)
with socketserver.TCPServer(('0.0.0.0', PORT), UploadHandler) as httpd:
    httpd.serve_forever()
