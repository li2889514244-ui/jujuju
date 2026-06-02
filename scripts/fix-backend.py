"""Fix backend node_modules + restart all services."""
import hashlib, hmac, base64, json, os, time, urllib.parse, uuid, http.client, ssl

home = os.path.expanduser("~")
with open(os.path.join(home, ".aliyun", "config.json")) as f:
    cfg = json.load(f)
p = next(x for x in cfg["profiles"] if x["name"] == cfg["current"])
AK_ID = p["access_key_id"]
AK_SECRET = p["access_key_secret"]
REGION = "cn-guangzhou"
INSTANCE = "i-7xvb9wno2duq8msd35l1"

def call(action, extra=None):
    params = {
        "Action": action, "Format": "JSON", "Version": "2014-05-26",
        "AccessKeyId": AK_ID, "SignatureMethod": "HMAC-SHA1",
        "Timestamp": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "SignatureVersion": "1.0", "SignatureNonce": str(uuid.uuid4()),
        "RegionId": REGION,
    }
    if extra: params.update(extra)
    sorted_keys = sorted(params.keys())
    qs = "&".join(f"{urllib.parse.quote(k, safe='')}={urllib.parse.quote(str(params[k]), safe='')}" for k in sorted_keys)
    sts = f"POST&{urllib.parse.quote('/', safe='')}&{urllib.parse.quote(qs, safe='')}"
    sig = base64.b64encode(hmac.new(f"{AK_SECRET}&".encode(), sts.encode(), hashlib.sha1).digest()).decode()
    body = f"Signature={urllib.parse.quote(sig, safe='')}&{qs}"
    ctx = ssl.create_default_context()
    conn = http.client.HTTPSConnection(f"ecs.{REGION}.aliyuncs.com", timeout=10, context=ctx)
    conn.request("POST", "/", body=body, headers={"Content-Type": "application/x-www-form-urlencoded"})
    r = conn.getresponse()
    data = r.read().decode()
    conn.close()
    return json.loads(data)

def run_and_wait(script, name, timeout_sec=300):
    cmd_id = call("CreateCommand", {
        "Name": name, "Type": "RunShellScript",
        "CommandContent": base64.b64encode(script.encode()).decode(),
        "Timeout": str(timeout_sec),
    })["CommandId"]
    invoke_id = call("InvokeCommand", {
        "CommandId": cmd_id, "InstanceId.1": INSTANCE, "Timed": "false",
    })["InvokeId"]
    print(f"  InvokeId={invoke_id}")
    for i in range(timeout_sec // 5):
        time.sleep(5)
        result = call("DescribeInvocationResults", {"InvokeId": invoke_id})
        items = result.get("Invocation", {}).get("InvocationResults", {}).get("InvocationResult", [])
        if items:
            r = items[0]
            status = r.get("InvocationStatus", "")
            output = r.get("Output", "")
            if output:
                decoded = base64.b64decode(output).decode("utf-8", errors="replace")
                for line in decoded.strip().split("\n"):
                    print(f"    {line}")
            if status in ("Success", "Failed"):
                return status == "Success"
    return False

# Install backend deps + rebuild + restart
step1 = """#!/bin/bash
set -e
echo "=== npm install ==="
cd /opt/matrixflow/backend && npm install 2>&1 | tail -5
echo ""
echo "=== nest build ==="
npx nest build 2>&1 | tail -5
echo ""
echo "=== PM2 restart ==="
pm2 delete matrixflow 2>/dev/null
pm2 start dist/main.js --name matrixflow
sleep 3
echo ""
echo "=== PM2 status ==="
pm2 list | tail -15
pm2 save
"""

# Start nginx + cloudflared
step2 = """#!/bin/bash
set -e
echo "=== Start Nginx ==="
systemctl start nginx 2>/dev/null; nginx 2>&1; sleep 1
echo "Nginx: $(curl -s -o /dev/null -w '%{http_code}' http://localhost/)"
echo ""
echo "=== Start Cloudflared ==="
systemctl start cloudflared 2>/dev/null; sleep 2
systemctl is-active cloudflared 2>/dev/null || echo "cloudflared may need manual start"
echo ""
echo "=== Final Verify ==="
echo "Backend: $(curl -s -o /dev/null -w '%{http_code}' http://localhost:3000/api/v1/health)"
echo "Frontend: $(curl -s -o /dev/null -w '%{http_code}' http://localhost/)"
"""

print("[1/2] Install deps + rebuild + restart backend...")
if not run_and_wait(step1, "install-backend", 600):
    print("Step 1 FAILED")

print("\n[2/2] Start Nginx + Cloudflared...")
run_and_wait(step2, "start-services", 120)
print("\n[DONE]")
