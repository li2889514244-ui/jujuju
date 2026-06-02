"""Upload dist.tar.gz to ECS in chunks and deploy — Python version."""
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

def run_and_wait(script, name, timeout_sec=300):
    """Run command on ECS and wait for result."""
    cmd_id = call("CreateCommand", {
        "Name": name, "Type": "RunShellScript",
        "CommandContent": base64.b64encode(script.encode()).decode(),
        "Timeout": str(timeout_sec),
    })["CommandId"]
    
    invoke_id = call("InvokeCommand", {
        "CommandId": cmd_id, "InstanceId.1": INSTANCE, "Timed": "false",
    })["InvokeId"]
    
    print(f"  {name}: InvokeId={invoke_id[:20]}...", flush=True)
    
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
        if i % 6 == 0:
            print(f"  {(i+1)*5}s...", flush=True)
    
    print("  TIMEOUT")
    return False

def main():
    dist_path = os.path.join(os.path.dirname(__file__), "dist.tar.gz")
    if not os.path.exists(dist_path):
        print(f"ERROR: {dist_path} not found")
        sys.exit(1)
    
    with open(dist_path, "rb") as f:
        data = f.read()
    
    encoded = base64.b64encode(data).decode()
    total_size = len(encoded)
    print(f"dist.tar.gz: {len(data)} bytes -> base64 {total_size} chars")
    
    # Chunk size: ~200KB per chunk (takes ~3 base64 chars per 2 bytes = ~133KB raw per chunk)
    # RunCommand script limit ~16KB, base64 chunk in heredoc ~200KB chars = OK
    chunk_size = 200_000
    chunks = [encoded[i:i+chunk_size] for i in range(0, len(encoded), chunk_size)]
    print(f"Split into {len(chunks)} chunks")
    
    # Step 0: Clean up
    print("\n[0] Cleaning up...")
    run_and_wait("rm -f /tmp/dist.tar.gz.b64 /tmp/dist.tar.gz", "cleanup", 60)
    
    # Step 1-N: Upload chunks
    for idx, chunk in enumerate(chunks):
        script = f'cat >> /tmp/dist.tar.gz.b64 << \'EOFCHUNK\'\n{chunk}\nEOFCHUNK\n'
        name = f"upload-chunk-{idx:02d}"
        print(f"\n[{idx+1}/{len(chunks)}] Uploading chunk {idx} ({len(chunk)} chars)...")
        ok = run_and_wait(script, name, 120)
        if not ok:
            print(f"FAILED at chunk {idx}")
            sys.exit(1)
    
    # Final step: decode, extract, deploy
    print("\n[Final] Decoding and deploying...")
    deploy_script = """#!/bin/bash
set -e
echo "[1/4] decoding..."
base64 -d /tmp/dist.tar.gz.b64 > /tmp/dist.tar.gz
echo "[2/4] extracting..."
cd /tmp && tar -xzf dist.tar.gz
echo "[3/4] deploying to nginx..."
rm -rf /var/www/matrixflow/*
cp -r dist/* /var/www/matrixflow/
echo "[4/4] reloading nginx..."
nginx -s reload 2>/dev/null || service nginx reload 2>/dev/null || systemctl reload nginx 2>/dev/null
echo "---"
ls -la /var/www/matrixflow/index.html && echo "DEPLOY SUCCESS"
rm -f /tmp/dist.tar.gz.b64 /tmp/dist.tar.gz
"""
    ok = run_and_wait(deploy_script, "deploy-final", 120)
    if ok:
        print("\n=== DEPLOYMENT COMPLETE ===")
    else:
        print("\n=== DEPLOYMENT FAILED ===")
        sys.exit(1)

if __name__ == "__main__":
    main()
