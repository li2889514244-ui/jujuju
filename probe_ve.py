import json, urllib.request
path = r'C:\Users\EDY\Downloads\69.9\7.3直播贴片\素人直播KT版 (1)\小红书-卢慧老师资料\现场素材\MVI_0211.MP4'
body = json.dumps({
    'source_path': path,
    'pace': 'compact',
    'subtitle_template': 'yellow',
    'material_density': 'normal',
}).encode('utf-8')
req = urllib.request.Request('http://127.0.0.1:5409/api/video-editor/v2/basic', data=body, headers={'Content-Type': 'application/json'})
try:
    with urllib.request.urlopen(req, timeout=60) as resp:
        print(resp.status, resp.read().decode('utf-8')[:400])
except urllib.error.HTTPError as e:
    print(e.code, e.read().decode('utf-8')[:400])
