# -*- mode: python ; coding: utf-8 -*-
import os
from pathlib import Path


def latest_playwright_chromium_tree():
    if os.environ.get('BUNDLE_PLAYWRIGHT_CHROMIUM') != '1':
        return []
    base = Path(os.environ.get('LOCALAPPDATA', '')) / 'ms-playwright'
    if not base.exists():
        return []
    dirs = sorted(
        [d for d in base.iterdir() if d.is_dir() and d.name.startswith('chromium-')],
        key=lambda d: d.name,
        reverse=True,
    )
    if not dirs:
        return []
    selected = dirs[0]
    rows = []
    for path in selected.rglob('*'):
        if path.is_file():
            relative_parent = path.parent.relative_to(selected)
            target_dir = Path('ms-playwright') / selected.name / relative_parent
            rows.append((str(path), str(target_dir)))
    return rows


browser_datas = latest_playwright_chromium_tree()


a = Analysis(
    ['companion_app.py'],
    pathex=[],
    binaries=[],
    datas=[('app_icon.ico', '.'), ('companion_clean_ui.py', '.'), ('companion_state.py', '.'), ('companion_auth.py', '.'), ('companion_config.py', '.'), ('companion_browser.py', '.'), ('companion_collector.py', '.'), ('companion_login_worker.py', '.'), ('companion_metrics.py', '.'), ('companion_updater.py', '.'), ('companion_crypto.py', '.'), ('companion_video_editor.py', '.'), ('video_editor', 'video_editor'), ('stealth_patches.py', '.'), ('fingerprint.py', '.'), ('browser_manager.py', '.'), ('local_db.py', '.'), ('douyin_api_collector.py', '.'), ('doudian_store_collector.py', '.'), ('session_keepalive.py', '.'), ('startup_manager.py', '.'), ('tray_manager.py', '.'), ('webview_window.py', '.'), ('process_registry.py', '.'), ('companion_heartbeat.py', '.'), ('static', 'static')] + browser_datas,
    hiddenimports=['playwright', 'flask', 'flask_cors', 'requests', 'webview', 'webview.platforms.edgechromium', 'PIL', 'sqlite3', 'paramiko', 'psutil', 'cryptography', 'bcrypt', 'pythonnet', 'clr', 'clr_loader', 'mcp', 'startup_manager', 'faster_whisper', 'video_editor', 'video_editor.advanced_engine', 'video_editor.deepseek_client', 'video_editor.engine', 'video_editor.ffmpeg_runner', 'video_editor.material_library', 'video_editor.material_matcher', 'video_editor.models', 'video_editor.probe', 'video_editor.renderer', 'video_editor.silence_editor', 'video_editor.subtitle_engine', 'video_editor.task_manager', 'video_editor.task_store', 'video_editor.timeline', 'video_editor.transcription'],
    hookspath=[],
    hooksconfig={},
    runtime_hooks=[],
    excludes=[],
    noarchive=False,
    optimize=0,
)
pyz = PYZ(a.pure)

exe = EXE(
    pyz,
    a.scripts,
    [],
    exclude_binaries=True,
    name='pixingyun-mate',
    icon='app_icon.ico',
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=True,
    console=False,
    disable_windowed_traceback=False,
    argv_emulation=False,
    target_arch=None,
    codesign_identity=None,
    entitlements_file=None,
)

coll = COLLECT(
    exe,
    a.binaries,
    a.datas,
    strip=False,
    upx=True,
    upx_exclude=[],
    name='pixingyun-mate',
)
