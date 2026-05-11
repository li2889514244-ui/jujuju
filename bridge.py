"""
MatrixFlow Python Bridge - wraps social-auto-upload for NestJS consumption.
Exposes FastAPI endpoints for login, upload, and account management.
"""
import asyncio
import json
import os
import sys
import uuid
from datetime import datetime
from pathlib import Path
from typing import Optional

# Add social-auto-upload to Python path
SAU_DIR = Path(__file__).parent / "social-auto-upload"
sys.path.insert(0, str(SAU_DIR))

from fastapi import FastAPI, HTTPException, BackgroundTasks
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pydantic import BaseModel
import uvicorn

# Import from social-auto-upload
from conf import BASE_DIR
from uploader.douyin_uploader.main import (
    DouYinVideo, DouYinNote,
    DOUYIN_PUBLISH_STRATEGY_IMMEDIATE, DOUYIN_PUBLISH_STRATEGY_SCHEDULED,
    douyin_setup, cookie_auth as douyin_cookie_auth,
)
from uploader.xiaohongshu_uploader.main import (
    XiaoHongShuVideo, XiaoHongShuNote,
    XIAOHONGSHU_PUBLISH_STRATEGY_IMMEDIATE, XIAOHONGSHU_PUBLISH_STRATEGY_SCHEDULED,
    xiaohongshu_setup, cookie_auth as xiaohongshu_cookie_auth,
)
from uploader.ks_uploader.main import (
    KSVideo, KSNote,
    KUAISHOU_PUBLISH_STRATEGY_IMMEDIATE, KUAISHOU_PUBLISH_STRATEGY_SCHEDULED,
    ks_setup, cookie_auth as kuaishou_cookie_auth,
)

app = FastAPI(title="MatrixFlow Bridge", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Session storage (in production use Redis)
sessions: dict = {}

# ===== Models =====

class LoginRequest(BaseModel):
    platform: str  # douyin, xiaohongshu, kuaishou
    account_name: str = "default"

class UploadVideoRequest(BaseModel):
    platform: str
    account_name: str
    video_path: str
    title: str
    description: str = ""
    tags: list[str] = []
    publish_date: Optional[str] = None  # ISO format or "now"
    thumbnail_path: Optional[str] = None

class UploadNoteRequest(BaseModel):
    platform: str
    account_name: str
    image_paths: list[str]
    title: str
    content: str = ""
    tags: list[str] = []
    publish_date: Optional[str] = None

class AccountCheckRequest(BaseModel):
    platform: str
    account_name: str

# ===== Health =====

@app.get("/health")
async def health():
    return {"status": "ok", "timestamp": datetime.utcnow().isoformat()}

# ===== Login =====

@app.post("/login/start")
async def start_login(req: LoginRequest):
    """Start QR code login, returns QR image base64"""
    platform = req.platform.lower()
    account_name = req.account_name
    account_file = str(SAU_DIR / "cookies" / f"{platform}_uploader" / f"{account_name}.json")
    Path(account_file).parent.mkdir(parents=True, exist_ok=True)

    session_id = str(uuid.uuid4())
    sessions[session_id] = {"status": "starting", "platform": platform}

    qr_queue = asyncio.Queue()

    async def login_task():
        try:
            setup_func = {
                "douyin": douyin_setup,
                "xiaohongshu": xiaohongshu_setup,
                "kuaishou": ks_setup,
            }.get(platform)

            if not setup_func:
                sessions[session_id] = {"status": "error", "error": f"Unsupported platform: {platform}"}
                return

            result = await setup_func(
                account_file=account_file,
                handle=True,
                return_detail=True,
                qrcode_callback=lambda payload: qr_queue.put_nowait(payload),
                headless=True,
            )

            sessions[session_id] = {
                "status": "success" if result.get("success") else "error",
                "platform": platform,
                "account_name": account_name,
                "result": result,
            }
        except Exception as e:
            sessions[session_id] = {"status": "error", "error": str(e)}

    # Start login in background
    asyncio.create_task(login_task())

    # Wait for QR code (max 30s)
    try:
        qr_data = await asyncio.wait_for(qr_queue.get(), timeout=30)
        sessions[session_id]["qr_code"] = qr_data.get("qrcode") or qr_data.get("src")
        return {
            "session_id": session_id,
            "qr_code": sessions[session_id].get("qr_code"),
            "status": "waiting_scan",
        }
    except asyncio.TimeoutError:
        return {"session_id": session_id, "error": "QR code timeout", "status": "timeout"}


@app.get("/login/status/{session_id}")
async def login_status(session_id: str):
    """Check login session status"""
    session = sessions.get(session_id)
    if not session:
        raise HTTPException(404, "Session not found")
    return session

# ===== Account Check =====

@app.post("/accounts/check")
async def check_account(req: AccountCheckRequest):
    """Check if saved cookies are still valid"""
    platform = req.platform.lower()
    account_name = req.account_name
    account_file = str(SAU_DIR / "cookies" / f"{platform}_uploader" / f"{account_name}.json")

    if not Path(account_file).exists():
        return {"valid": False, "reason": "Account not found"}

    auth_func = {
        "douyin": douyin_cookie_auth,
        "xiaohongshu": xiaohongshu_cookie_auth,
        "kuaishou": kuaishou_cookie_auth,
    }.get(platform)

    if not auth_func:
        return {"valid": False, "reason": f"Unsupported platform: {platform}"}

    try:
        result = await auth_func(account_file)
        return {"valid": True, "detail": result}
    except Exception as e:
        return {"valid": False, "reason": str(e)}

# ===== Upload =====

@app.post("/upload/video")
async def upload_video(req: UploadVideoRequest):
    """Upload video to a platform"""
    platform = req.platform.lower()
    account_name = req.account_name
    account_file = Path(SAU_DIR / "cookies" / f"{platform}_uploader" / f"{account_name}.json")
    video_path = req.video_path
    if not Path(video_path).exists():
        raise HTTPException(400, f"Video file not found: {video_path}")

    publish_date = datetime.now() if not req.publish_date or req.publish_date == "now" \
        else datetime.fromisoformat(req.publish_date)

    try:
        if platform == "douyin":
            app = DouYinVideo(
                title=req.title,
                file_path=video_path,
                tags=req.tags,
                publish_date=publish_date,
                account_file=str(account_file),
                publish_strategy=DOUYIN_PUBLISH_STRATEGY_IMMEDIATE,
            )
            await app.douyin_upload_video()
        elif platform == "xiaohongshu":
            app = XiaoHongShuVideo(
                title=req.title,
                file_path=video_path,
                tags=req.tags,
                publish_date=publish_date,
                account_file=str(account_file),
                publish_strategy=XIAOHONGSHU_PUBLISH_STRATEGY_IMMEDIATE,
            )
            await app.main()
        elif platform == "kuaishou":
            app = KSVideo(
                title=req.title,
                file_path=video_path,
                tags=req.tags,
                publish_date=publish_date,
                account_file=str(account_file),
                publish_strategy=KUAISHOU_PUBLISH_STRATEGY_IMMEDIATE,
            )
            await app.main()
        else:
            raise HTTPException(400, f"Unsupported platform: {platform}")

        return {"status": "published", "platform": platform, "title": req.title}
    except Exception as e:
        raise HTTPException(500, str(e))


@app.post("/upload/note")
async def upload_note(req: UploadNoteRequest):
    """Upload note/image to a platform"""
    platform = req.platform.lower()
    account_name = req.account_name
    account_file = Path(SAU_DIR / "cookies" / f"{platform}_uploader" / f"{account_name}.json")

    publish_date = datetime.now() if not req.publish_date or req.publish_date == "now" \
        else datetime.fromisoformat(req.publish_date)

    try:
        if platform == "douyin":
            app = DouYinNote(
                title=req.title,
                image_files=[Path(p) for p in req.image_paths],
                tags=req.tags,
                publish_date=publish_date,
                account_file=str(account_file),
                publish_strategy=DOUYIN_PUBLISH_STRATEGY_IMMEDIATE,
            )
            await app.main()
        elif platform == "xiaohongshu":
            app = XiaoHongShuNote(
                title=req.title,
                image_files=[Path(p) for p in req.image_paths],
                tags=req.tags,
                publish_date=publish_date,
                account_file=str(account_file),
                publish_strategy=XIAOHONGSHU_PUBLISH_STRATEGY_IMMEDIATE,
            )
            await app.main()
        elif platform == "kuaishou":
            app = KSNote(
                title=req.title,
                image_files=[Path(p) for p in req.image_paths],
                tags=req.tags,
                publish_date=publish_date,
                account_file=str(account_file),
                publish_strategy=KUAISHOU_PUBLISH_STRATEGY_IMMEDIATE,
            )
            await app.main()
        else:
            raise HTTPException(400, f"Unsupported platform: {platform}")

        return {"status": "published", "platform": platform, "title": req.title}
    except Exception as e:
        raise HTTPException(500, str(e))

# ===== Platform List =====

@app.get("/platforms")
async def list_platforms():
    return {
        "platforms": [
            {"id": "douyin", "name": "Douyin"},
            {"id": "xiaohongshu", "name": "XiaoHongShu"},
            {"id": "kuaishou", "name": "Kuaishou"},
        ],
    }


if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=8000)
