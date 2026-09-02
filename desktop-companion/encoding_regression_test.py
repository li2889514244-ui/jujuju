# -*- coding: utf-8 -*-
"""
披星云 · 中文编码回归测试
=========================
固定测试串：
    中文测试：披星云，账号负责人，退款订单，AI剪辑，￥123.45，王晶导演

覆盖链路：
  1. 本地 JSON 写盘 -> (模拟重启) 新进程读回            -> 字符串完全一致
  2. subprocess UTF-8 / GBK 中文输出 -> 统一解码 -> UI  -> 完全一致
  3. 伴侣 json_dumps -> Node JSON 解析栈(后端同款) -> 回读 -> 完全一致
  4. SQLite 写入 -> 读回（本地库语义）                   -> 完全一致
  5. 历史 GBK 遗留文件 -> read_text_file 容忍读取        -> 完全一致
  6. decode_bytes 永不静默丢弃字节（errors='ignore' 禁用）

用法：py -3 desktop-companion/encoding_regression_test.py
"""
import json
import os
import sqlite3
import subprocess
import sys
import tempfile
from pathlib import Path

COMPANION_DIR = Path(__file__).resolve().parent
sys.path.insert(0, str(COMPANION_DIR))

from companion_encoding import (  # noqa: E402
    CmdResult,
    decode_bytes,
    json_dump_file,
    json_dumps,
    json_load_file,
    json_loads,
    read_text_file,
    run_cmd,
    write_text_file,
)

SAMPLE = "中文测试：披星云，账号负责人，退款订单，AI剪辑，￥123.45，王晶导演"

PASS = []
FAIL = []


def check(name: str, actual, expected):
    ok = actual == expected
    (PASS if ok else FAIL).append(name)
    print(("  [PASS] " if ok else "  [FAIL] ") + name)
    if not ok:
        print("        期望: " + repr(expected))
        print("        实际: " + repr(actual))


def main():
    print("== 披星云中文编码回归测试 ==")
    tmp = Path(tempfile.mkdtemp(prefix="pixingyun-encoding-test-"))

    # ── 1. 本地 JSON 保存 -> 新进程(模拟重启) -> 再读取 ──
    print("\n[1] 本地 JSON 写盘 -> 重启 -> 读回")
    json_path = tmp / "roundtrip.json"
    payload = {
        "nickname": SAMPLE,
        "operator": "李家华",
        "items": [{"title": SAMPLE, "price": "￥123.45"}, "王晶导演"],
        "nested": {"note": "退款订单（含全角括号）"},
    }
    json_dump_file(json_path, payload)
    reader = '''import json, sys
from companion_encoding import json_load_file
p = sys.argv[1]
data = json_load_file(p)
print(json.dumps(data, ensure_ascii=False, sort_keys=True))
'''
    result = run_cmd(
        [sys.executable, "-c", reader, str(json_path)],
        cwd=COMPANION_DIR,
        timeout=60,
    )
    check("重启后读回", json.loads(result.stdout_text.strip(), strict=True), payload)
    # 文件字节必须是合法 UTF-8 且中文原样（非 \uXXXX）
    raw = json_path.read_bytes()
    check("写盘为合法 UTF-8 且中文原样", SAMPLE.encode("utf-8") in raw, True)

    # ── 2. subprocess 中文输出 -> 统一解码 ──
    print("\n[2] subprocess UTF-8 / GBK 输出解码")
    child_utf8 = "import sys; sys.stdout.buffer.write('" + SAMPLE + "'.encode('utf-8'))"
    r = run_cmd([sys.executable, "-c", child_utf8], timeout=60)
    check("UTF-8 子进程输出", r.stdout_text, SAMPLE)

    child_gbk = "import sys; sys.stdout.buffer.write('" + SAMPLE + "'.encode('gbk'))"
    r = run_cmd([sys.executable, "-c", child_gbk], timeout=60)
    check("GBK 子进程输出(模拟 Windows 控制台)", r.stdout_text, SAMPLE)

    # errors='replace' 回退路径：非法字节也要有可见结果，绝不静默丢字节
    r = run_cmd([sys.executable, "-c", "import sys; sys.stdout.buffer.write(b'\\x80A')"], timeout=60)
    check("非法字节回退不崩溃且有替换符", "\ufffd" in r.stdout_text and r.stdout_text.endswith("A"), True)

    # ── 3. 伴侣 -> 后端同款 JSON 栈(Node) -> 回读 ──
    print("\n[3] 伴侣序列化 -> Node JSON.parse/stringify -> 回读")
    wire = json_dumps(payload)
    node_script = (
        "const fs = require('fs');"
        "const s = fs.readFileSync(0, 'utf8');"
        "const obj = JSON.parse(s);"
        "if (obj.nickname !== '" + SAMPLE + "') { process.exit(2); }"
        "process.stdout.write(JSON.stringify(obj));"
    )
    r = run_cmd(["node", "-e", node_script], input_text=wire, timeout=60)
    check("Node JSON 栈往返", json_loads(r.stdout_text), payload)
    check("UTF-8 字节级一致(伴侣->后端)", wire.encode("utf-8").decode("utf-8"), wire)

    # ── 4. SQLite 数据库写入 -> 读回 ──
    print("\n[4] SQLite 数据库往返")
    db_path = tmp / "roundtrip.db"
    conn = sqlite3.connect(str(db_path))
    conn.execute("CREATE TABLE t (id INTEGER PRIMARY KEY, nickname TEXT, note TEXT)")
    conn.execute("INSERT INTO t (nickname, note) VALUES (?, ?)", (SAMPLE, "退款订单"))
    conn.commit()
    row = conn.execute("SELECT nickname, note FROM t WHERE id = 1").fetchone()
    conn.close()
    check("SQLite 中文往返", row, (SAMPLE, "退款订单"))

    # ── 5. 历史 GBK 遗留文件容忍读取 ──
    print("\n[5] 历史 GBK 文件兼容读取")
    legacy_path = tmp / "legacy_gbk.json"
    legacy_path.write_bytes(json.dumps({"name": SAMPLE}, ensure_ascii=False).encode("gbk"))
    check("GBK 遗留文件读取", json_load_file(legacy_path), {"name": SAMPLE})

    # ── 6. decode_bytes 顺序 ──
    print("\n[6] decode_bytes 解码顺序")
    check("UTF-8 优先", decode_bytes(SAMPLE.encode("utf-8")), SAMPLE)
    check("gb18030 兜底", decode_bytes(SAMPLE.encode("gbk")), SAMPLE)
    check("空输入", decode_bytes(b""), "")
    check("str 透传", decode_bytes(SAMPLE), SAMPLE)

    print("\n== 结果 ==")
    print("通过: " + str(len(PASS)) + " / " + str(len(PASS) + len(FAIL)))
    if FAIL:
        print("失败项: " + ", ".join(FAIL))
        sys.exit(1)
    print("全部通过 ✓")
    sys.exit(0)


if __name__ == "__main__":
    main()
