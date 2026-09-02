import json, time, urllib.request
task_id = 've_1787570330_e5af37e4'
deadline = time.time() + 2400
last = None
while time.time() < deadline:
    try:
        with urllib.request.urlopen(f'http://127.0.0.1:5409/api/video-editor/v2/tasks/{task_id}', timeout=15) as resp:
            j = json.loads(resp.read().decode('utf-8'))
        t = j.get('data') or {}
        line = f"status={t.get('status')} pct={t.get('progress')} step={t.get('current_step')!r} err={t.get('error')}"
        if line != last:
            print(time.strftime('%H:%M:%S'), line, flush=True)
            last = line
        if t.get('status') in ('done', 'error', 'cancelled', 'awaiting_confirmation', 'interrupted'):
            print('FINAL:', json.dumps(t, ensure_ascii=False)[:1600], flush=True)
            break
    except Exception as e:
        print('poll err', e, flush=True)
    time.sleep(10)
print('poll loop ended', flush=True)
