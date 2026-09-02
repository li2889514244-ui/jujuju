from __future__ import annotations

import json
import os
import time
from urllib import request


def deepseek_configured() -> bool:
    return bool(os.environ.get("DEEPSEEK_API_KEY", "").strip())


def call_deepseek_json(prompt: str, model: str = "deepseek-v4-flash", system: str = "只返回合法 JSON。", retries: int = 2) -> object:
    api_key = os.environ.get("DEEPSEEK_API_KEY", "").strip()
    if not api_key:
        raise RuntimeError("AI_NOT_CONFIGURED")
    base = os.environ.get("DEEPSEEK_BASE_URL", "https://api.deepseek.com").rstrip("/")
    last_error = None
    for attempt in range(retries):
        payload = json.dumps(
            {
                "model": model,
                "messages": [
                    {"role": "system", "content": system},
                    {"role": "user", "content": prompt if attempt == 0 else prompt + "\n\n上一次返回不是合法 JSON，请只返回合法 JSON。"},
                ],
                "temperature": 0.25,
            },
            ensure_ascii=False,
        ).encode("utf-8")
        req = request.Request(
            base + "/v1/chat/completions",
            data=payload,
            headers={"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"},
            method="POST",
        )
        try:
            with request.urlopen(req, timeout=90) as resp:
                data = json.loads(resp.read().decode("utf-8", "replace"))
            content = data["choices"][0]["message"]["content"].strip()
            if content.startswith("```"):
                content = "\n".join(line for line in content.splitlines() if not line.strip().startswith("```"))
            return json.loads(content)
        except Exception as exc:
            last_error = exc
            time.sleep(1 + attempt)
    raise RuntimeError(f"AI_REQUEST_FAILED:{last_error}")
