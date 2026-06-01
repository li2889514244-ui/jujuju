"""Deploy backend dist to ECS via SSH and restart PM2."""
import paramiko
import os
import sys

HOST = "8.134.218.39"
USER = "root"
PASSWORD = "^GLH,Hue6#38mXd"
REMOTE_PATH = "/opt/matrixflow/backend/dist"
LOCAL_TAR = "C:/Users/EDY/AppData/Local/Temp/mf-backend-dist.tar.gz"

client = paramiko.SSHClient()
client.set_missing_host_key_policy(paramiko.AutoAddPolicy())

try:
    client.connect(HOST, username=USER, password=PASSWORD, timeout=30)
    print("[1/4] Connected to ECS")

    # Upload tar
    sftp = client.open_sftp()
    sftp.put(LOCAL_TAR, "/tmp/mf-backend-dist.tar.gz")
    sftp.close()
    print("[2/4] Uploaded dist.tar.gz")

    # Extract and restart
    commands = [
        "cd /opt/matrixflow/backend",
        "rm -rf dist/",
        "tar -xzf /tmp/mf-backend-dist.tar.gz",
        "ls dist/main.js && echo 'OK: dist extracted'",
        "pm2 restart matrixflow-backend 2>/dev/null || pm2 start dist/main.js --name matrixflow-backend",
        "sleep 3 && pm2 status | grep matrixflow",
    ]
    cmd = " && ".join(commands)
    stdin, stdout, stderr = client.exec_command(cmd)
    output = stdout.read().decode()
    err = stderr.read().decode()
    print(f"[3/4] Deploy & restart:\n{output}")
    if err:
        print(f"stderr: {err}")

    # Verify
    stdin2, stdout2, stderr2 = client.exec_command(
        "curl -s -o /dev/null -w '%{http_code}' http://localhost:3001/api/v1/health 2>/dev/null || echo 'no_health'"
    )
    health = stdout2.read().decode().strip()
    print(f"[4/4] Health check: {health}")

    client.close()
    print("DONE")

except Exception as e:
    print(f"ERROR: {e}")
    sys.exit(1)
