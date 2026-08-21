"""Doudian browser collector for the MatrixFlow desktop companion.

The cloud app stores and displays data. This module keeps Doudian login state
on the user's own Windows machine and uploads only read-only list payloads.
"""

from __future__ import annotations

import asyncio
import json
import re
import time
from pathlib import Path
from typing import Any

import requests
from playwright.async_api import async_playwright


DOUDIAN_HOME = "https://fxg.jinritemai.com/ffa/mshop/homepage/index"

# Realistic Chrome User-Agent — avoids HeadlessChrome detection by Doudian.
# Do NOT use --disable-features=AutomationControlled; that flag itself is a
# detection signal for advanced anti-bot systems.
_DOUDIAN_UA = (
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) '
    'AppleWebKit/537.36 (KHTML, like Gecko) '
    'Chrome/126.0.0.0 Safari/537.36'
)
_DOUDIAN_LAUNCH_ARGS = [
    '--disable-blink-features=AutomationControlled',
    '--no-sandbox',
    '--lang=zh-CN',
]
_DOUDIAN_LOGIN_LAUNCH_ARGS = [
    '--lang=zh-CN',
    '--no-first-run',
    '--no-default-browser-check',
    '--disable-infobars',
]


def _is_security_block_page(url: str, text: str) -> bool:
    """Detect Doudian's anti-automation 'abnormal environment' security page.

    IMPORTANT: Do NOT include generic words like '验证码' or '安全验证' —
    they appear on the normal login page (e.g. "发送验证码") and cause
    false positives that close the browser immediately.
    """
    body = text or ''
    return any(
        marker in body
        for marker in (
            '操作环境异常', '环境异常',
            '操作频繁', '稍后再试', '网络异常',
            '请勿在非官方环境操作', '风险操作',
        )
    )
DOUDIAN_PAGES = [
    {
        "url": "https://fxg.jinritemai.com/ffa/morder/order/list",
        "max_pages": 60,
    },
    {
        "url": "https://fxg.jinritemai.com/ffa/g/list?sov_draft_status=0&sov_goodsType=0",
        "max_pages": 10,
    },
    {
        "url": "https://fxg.jinritemai.com/ffa/maftersale/aftersale/list",
        "max_pages": 60,
    },
]
MAX_PAGINATION_PAGES = 60
PAGE_SETTLE_MS = 1_500
NETWORK_SETTLE_TIMEOUT_MS = 2_000
UPLOAD_CHUNK_ITEMS = 100
UPLOAD_RETRY_DELAYS_SECONDS = (1, 2, 4, 8, 16)
UPLOAD_RETRY_STATUS_CODES = {429, 502, 503, 504}
UPLOAD_RETRY_EXCEPTIONS = (
    requests.exceptions.SSLError,
    requests.exceptions.ConnectionError,
    requests.exceptions.ReadTimeout,
    requests.exceptions.Timeout,
)


class DoudianUploadError(RuntimeError):
    """Friendly upload error for the UI; raw details are printed to logs."""


def _resolve_doudian_browser(
    executable_path: str | None = None,
    channel: str | None = None,
    prefer_system: bool = True,
) -> tuple[str | None, str | None]:
    """Resolve browser for Doudian operations.

    Prefers system Chrome/Edge over Playwright's built-in Chromium because
    Doudian's anti-bot system detects Playwright Chromium via cdc_ variables
    and other CDP markers.

    Returns (executable_path, channel) — only one will be set.
    """
    def _is_playwright_chromium(path: str | None) -> bool:
        marker = str(path or '').replace('/', '\\').lower()
        return '\\ms-playwright\\' in marker or '\\chromium-' in marker

    def _find_system_browser() -> str | None:
        try:
            from browser_manager import find_system_browser_candidates
            candidates = find_system_browser_candidates()
            return candidates[0] if candidates else None
        except Exception:
            return None

    system_browser = _find_system_browser() if prefer_system else None
    if system_browser and (not executable_path or channel or _is_playwright_chromium(executable_path)):
        return (system_browser, None)

    # If caller explicitly provides a real browser path or channel, respect it.
    if executable_path or channel:
        return (executable_path, channel)

    # Fallback: let Playwright decide.
    return (None, None)


async def _goto_with_retry(page, url: str, *, timeout: int = 60_000, attempts: int = 3) -> None:
    last_error: Exception | None = None
    for attempt in range(1, attempts + 1):
        try:
            await page.goto(url, wait_until="domcontentloaded", timeout=timeout)
            return
        except Exception as exc:
            last_error = exc
            if attempt >= attempts:
                break
            try:
                await page.goto("about:blank", wait_until="commit", timeout=10_000)
            except Exception:
                pass
            await page.wait_for_timeout(2_000 * attempt)
    raise RuntimeError(f"打开抖店页面失败：{url}；{last_error}")


def _extract_store_name_from_text(text: str) -> str | None:
    lines = [line.strip() for line in (text or "").splitlines() if line.strip()]
    for index, line in enumerate(lines):
        if line == "AI助手" and index > 0:
            for candidate in reversed(lines[:index]):
                if candidate and candidate not in {"抖店"} and not candidate.isdigit():
                    return candidate[:80]
    return None


def safe_profile_name(name: str) -> str:
    value = re.sub(r"[^a-zA-Z0-9_-]+", "-", name or "").strip("-")
    return value or f"store-{int(time.time())}"


def profile_root() -> Path:
    import os

    base = Path(os.environ.get("LOCALAPPDATA", str(Path.home()))) / "MatrixFlow" / "browser-profiles"
    root = base / "doudian"
    root.mkdir(parents=True, exist_ok=True)
    return root


def get_profile_path(local_profile_id: str) -> Path:
    path = profile_root() / safe_profile_name(local_profile_id)
    path.mkdir(parents=True, exist_ok=True)
    return path


async def _launch_doudian_context(pw, profile_path: Path, kwargs: dict, label: str):
    try:
        return await pw.chromium.launch_persistent_context(str(profile_path), **kwargs)
    except Exception as exc:
        message = str(exc)
        should_retry = any(
            marker in message.lower()
            for marker in (
                "process singleton",
                "singletonlock",
                "user data directory is already in use",
                "browser closed",
                "target page, context or browser has been closed",
            )
        )
        if not should_retry:
            raise
        print(f"[Doudian] launch failed for {label}; cleaning profile browsers and retrying: {message[:160]}", flush=True)
        try:
            from browser_manager import cleanup_browser_processes_for_profile
            cleanup_browser_processes_for_profile(profile_path)
        except Exception as cleanup_err:
            print(f"[Doudian] launch cleanup warning: {str(cleanup_err)[:120]}", flush=True)
        return await pw.chromium.launch_persistent_context(str(profile_path), **kwargs)


async def _safe_close_context(context, timeout_ms: int = 8_000) -> None:
    """Close a Playwright context without letting shutdown hold the sync lock."""
    if not context:
        return
    try:
        await asyncio.wait_for(context.close(), timeout=max(1, timeout_ms) / 1000)
    except asyncio.TimeoutError:
        print("[Doudian] context.close timed out; continuing", flush=True)
    except Exception as exc:
        print(f"[Doudian] context.close warning: {str(exc)[:120]}", flush=True)


async def _safe_close_profile_context(context, profile_path: Path, timeout_ms: int = 8_000) -> None:
    await _safe_close_context(context, timeout_ms=timeout_ms)
    try:
        from browser_manager import cleanup_browser_processes_for_profile
        cleanup_browser_processes_for_profile(profile_path)
    except Exception as exc:
        print(f"[Doudian] profile browser cleanup warning: {str(exc)[:120]}", flush=True)


def _endpoint_from_url(url: str | None) -> str | None:
    if not url:
        return None
    if "/api/order/searchlist" in url:
        return "orders"
    if "/api/order/tabcnt" in url:
        return "orderCounts"
    if "/product/tproduct/list" in url:
        return "products"
    if "/product/tproduct/aggsProductCount" in url:
        return "productCounts"
    if "/after_sale/pc/list" in url:
        return "aftersales"
    if "/shopuser/aftersale/counts" in url:
        return "aftersaleCounts"
    return None


def _payload_items(payload: Any, endpoint: str) -> list:
    if not isinstance(payload, dict):
        return []
    if endpoint == "aftersales":
        items = ((payload.get("data") or {}).get("items") or [])
        return items if isinstance(items, list) else []
    data = payload.get("data") or []
    return data if isinstance(data, list) else []


def _is_login_expired_payload(payload: Any) -> bool:
    if not isinstance(payload, dict):
        return False
    code = str(payload.get("code") or payload.get("st") or "")
    msg = str(payload.get("msg") or payload.get("message") or "")
    return code == "10008" or "登录信息已失效" in msg or "请重新登录" in msg or "login" in msg.lower()


def _is_login_page(url: str, text: str) -> bool:
    return "/login/" in (url or "") or any(
        marker in (text or "")
        for marker in ("手机登录", "邮箱登录", "发送验证码", "登录即代表同意")
    )


def _is_doudian_login_page(url: str, text: str) -> bool:
    current_url = url or ""
    body_text = text or ""
    return "/login/" in current_url or any(
        marker in body_text
        for marker in (
            "\u624b\u673a\u767b\u5f55",
            "\u90ae\u7bb1\u767b\u5f55",
            "\u53d1\u9001\u9a8c\u8bc1\u7801",
            "\u767b\u5f55\u5373\u4ee3\u8868\u540c\u610f",
            "login",
        )
    )


def _is_doudian_logged_in_page(url: str, text: str) -> bool:
    current_url = url or ""
    body_text = text or ""
    if _is_doudian_login_page(current_url, body_text):
        return False
    if "fxg.jinritemai.com" not in current_url:
        return False
    return any(
        marker in body_text
        for marker in (
            "\u6296\u5e97",
            "\u5e97\u94fa",
            "\u8ba2\u5355",
            "\u5546\u54c1",
            "\u552e\u540e",
            "\u5de5\u4f5c\u53f0",
            "\u6570\u636e",
        )
    )


def _payload_key(item: Any, endpoint: str) -> str:
    if endpoint == "orders":
        return str(item.get("shop_order_id") or item.get("order_id") or item)
    if endpoint == "products":
        return str(item.get("product_id") or item)
    info = item.get("after_sale_info") or {}
    return str(info.get("after_sale_id") or item.get("id") or item)


def _merge_payload(current: Any, incoming: Any, endpoint: str) -> Any:
    if not isinstance(incoming, dict):
        return current
    if not current:
        return incoming
    incoming_items = _payload_items(incoming, endpoint)
    if not incoming_items:
        return current

    merged = {}
    for item in _payload_items(current, endpoint):
        merged[_payload_key(item, endpoint)] = item
    for item in incoming_items:
        merged[_payload_key(item, endpoint)] = item

    if endpoint == "aftersales":
        data = dict((current or {}).get("data") or {})
        data["items"] = list(merged.values())
        result = dict(current)
        result["data"] = data
        return result

    result = dict(current)
    result["data"] = list(merged.values())
    return result


def _merge_captured(captured: dict, endpoint: str, payload: Any) -> None:
    if payload is None:
        return
    if endpoint in ("orders", "products", "aftersales"):
        captured[endpoint] = _merge_payload(captured.get(endpoint), payload, endpoint)
    else:
        captured[endpoint] = payload


def _first(*values):
    """Return the first meaningful value, treating 0 as valid."""
    for v in values:
        if v is not None and v != "":
            return v
    return None


def _normalize_text(value):
    if value is None:
        return ""
    if isinstance(value, (int, float)):
        return str(value)
    if isinstance(value, str):
        return value.strip()
    return ""


def _find_nested_value(obj, key_tokens, value_hint_tokens=()):
    if isinstance(obj, list):
        for item in obj:
            found = _find_nested_value(item, key_tokens, value_hint_tokens)
            if found:
                return found
        return ""
    if not isinstance(obj, dict):
        return ""

    for key, value in obj.items():
        key_text = str(key).lower()
        value_text = _normalize_text(value)
        if value_text and any(token in key_text for token in key_tokens):
            return value_text
        if value_text and value_hint_tokens and any(token in value_text for token in value_hint_tokens):
            return value_text

    for value in obj.values():
        if isinstance(value, (dict, list)):
            found = _find_nested_value(value, key_tokens, value_hint_tokens)
            if found:
                return found
    return ""


def _clean_doudian_author_source(value: str) -> str:
    source = _normalize_text(value)
    if not source:
        return ""
    if len(source) > 30:
        return ""
    if any(token in source for token in ("账号的经营身份", "下单留意", "读书卡", "商品")):
        return ""
    return source


def _extract_doudian_author(order: dict, product: dict, page_author: dict | None = None) -> dict:
    search_root = {"order": order, "product": product}
    page_author = page_author or {}
    name = _find_nested_value(
        search_root,
        (
            "author_name",
            "author_nick",
            "creator_name",
            "creator_nick",
            "kol_name",
            "talent_name",
            "talent_nick",
            "promoter_name",
            "promotion_name",
            "affiliate_name",
            "author_account",
            "talent_account",
            "promoter_account",
            "达人",
            "带货",
        ),
    )
    author_id = _find_nested_value(
        search_root,
        (
            "author_id",
            "creator_id",
            "kol_id",
            "talent_id",
            "promoter_id",
            "promotion_id",
            "affiliate_id",
            "author_account",
            "talent_account",
            "promoter_account",
            "达人id",
            "达人_id",
        ),
    )
    source = _find_nested_value(
        search_root,
        ("traffic_source", "source_type", "promotion_type", "affiliate_type", "origin", "channel", "联盟"),
        ("精选联盟", "短视频", "直播"),
    )
    return {
        "author_name": _first(page_author.get("author_name"), name),
        "author_id": _first(page_author.get("author_id"), author_id),
        "author_source": _first(page_author.get("author_source"), _clean_doudian_author_source(source)),
    }


def _order_identifier(order: dict) -> str:
    return _normalize_text(_first(order.get("shop_order_id"), order.get("order_id")))


def _compact_order(order: dict, order_authors: dict | None = None) -> dict:
    product_items = _first(order.get("product_item"), order.get("product_item_list"), order.get("sku_order_list")) or []
    product = (product_items or [{}])[0] or {}
    status_info = order.get("order_status_info") or {}
    order_id = _order_identifier(order)
    author = _extract_doudian_author(order, product, (order_authors or {}).get(order_id))
    return {
        "shop_order_id": _first(order.get("shop_order_id"), order.get("order_id")),
        "order_id": _first(order.get("order_id"), order.get("shop_order_id")),
        "order_status": order.get("order_status"),
        "order_status_text": _first(status_info.get("order_status_text"), order.get("order_status_text")),
        "pay_amount": _first(order.get("pay_amount"), order.get("total_pay_amount"), 0),
        "total_pay_amount": _first(order.get("total_pay_amount"), order.get("pay_amount"), 0),
        "post_amount": _first(order.get("post_amount"), order.get("total_post_amount"), 0),
        "total_post_amount": _first(order.get("total_post_amount"), order.get("post_amount"), 0),
        "product_count": _first(order.get("product_count"), len(product_items) if product_items else 0),
        "create_time": order.get("create_time"),
        "update_time": order.get("update_time"),
        "author_name": author.get("author_name"),
        "author_id": author.get("author_id"),
        "author_source": author.get("author_source"),
        "product_item_list": [
            {
                "product_name": _first(product.get("product_name"), product.get("name"), product.get("title")),
                "name": _first(product.get("name"), product.get("product_name"), product.get("title")),
                "product_pic": _first(product.get("product_pic"), product.get("img"), product.get("img_url")),
                "img": _first(product.get("img"), product.get("product_pic"), product.get("img_url")),
            }
        ],
    }


def _compact_product(product: dict) -> dict:
    return {
        "product_id": product.get("product_id"),
        "name": _first(product.get("name"), product.get("title")),
        "img": _first(product.get("img"), product.get("img_url"), product.get("cover")),
        "price_lower": _first(product.get("price_lower"), product.get("min_price"), product.get("discount_price"), 0),
        "price_higher": _first(product.get("price_higher"), product.get("max_price"), product.get("discount_price"), 0),
        "discount_price": _first(product.get("discount_price"), product.get("price_lower"), product.get("min_price"), 0),
        "sell_num": _first(product.get("sell_num"), product.get("sales"), 0),
        "stock_num": _first(product.get("stock_num"), product.get("stock"), 0),
        "stock": _first(product.get("stock"), product.get("stock_num"), 0),
        "status": product.get("status"),
    }


def _compact_aftersale(item: dict) -> dict:
    info = item.get("after_sale_info") or {}
    order = item.get("order_info") or {}
    related_orders = order.get("related_order_info") or []
    related_product = (related_orders or [{}])[0] or {}
    product = order.get("product_info") or order.get("product") or item.get("product_info") or related_product
    text_part = item.get("text_part") or {}
    return {
        "after_sale_info": {
            "after_sale_id": _first(info.get("after_sale_id"), item.get("id")),
            "related_id": _first(info.get("related_id"), order.get("order_id"), order.get("shop_order_id")),
            "after_sale_type": info.get("after_sale_type"),
            "after_sale_status": info.get("after_sale_status"),
            "after_sale_status_text": _first(text_part.get("after_sale_status_text"), info.get("after_sale_status_text")),
            "after_sale_type_text": _first(text_part.get("after_sale_type_text"), info.get("after_sale_type_text")),
            "reason_text": _first(text_part.get("reason_text"), info.get("reason_text")),
            "refund_amount": _first(info.get("refund_amount"), 0),
            "create_time": _first(info.get("create_time"), info.get("apply_time"), 0),
            "apply_time": _first(info.get("apply_time"), info.get("create_time"), 0),
            "update_time": _first(info.get("update_time"), 0),
        },
        "order_info": {
            "order_id": _first(order.get("order_id"), order.get("shop_order_id"), info.get("related_id")),
            "product_info": {
                "product_id": product.get("product_id"),
                "product_name": _first(product.get("product_name"), product.get("name")),
                "name": _first(product.get("name"), product.get("product_name")),
                "img": _first(product.get("img"), product.get("product_image"), product.get("img_url")),
            },
        },
    }


def compact_captured(captured: dict) -> dict:
    orders = _payload_items(captured.get("orders"), "orders")
    products = _payload_items(captured.get("products"), "products")
    aftersales = _payload_items(captured.get("aftersales"), "aftersales")
    order_authors = captured.get("orderAuthors") if isinstance(captured.get("orderAuthors"), dict) else {}
    order_payload = captured.get("orders") if isinstance(captured.get("orders"), dict) else {}
    product_payload = captured.get("products") if isinstance(captured.get("products"), dict) else {}
    aftersale_payload = captured.get("aftersales") if isinstance(captured.get("aftersales"), dict) else {}

    return {
        "orders": {
            **({k: order_payload.get(k) for k in ("st", "msg", "code", "page", "size", "total") if k in order_payload}),
            "data": [_compact_order(item, order_authors) for item in orders if isinstance(item, dict)],
        },
        "products": {
            **({k: product_payload.get(k) for k in ("st", "msg", "code", "page", "size", "total") if k in product_payload}),
            "data": [_compact_product(item) for item in products if isinstance(item, dict)],
        },
        "aftersales": {
            **({k: aftersale_payload.get(k) for k in ("st", "msg", "code", "page", "size", "total") if k in aftersale_payload}),
            "data": {"items": [_compact_aftersale(item) for item in aftersales if isinstance(item, dict)]},
        },
    }


def _extract_order_authors_from_page_text(text: str) -> dict[str, dict]:
    if not text:
        return {}

    authors: dict[str, dict] = {}
    order_pattern = re.compile(r"订单编号\s*([0-9]{12,})")
    matches = list(order_pattern.finditer(text))
    for index, match in enumerate(matches):
        order_id = match.group(1)
        end = matches[index + 1].start() if index + 1 < len(matches) else len(text)
        block = text[match.end():end]
        author_match = re.search(r"带货达人[:：]\s*(.+?)\s+([0-9]{6,})", block)
        if not author_match:
            continue

        tags: list[str] = []
        source_start = author_match.end()
        source_end_match = re.search(r"(?:\+0|¥|￥|\n\s*售后|\n\s*已)", block[source_start:])
        source_end = source_start + source_end_match.start() if source_end_match else min(len(block), source_start + 120)
        for line in block[source_start:source_end].splitlines():
            value = line.strip()
            if value in ("精选联盟", "短视频", "直播", "小店自卖"):
                tags.append(value)

        authors[order_id] = {
            "author_name": author_match.group(1).strip(),
            "author_id": author_match.group(2).strip(),
            "author_source": " / ".join(dict.fromkeys(tags)) or "联盟达人带货",
        }
    return authors


async def _capture_order_page_authors(page, captured: dict) -> None:
    text = ""
    for _ in range(6):
        try:
            text = await page.locator("body").inner_text(timeout=5_000)
        except Exception:
            text = ""
        debug = captured.setdefault("orderSourceDebug", {"pages": 0, "textLength": 0, "hasOrderNo": False, "hasAuthor": False})
        if isinstance(debug, dict):
            debug["pages"] = int(debug.get("pages") or 0) + 1
            debug["textLength"] = max(int(debug.get("textLength") or 0), len(text))
            debug["hasOrderNo"] = bool(debug.get("hasOrderNo")) or "订单编号" in text
            debug["hasAuthor"] = bool(debug.get("hasAuthor")) or "带货达人" in text
        if "订单编号" in text and ("带货达人" in text or "小店自卖" in text or "精选联盟" in text):
            break
        await page.wait_for_timeout(1_000)
    page_authors = _extract_order_authors_from_page_text(text)
    if not page_authors:
        return
    order_authors = captured.setdefault("orderAuthors", {})
    if isinstance(order_authors, dict):
        order_authors.update(page_authors)
        print(f"[Doudian] captured {len(page_authors)} order sources from page text", flush=True)


async def _click_next_page(page) -> bool:
    try:
        return await page.evaluate(
            """() => {
                const selectors = [
                  '.el-pagination .btn-next',
                  '.auxo-pagination-next',
                  '.semi-page-next',
                  '[aria-label*="下一"]',
                  '[title*="下一"]'
                ];
                const bySelector = selectors
                  .map((selector) => document.querySelector(selector))
                  .find(Boolean);
                const byText = Array.from(document.querySelectorAll('button, a, li')).find((element) => {
                  const text = (element.innerText || element.textContent || '').trim();
                  const aria = element.getAttribute('aria-label') || '';
                  const title = element.getAttribute('title') || '';
                  return /下一页|下一|Next/i.test(`${text} ${aria} ${title}`);
                });
                const target = bySelector || byText;
                if (!target) return false;
                const className = target.className?.toString() || '';
                const disabled = target.hasAttribute('disabled')
                  || target.getAttribute('aria-disabled') === 'true'
                  || className.includes('disabled')
                  || className.includes('is-disabled');
                if (disabled) return false;
                target.click();
                return true;
            }"""
        )
    except Exception:
        return False


async def _visit_and_paginate(page, url: str, max_pages: int = MAX_PAGINATION_PAGES, captured: dict | None = None) -> None:
    try:
        await page.goto("about:blank", wait_until="commit", timeout=10_000)
    except Exception:
        pass
    await _goto_with_retry(page, url)
    try:
        body_text = await page.locator("body").inner_text(timeout=8_000)
    except Exception:
        body_text = ""
    if _is_login_page(page.url, body_text):
        raise RuntimeError("抖店登录已失效，请重新绑定后再同步")
    # Wait for network to settle so API response bodies aren't lost.
    # Keep this short: large stores may paginate over many pages, and a fixed
    # five-second delay per page makes normal syncs hit the companion timeout.
    try:
        await page.wait_for_load_state("networkidle", timeout=NETWORK_SETTLE_TIMEOUT_MS)
    except Exception:
        pass
    await page.wait_for_timeout(PAGE_SETTLE_MS)
    if captured is not None and "/morder/order/list" in url:
        await _capture_order_page_authors(page, captured)
    for _ in range(max(1, max_pages) - 1):
        clicked = await _click_next_page(page)
        if not clicked:
            break
        try:
            await page.wait_for_load_state("networkidle", timeout=NETWORK_SETTLE_TIMEOUT_MS)
        except Exception:
            pass
        await page.wait_for_timeout(PAGE_SETTLE_MS)
        if captured is not None and "/morder/order/list" in url:
            await _capture_order_page_authors(page, captured)


async def open_login_window(
    local_profile_id: str,
    executable_path: str | None = None,
    channel: str | None = None,
    max_wait_seconds: int = 180,
) -> dict:
    profile_path = get_profile_path(local_profile_id)
    async with async_playwright() as pw:
        kwargs = {
            "headless": False,
            "viewport": {"width": 1365, "height": 900},
            "locale": "zh-CN",
            "args": list(_DOUDIAN_LOGIN_LAUNCH_ARGS),
            "ignore_default_args": ["--enable-automation"],
        }
        # Prefer system Chrome over Playwright Chromium for Doudian —
        # system Chrome lacks cdc_ variables and is much harder to detect.
        _exe, _ch = _resolve_doudian_browser(executable_path, channel, prefer_system=True)
        if _exe:
            kwargs["executable_path"] = _exe
        elif _ch:
            kwargs["channel"] = _ch
        context = await _launch_doudian_context(pw, profile_path, kwargs, "login")
        # Keep manual login rendering untouched so captcha widgets stay visible.
        page = context.pages[0] if context.pages else await context.new_page()
        await _goto_with_retry(page, DOUDIAN_HOME)
        logged_in = False
        stable_logged_in_checks = 0
        started_at = time.time()
        reason = "window_closed"
        captured_name = ""
        while context.pages:
            if time.time() - started_at > max_wait_seconds:
                reason = "timeout"
                print(f"[DoudianLogin] login wait timed out: {page.url}", flush=True)
                await _safe_close_profile_context(context, profile_path, timeout_ms=8_000)
                break
            active_page = context.pages[-1]
            try:
                body_text = await active_page.locator("body").inner_text(timeout=2_000)
            except Exception:
                body_text = ""
            if _is_security_block_page(active_page.url, body_text):
                reason = "security_block"
                print(f"[DoudianLogin] security block detected: {active_page.url}", flush=True)
                await _safe_close_profile_context(context, profile_path, timeout_ms=8_000)
                break
            if _is_doudian_logged_in_page(active_page.url, body_text):
                stable_logged_in_checks += 1
                if stable_logged_in_checks >= 3:
                    logged_in = True
                    reason = "confirmed"
                    captured_name = _extract_store_name_from_text(body_text)
                    print(f"[DoudianLogin] login confirmed, closing browser: {active_page.url}", flush=True)
                    if captured_name:
                        print(f"[DoudianLogin] captured store name: {captured_name}", flush=True)
                    await active_page.wait_for_timeout(2_000)
                    break
            else:
                stable_logged_in_checks = 0
            await asyncio.sleep(1)
        final_url = page.url
        if logged_in:
            await _safe_close_profile_context(context, profile_path, timeout_ms=8_000)
        else:
            print(f"[DoudianLogin] browser closed without confirmed login: {final_url}", flush=True)
            await _safe_close_profile_context(context, profile_path, timeout_ms=8_000)
        return {
            "profile_path": str(profile_path),
            "url": final_url,
            "logged_in": logged_in,
            "reason": reason,
            "store_name": captured_name if logged_in and captured_name else "",
        }


async def check_login_state(
    local_profile_id: str,
    executable_path: str | None = None,
    channel: str | None = None,
    timeout_ms: int = 15_000,
) -> dict:
    """Open the saved Doudian profile briefly and report whether it is logged in."""
    profile_path = get_profile_path(local_profile_id)
    async with async_playwright() as pw:
        kwargs = {
            "headless": True,
            "viewport": {"width": 1280, "height": 900},
            "locale": "zh-CN",
            "user_agent": _DOUDIAN_UA,
            "args": list(_DOUDIAN_LAUNCH_ARGS),
            "ignore_default_args": ["--enable-automation"],
        }
        _exe, _ch = _resolve_doudian_browser(executable_path, channel)
        if _exe:
            kwargs["executable_path"] = _exe
        elif _ch:
            kwargs["channel"] = _ch
        context = await _launch_doudian_context(pw, profile_path, kwargs, "state-check")
        try:
            from stealth_patches import apply_stealth_to_context
            await apply_stealth_to_context(context)
        except ImportError:
            pass
        try:
            page = context.pages[0] if context.pages else await context.new_page()
            await _goto_with_retry(page, DOUDIAN_HOME, timeout=timeout_ms, attempts=1)
            await page.wait_for_timeout(2_500)
            text = await page.locator("body").inner_text(timeout=timeout_ms)
            checked_at = time.strftime("%Y-%m-%d %H:%M:%S")
            if _is_security_block_page(page.url, text):
                return {
                    "state": "expired",
                    "online": False,
                    "message": "抖店检测到操作环境异常，请重新登录",
                    "url": page.url,
                    "checked_at": checked_at,
                }
            if _is_doudian_login_page(page.url, text):
                return {
                    "state": "expired",
                    "online": False,
                    "message": "抖店登录失效，请重新登录",
                    "url": page.url,
                    "checked_at": checked_at,
                }
            if _is_doudian_logged_in_page(page.url, text):
                return {
                    "state": "online",
                    "online": True,
                    "message": "已登录",
                    "storeName": _extract_store_name_from_text(text),
                    "url": page.url,
                    "checked_at": checked_at,
                }
            return {
                "state": "unknown",
                "online": False,
                "message": "未能确认登录状态",
                "url": page.url,
                "checked_at": checked_at,
            }
        finally:
            await _safe_close_profile_context(context, profile_path, timeout_ms=8_000)


async def collect_store(
    local_profile_id: str,
    executable_path: str | None = None,
    channel: str | None = None,
) -> dict:
    profile_path = get_profile_path(local_profile_id)
    captured: dict[str, Any] = {}

    async with async_playwright() as pw:
        kwargs = {
            "headless": True,
            "viewport": {"width": 1365, "height": 900},
            "locale": "zh-CN",
            "user_agent": _DOUDIAN_UA,
            "args": list(_DOUDIAN_LAUNCH_ARGS),
            "ignore_default_args": ["--enable-automation"],
        }
        _exe, _ch = _resolve_doudian_browser(executable_path, channel)
        if _exe:
            kwargs["executable_path"] = _exe
        elif _ch:
            kwargs["channel"] = _ch

        context = await _launch_doudian_context(pw, profile_path, kwargs, "sync")
        # 注入反检测脚本
        try:
            from stealth_patches import apply_stealth_to_context
            await apply_stealth_to_context(context)
        except ImportError:
            pass
        page = context.pages[0] if context.pages else await context.new_page()

        # Buffer for raw response texts — read body immediately to avoid
        # Protocol error when the page navigates before response.json() runs.
        raw_responses: list[tuple[str, str]] = []

        async def on_response(response):
            endpoint = _endpoint_from_url(response.url)
            if not endpoint:
                return
            content_type = response.headers.get("content-type", "") or ""
            if "json" not in content_type:
                return
            try:
                text = await response.text()
                raw_responses.append((endpoint, text))
            except Exception:
                pass

        page.on("response", on_response)
        try:
            await _goto_with_retry(page, DOUDIAN_HOME)
            await page.wait_for_timeout(3_000)
            body_text = await page.locator("body").inner_text(timeout=10_000)
            if _is_security_block_page(page.url, body_text):
                raise RuntimeError("抖店检测到操作环境异常，请在伴侣中重新登录该店铺")
            if _is_login_page(page.url, body_text):
                raise RuntimeError("抖店登录已失效，请重新绑定后再同步")
            store_name = _extract_store_name_from_text(body_text)
            if store_name:
                captured["storeName"] = store_name
            for page_config in DOUDIAN_PAGES:
                await _visit_and_paginate(
                    page,
                    page_config["url"],
                    page_config.get("max_pages", MAX_PAGINATION_PAGES),
                    captured,
                )
        finally:
            # Parse buffered responses AFTER all navigation is done,
            # so we never lose a response body to a page navigation.
            import json as _json
            for endpoint, text in raw_responses:
                try:
                    payload = _json.loads(text)
                    if _is_login_expired_payload(payload):
                        captured["_login_expired"] = True
                        captured["_login_error"] = payload.get("msg") or "抖店登录已失效，请重新绑定后再同步"
                        continue
                    _merge_captured(captured, endpoint, payload)
                except Exception:
                    pass
            await _safe_close_profile_context(context, profile_path)

    if captured.get("_login_expired"):
        raise RuntimeError(str(captured.get("_login_error") or "抖店登录已失效，请重新绑定后再同步"))

    if not any(captured.get(key) for key in ("orders", "products", "aftersales")):
        raise RuntimeError("抖店登录态失效，或未捕获到订单/商品/售后接口")

    return captured


def _chunk_items(items: list[Any], size: int = UPLOAD_CHUNK_ITEMS) -> list[list[Any]]:
    return [items[index:index + size] for index in range(0, len(items), size)]


def _payload_chunks(compact: dict, payload: dict) -> list[dict]:
    chunks: list[dict] = []
    base = {
        "storeName": payload.get("storeName"),
        "localProfileId": payload.get("localProfileId"),
    }

    for endpoint in ("products", "orders"):
        source = compact.get(endpoint) if isinstance(compact.get(endpoint), dict) else {}
        items = source.get("data") if isinstance(source.get("data"), list) else []
        meta = {k: source.get(k) for k in ("st", "msg", "code", "page", "size", "total") if k in source}
        for item_chunk in _chunk_items(items):
            chunks.append({**base, endpoint: {**meta, "data": item_chunk}})

    source = compact.get("aftersales") if isinstance(compact.get("aftersales"), dict) else {}
    source_data = source.get("data") if isinstance(source.get("data"), dict) else {}
    items = source_data.get("items") if isinstance(source_data.get("items"), list) else []
    meta = {k: source.get(k) for k in ("st", "msg", "code", "page", "size", "total") if k in source}
    for item_chunk in _chunk_items(items):
        chunks.append({**base, "aftersales": {**meta, "data": {"items": item_chunk}}})

    return chunks


def _new_upload_session() -> requests.Session:
    session = requests.Session()
    adapter = requests.adapters.HTTPAdapter(pool_connections=4, pool_maxsize=4)
    session.mount("https://", adapter)
    session.mount("http://", adapter)
    return session


def _raise_upload_network_error(raw_error: Any) -> None:
    print(f"[DoudianUpload] final upload failure raw={raw_error!r}", flush=True)
    raise DoudianUploadError("上传披星云服务器失败，请检查网络后重试") from None


def _raise_upload_http_error(response: requests.Response) -> None:
    status = int(getattr(response, "status_code", 0) or 0)
    body = ""
    try:
        body = (response.text or "")[:1000]
    except Exception:
        body = ""
    print(
        f"[DoudianUpload] upload rejected status={status} url={getattr(response, 'url', '')} body={body!r}",
        flush=True,
    )
    if status == 400:
        message = "抖店上传被服务器拒绝，请重新登录或重新绑定该店铺后再同步"
    elif status == 403:
        message = "当前账号没有权限同步这个抖店，请确认网站登录账号和店铺归属"
    elif status == 404:
        message = "云端抖店记录不存在，请刷新店铺列表后重新绑定"
    elif status >= 500:
        message = "披星云服务器暂时处理失败，请稍后重试"
    else:
        message = "抖店上传失败，请检查登录状态后重试"
    raise DoudianUploadError(message) from None


def _post_upload_chunk(
    url: str,
    headers: dict,
    chunk: dict,
    *,
    session: requests.Session | None = None,
) -> dict:
    client = session or requests
    last_error: Any = None
    max_retries = len(UPLOAD_RETRY_DELAYS_SECONDS)

    for attempt in range(max_retries + 1):
        try:
            response = client.post(url, json=chunk, headers=headers, timeout=(20, 120))
            if response.status_code in UPLOAD_RETRY_STATUS_CODES:
                last_error = f"HTTP {response.status_code} {response.text[:500]}"
                if attempt < max_retries:
                    delay = UPLOAD_RETRY_DELAYS_SECONDS[attempt]
                    print(
                        f"[DoudianUpload] 抖店数据上传遇到网络波动，{delay} 秒后重试（{attempt + 1}/{max_retries}）"
                        f" raw={last_error}",
                        flush=True,
                    )
                    time.sleep(delay)
                    continue
                _raise_upload_network_error(last_error)

            if response.status_code == 401:
                response.raise_for_status()
            if response.status_code >= 400:
                _raise_upload_http_error(response)

            response.raise_for_status()
            body = response.json()
            return body.get("data") or body
        except UPLOAD_RETRY_EXCEPTIONS as exc:
            last_error = exc
            if attempt < max_retries:
                delay = UPLOAD_RETRY_DELAYS_SECONDS[attempt]
                print(
                    f"[DoudianUpload] 抖店数据上传遇到网络波动，{delay} 秒后重试（{attempt + 1}/{max_retries}）"
                    f" raw={exc!r}",
                    flush=True,
                )
                time.sleep(delay)
                continue
            _raise_upload_network_error(exc)

    _raise_upload_network_error(last_error)


def upload_store_data(api_url: str, token: str, store_id: str, payload: dict) -> dict:
    url = f"{api_url.rstrip('/')}/doudian-browser/stores/{store_id}/upload"
    headers = {"Authorization": f"Bearer {token}"} if token else {}
    compact = compact_captured(payload)
    chunks = _payload_chunks(compact, payload)
    with _new_upload_session() as session:
        if not chunks:
            compact["storeName"] = payload.get("storeName")
            compact["localProfileId"] = payload.get("localProfileId")
            return _post_upload_chunk(url, headers, compact, session=session)

        totals = {"ordersSaved": 0, "productsSaved": 0, "aftersalesSaved": 0, "orderSourcesUploaded": 0}
        result: dict = {}
        for index, chunk in enumerate(chunks):
            chunk["partial"] = index < len(chunks) - 1
            order_items = ((chunk.get("orders") or {}).get("data") or []) if isinstance(chunk.get("orders"), dict) else []
            totals["orderSourcesUploaded"] += sum(
                1 for item in order_items if item.get("author_name") or item.get("author_id")
            )
            size_mb = len(json.dumps(chunk, ensure_ascii=False, separators=(",", ":")).encode("utf-8")) / 1024 / 1024
            print(f"[DoudianUpload] chunk {index + 1}/{len(chunks)} partial={chunk['partial']} size={size_mb:.2f}MB", flush=True)
            result = _post_upload_chunk(url, headers, chunk, session=session)
            for key in totals:
                totals[key] += int(result.get(key) or 0)
    debug = payload.get("orderSourceDebug")
    if isinstance(debug, dict):
        totals["orderSourceDebug"] = debug
    return {**result, **totals, "chunksUploaded": len(chunks)}


def run_async(coro):
    return asyncio.run(coro)
