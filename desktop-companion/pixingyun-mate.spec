# -*- mode: python ; coding: utf-8 -*-


a = Analysis(
    ['companion_app.py'],
    pathex=[],
    binaries=[],
    datas=[('companion_clean_ui.py', '.'), ('companion_state.py', '.'), ('companion_auth.py', '.'), ('companion_config.py', '.'), ('companion_browser.py', '.'), ('companion_collector.py', '.'), ('companion_login_worker.py', '.'), ('companion_metrics.py', '.'), ('companion_updater.py', '.'), ('companion_crypto.py', '.'), ('companion_video_editor.py', '.'), ('video_editor', 'video_editor'), ('stealth_patches.py', '.'), ('fingerprint.py', '.'), ('browser_manager.py', '.'), ('local_db.py', '.'), ('douyin_api_collector.py', '.'), ('doudian_store_collector.py', '.'), ('session_keepalive.py', '.'), ('startup_manager.py', '.'), ('tray_manager.py', '.'), ('webview_window.py', '.'), ('process_registry.py', '.'), ('static', 'static')],
    hiddenimports=['playwright', 'flask', 'flask_cors', 'requests', 'webview', 'PIL', 'sqlite3', 'paramiko', 'psutil', 'cryptography', 'bcrypt', 'mcp', 'startup_manager', 'faster_whisper', 'video_editor', 'video_editor.advanced_engine', 'video_editor.deepseek_client', 'video_editor.engine', 'video_editor.ffmpeg_runner', 'video_editor.material_library', 'video_editor.material_matcher', 'video_editor.models', 'video_editor.probe', 'video_editor.renderer', 'video_editor.silence_editor', 'video_editor.subtitle_engine', 'video_editor.task_manager', 'video_editor.task_store', 'video_editor.timeline', 'video_editor.transcription'],
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
    a.binaries,
    a.datas,
    [],
    name='pixingyun-mate',
    icon='app_icon.ico',
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=True,
    upx_exclude=[],
    runtime_tmpdir=None,
    console=False,
    disable_windowed_traceback=False,
    argv_emulation=False,
    target_arch=None,
    codesign_identity=None,
    entitlements_file=None,
)
