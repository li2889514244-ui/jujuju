# -*- mode: python ; coding: utf-8 -*-

a = Analysis(
    ['companion_app.py'],
    pathex=[],
    binaries=[],
    datas=[
        ('static', 'static'),
        ('conf.py', '.'),
        ('companion_config_default.json', '.'),
    ],
    hiddenimports=[
        'flask',
        'jinja2',
        'werkzeug',
        'markupsafe',
        'local_db',
        'pixing_worker',
        'chrome_cdp',
        'conf',
        'douyin_api_collector',
        'playwright',
        'playwright.sync_api',
        'playwright.async_api',
        'requests',
        'asyncio',
        'sqlite3',
        'aiohttp',
        'urllib.request',
        'queue',
    ],
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
    icon='app_icon.ico',
)

coll = COLLECT(
    exe,
    a.binaries,
    a.zipfiles,
    a.datas,
    strip=False,
    upx=True,
    upx_exclude=[],
    name='pixingyun-mate',
)
