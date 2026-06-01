"""披星云本地伴侣 v4 — 配置"""

import json
from pathlib import Path

BASE_DIR = Path(__file__).parent
CONFIG_FILE = BASE_DIR / "companion_config.json"

DEFAULTS = {
    "chrome_port": 9222,
    "flask_port": 5409,
    "collect_interval_minutes": 30,
    "history_snapshot_hour": 2,  # 每天凌晨2点拍历史快照
    "platforms": {
        "douyin": {"enabled": True, "name": "抖音"},
        "kuaishou": {"enabled": True, "name": "快手"},
        "xiaohongshu": {"enabled": True, "name": "小红书"},
    },
    "cloud_api": "https://ddddkiii.com/api",
    "db_path": str(BASE_DIR / "companion_data.db"),
    "cookies_dir": str(BASE_DIR / "cookies"),
    "chrome_profile": str(BASE_DIR / "chrome_profile"),
    "logs_dir": str(BASE_DIR / "logs"),
    "theme": "dark",
}


def load() -> dict:
    if CONFIG_FILE.exists():
        cfg = json.loads(CONFIG_FILE.read_text(encoding="utf-8"))
        for k, v in DEFAULTS.items():
            cfg.setdefault(k, v)
        return cfg
    return dict(DEFAULTS)


def save(cfg: dict):
    CONFIG_FILE.write_text(json.dumps(cfg, indent=2, ensure_ascii=False), encoding="utf-8")
