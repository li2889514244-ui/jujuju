"""Diagnose and fix nginx/Docker port conflicts."""
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

def run_and_wait(script, name, timeout_sec=120):
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

script = """#!/bin/bash
set -e

echo "=== Docker containers ==="
docker ps --format "{{.Names}} {{.Ports}}" 2>/dev/null || echo "no docker"

echo ""
echo "=== Nginx sites ==="
ls /etc/nginx/sites-enabled/ 2>/dev/null
ls /etc/nginx/conf.d/ 2>/dev/null
echo ""
echo "=== Nginx config with listen ==="
grep -rn "listen" /etc/nginx/sites-enabled/ /etc/nginx/conf.d/ 2>/dev/null
echo ""
echo "=== Full nginx.conf tail ==="
tail -30 /etc/nginx/nginx.conf
echo ""
echo "=== MatrixFlow nginx config ==="
cat /etc/nginx/sites-enabled/matrixflow 2>/dev/null || cat /etc/nginx/conf.d/matrixflow.conf 2>/dev/null || echo "NO_MATRIXFLOW_CONFIG"
echo ""
echo "=== What's on port 80 ==="
docker ps --filter "publish=80" --format "table {{.Names}}\\t{{.Image}}\\t{{.Ports}}" 2>/dev/null
"""

print("[Diagnose] Port conflicts...")
run_and_wait(script, "diagnose", 60)
print("\n[DONE]")
