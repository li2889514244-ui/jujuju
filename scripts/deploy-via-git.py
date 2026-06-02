"""Deploy frontend by git pull on ECS (dist tracked in git, no build needed)."""
import hashlib, hmac, base64, json, os, sys, time, urllib.parse, uuid, http.client, ssl

home = os.path.expanduser("~")
with open(os.path.join(home, ".aliyun", "config.json")) as f:
    cfg = json.load(f)
profile = next(p for p in cfg["profiles"] if p["name"] == cfg["current"])
AK_ID = profile["access_key_id"]
AK_SECRET = profile["access_key_secret"]
REGION = "cn-guangzhou"
INSTANCE = "i-7xvb9wno2duq8msd35l1"

def sign(params):
    sorted_keys = sorted(params.keys())
    qs = "&".join(f"{urllib.parse.quote(k, safe='')}={urllib.parse.quote(str(params[k]), safe='')}" for k in sorted_keys)
    string_to_sign = f"POST&{urllib.parse.quote('/', safe='')}&{urllib.parse.quote(qs, safe='')}"
    sig = base64.b64encode(hmac.new(f"{AK_SECRET}&".encode(), string_to_sign.encode(), hashlib.sha1).digest()).decode()
    return f"Signature={urllib.parse.quote(sig, safe='')}&{qs}"

def call(action, extra=None):
    params = {
        "Action": action, "Format": "JSON", "Version": "2014-05-26",
        "AccessKeyId": AK_ID, "SignatureMethod": "HMAC-SHA1",
        "Timestamp": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "SignatureVersion": "1.0", "SignatureNonce": str(uuid.uuid4()),
        "RegionId": REGION,
    }
    if extra: params.update(extra)
    body = sign(params)
    ctx = ssl.create_default_context()
    conn = http.client.HTTPSConnection(f"ecs.{REGION}.aliyuncs.com", timeout=15, context=ctx)
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
    
    print(f"  {name}: InvokeId={invoke_id}", flush=True)
    
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
        if i % 12 == 0 and i > 0:
            print(f"  {(i+1)*5}s...", flush=True)
    
    print("  TIMEOUT")
    return False

# Single step: git pull + copy dist to nginx + reload (~30s)
deploy = """#!/bin/bash
set -e
echo "=== git pull ==="
cd /opt/matrixflow && git fetch origin master && git reset --hard origin/master
echo "=== deploy dist to nginx ==="
rm -rf /var/www/matrixflow/*
cp -r /opt/matrixflow/frontend/dist/* /var/www/matrixflow/
nginx -s reload 2>/dev/null || service nginx reload 2>/dev/null
echo "=== DONE ==="
ls -la /var/www/matrixflow/index.html
"""

print("[1/1] Git pull + deploy dist (~30s)...")
if not run_and_wait(deploy, "deploy-frontend", 120):
    print("DEPLOY FAILED")
    sys.exit(1)

print("\n=== FRONTEND DEPLOYED SUCCESSFULLY ===")
