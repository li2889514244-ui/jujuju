# -*- coding: utf-8 -*-
"""
披星云伴侣 · 统一编码工具
=========================
全项目文本 IO / JSON / subprocess 输出解码的唯一入口。

原则：
- 项目内部文本一律 UTF-8；
- 外部命令输出解码顺序：UTF-8 → gb18030（覆盖 GBK/GB2312）→ UTF-8 replace；
- 绝不使用 errors='ignore' 静默丢弃字节；
- JSON 写盘统一 ensure_ascii=False + UTF-8；
- 不依赖 Windows 默认编码（locale / cp936）。
"""

import json
import subprocess
from pathlib import Path
from typing import Any, Optional, Sequence, Union


def decode_bytes(data: Union[bytes, bytearray, memoryview, None], *, source: str = "") -> str:
    """把外部字节解码为文本。

    优先 UTF-8，失败尝试 gb18030（覆盖 GBK/GB2312），最后才用 replacement 回退。
    绝不使用 errors='ignore'：即使最终回退，也保留可见替换符以便发现乱码。
    """
    if data is None:
        return ""
    if isinstance(data, str):
        return data
    raw = bytes(data)
    if not raw:
        return ""
    for codec in ("utf-8", "utf-8-sig", "gb18030"):
        try:
            return raw.decode(codec)
        except (UnicodeDecodeError, LookupError):
            continue
    return raw.decode("utf-8", errors="replace")


def read_text_file(path: Union[str, Path]) -> str:
    """按统一顺序解码读取文本文件（兼容历史上以 GBK 写出的本地文件）。"""
    p = Path(path)
    return decode_bytes(p.read_bytes(), source=str(p))


def write_text_file(path: Union[str, Path], text: str, *, bom: bool = False) -> None:
    """以 UTF-8 写文本文件。

    bom=True 时写出 UTF-8-SIG（带 BOM），用于 PowerShell .ps1 脚本，
    让 Windows PowerShell 5.1 能正确识别 UTF-8。
    """
    p = Path(path)
    p.parent.mkdir(parents=True, exist_ok=True)
    p.write_text(text, encoding="utf-8-sig" if bom else "utf-8", newline="\n")


def json_dumps(obj: Any, *, indent: int = 2) -> str:
    """JSON 序列化：ensure_ascii=False，中文原样保留，仍是标准 UTF-8 JSON。"""
    return json.dumps(obj, ensure_ascii=False, indent=indent)


def json_dump_file(path: Union[str, Path], obj: Any, *, indent: int = 2) -> None:
    """JSON 写盘：UTF-8 + 中文原样。"""
    write_text_file(path, json_dumps(obj, indent=indent))


def json_loads(text: Union[str, bytes]) -> Any:
    """JSON 反序列化：接受 str 或 bytes（bytes 走统一解码）。"""
    return json.loads(decode_bytes(text))


def json_load_file(path: Union[str, Path]) -> Any:
    """JSON 读盘：统一解码后解析。"""
    return json.loads(read_text_file(path))


class CmdResult:
    """subprocess 统一执行结果：原始码 + 已解码文本。"""

    def __init__(self, returncode: int, stdout_text: str, stderr_text: str):
        self.returncode = returncode
        self.stdout_text = stdout_text
        self.stderr_text = stderr_text

    @property
    def ok(self) -> bool:
        return self.returncode == 0


def run_cmd(
    args: Sequence[str],
    *,
    timeout: Optional[float] = None,
    input_text: Optional[str] = None,
    cwd: Optional[Union[str, Path]] = None,
    check: bool = False,
    creationflags: int = 0,
) -> CmdResult:
    """统一 subprocess 执行与输出解码。

    以字节捕获 stdout/stderr，再用 decode_bytes（UTF-8 → gb18030 → replace）解码，
    不依赖系统默认编码，不静默丢弃字节。TimeoutExpired 原样向上抛出。
    """
    result = subprocess.run(
        [str(a) for a in args],
        input=(input_text.encode("utf-8") if input_text is not None else None),
        capture_output=True,
        timeout=timeout,
        cwd=str(cwd) if cwd is not None else None,
        creationflags=creationflags,
        check=check,
    )
    return CmdResult(
        result.returncode,
        decode_bytes(result.stdout),
        decode_bytes(result.stderr),
    )
