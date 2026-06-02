"""Aliyun ECS RunCommand — no proxy, no SDK, pure stdlib."""
import hashlib, hmac, base64, json, os, sys, time, urllib.parse, uuid, http.client, ssl

with open(os.path.expanduser("~/.aliyun/config.json")) as f:
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
    conn.request("POST", "/", body=body, headers={
        "Content-Type": "application/x-www-form-urlencoded",
        "Host": f"ecs.{REGION}.aliyuncs.com"
    })
    resp = conn.getresponse()
    data = resp.read().decode()
    conn.close()
    return json.loads(data)

def run_command(script, name="deploy", timeout_sec=300):
    cmd_id = call("CreateCommand", {
        "Name": name, "Type": "RunShellScript",
        "CommandContent": base64.b64encode(script.encode()).decode(),
        "Timeout": str(timeout_sec),
    })["CommandId"]
    
    invoke_id = call("InvokeCommand", {
        "CommandId": cmd_id, "InstanceId.1": INSTANCE, "Timed": "false",
    })["InvokeId"]
    
    print(f"InvokeId: {invoke_id}", flush=True)
    
    for i in range(timeout_sec // 3):
        time.sleep(3)
        try:
            result = call("DescribeInvocationResults", {"InvokeId": invoke_id})
        except Exception as e:
            print(f"  err: {e}", flush=True)
            continue
        
        items = result.get("Invocation", {}).get("InvocationResults", {}).get("InvocationResult", [])
        if items:
            r = items[0]
            status = r.get("InvocationStatus", "")
            output = r.get("Output", "")
            if output:
                try:
                    print(base64.b64decode(output).decode("utf-8", errors="replace"))
                except:
                    print(output)
            if status in ("Success", "Failed"):
                return status == "Success"
        if i % 10 == 0:
            print(f"  {(i+1)*3}s...", flush=True)
    
    print("Timeout")
    return False

if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Usage: python ecs-run.py <script.sh> [timeout_sec]")
        sys.exit(1)
    
    with open(sys.argv[1], encoding="utf-8") as f:
        script = f.read()
    
    timeout = int(sys.argv[2]) if len(sys.argv) > 2 else 300
    name = f"deploy-{os.path.basename(sys.argv[1]).replace('.sh','')}"
    
    ok = run_command(script, name=name, timeout_sec=timeout)
    sys.exit(0 if ok else 1)
