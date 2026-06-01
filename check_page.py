import json, websocket

PAGE = "89FDD4F0EB3E5405C914C4D16C34497E"
ws = websocket.create_connection(f"ws://127.0.0.1:9333/devtools/page/{PAGE}")

# Test 1: Page.getNavigationHistory
ws.send(json.dumps({"id":1, "method":"Page.getNavigationHistory"}))
print("NAV:", json.dumps(json.loads(ws.recv()), indent=2, ensure_ascii=False)[:1000])

# Test 2: Runtime.evaluate simple
ws.send(json.dumps({"id":2, "method":"Runtime.evaluate", "params": {"expression": "1+1"}}))
print("\nEVAL 1+1:", json.dumps(json.loads(ws.recv()), indent=2, ensure_ascii=False)[:500])

# Test 3: Runtime.evaluate with returnByValue
ws.send(json.dumps({"id":3, "method":"Runtime.evaluate", "params": {"expression": "document.title", "returnByValue": True}}))
print("\nEVAL title:", json.dumps(json.loads(ws.recv()), indent=2, ensure_ascii=False)[:1000])

ws.close()
