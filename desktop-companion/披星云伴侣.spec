# -*- mode: python ; coding: utf-8 -*-


a = Analysis(
    ['companion_app.py'],
    pathex=[],
    binaries=[],
    datas=[('static', 'static'), ('companion_state.py', '.')],
    hiddenimports=['lark', 'bs4', 'cryptography', 'playwright', 'paramiko', 'asyncio', 'uvicorn'],
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
    name='披星云伴侣',
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=True,
    upx_exclude=[],
    runtime_tmpdir=None,
    console=True,
    disable_windowed_traceback=False,
    argv_emulation=False,
    target_arch=None,
    codesign_identity=None,
    entitlements_file=None,
)
