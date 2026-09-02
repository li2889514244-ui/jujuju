import json, time, urllib.request
task_id = 've_1787569637_a8a741e4'
deadline = time.time() + 1500
last = None
while time.time() < deadline:
    try:
        with urllib.request.urlopen(f'http://127.0.0.1:5409/api/video-editor/v2/tasks/{task_id}', timeout=15) as resp:
            j = json.loads(resp.read().decode('utf-8'))
        t = j.get('data') or {}
        line = f"status={t.get('status')} pct={t.get('progress')} step={t.get('current_step')!r} err={t.get('error')}"
        if line != last:
            print(time.strftime('%H:%M:%S'), line)
            last = line
        if t.get('status') in ('done', 'error', 'cancelled', 'awaiting_confirmation'):
            print('FINAL:', json.dumps(t, ensure_ascii=False)[:1500])
            break
    except Exception as e:
        print('poll err', e)
    time.sleep(10)
