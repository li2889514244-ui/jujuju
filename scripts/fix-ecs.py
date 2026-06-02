"""Fix ECS services."""
import hashlib, hmac, base64, json, os, time, urllib.parse, uuid, http.client, ssl, sys

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

def run_and_wait(script, name, timeout_sec=120):
    cmd_id = call("CreateCommand", {
        "Name": name, "Type": "RunShellScript",
        "CommandContent": base64.b64encode(script.encode()).decode(),
        "Timeout": str(timeout_sec),
    })["CommandId"]
    invoke_id = call("InvokeCommand", {
        "CommandId": cmd_id, "InstanceId.1": INSTANCE, "Timed": "false",
    })["InvokeId"]
    print(f"  [{name}] InvokeId={invoke_id}")
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

# Step 1: Check PM2 error log
step1 = """#!/bin/bash
echo "=== PM2 logs (last 20 lines) ==="
pm2 logs matrixflow --lines 20 --nostream 2>&1 | tail -20
echo ""
echo "=== Backend error log ==="
cat /opt/matrixflow/backend/logs/error.log 2>/dev/null | tail -10 || echo "no error.log"
echo ""
echo "=== PM2 restart ==="
cd /opt/matrixflow/backend && pm2 delete matrixflow 2>/dev/null; pm2 start dist/main.js --name matrixflow 2>&1
sleep 3
echo ""
echo "=== PM2 status ==="
pm2 list | tail -15
pm2 save 2>/dev/null
"""

print("[1/3] Check PM2 & restart backend...")
run_and_wait(step1, "fix-pm2", 120)

# Step 2: Start Nginx + Cloudflared
step2 = """#!/bin/bash
echo "=== Start Nginx ==="
systemctl start nginx 2>/dev/null || service nginx start 2>/dev/null || nginx 2>&1
sleep 1
echo "Nginx: $(curl -s -o /dev/null -w '%{http_code}' http://localhost/)"
echo ""
echo "=== Start Cloudflared ==="
systemctl start cloudflared 2>/dev/null || service cloudflared start 2>/dev/null
sleep 2
echo "Cloudflared: $(systemctl is-active cloudflared 2>/dev/null || echo 'checking...')"
"""

print("\n[2/3] Start Nginx + Cloudflared...")
run_and_wait(step2, "fix-nginx-cf", 60)

# Step 3: Verify
step3 = """#!/bin/bash
echo "=== Final Status ==="
echo "Backend: $(curl -s -o /dev/null -w '%{http_code}' http://localhost:3000/api/v1/health)"
echo "Frontend: $(curl -s -o /dev/null -w '%{http_code}' http://localhost/)"
echo "PM2: $(pm2 list 2>&1 | grep matrixflow | grep -oP 'online|errored|stopped')"
"""

print("\n[3/3] Verify...")
run_and_wait(step3, "verify", 30)
print("\n[DONE]")
