# -*- coding: utf-8 -*-
"""校验工作日志中的任务块是否符合 worklog 规范。

用法：
    python check_log.py                     # 校验默认日志
    python check_log.py -f 路径.md           # 校验指定文件
    python check_log.py --date 2026-10-20    # 只校验某一天

校验项：
    1. 任务块标题格式：#### T-YYYYMMDD-NN ｜ 标题
    2. 任务编号唯一
    3. 四项必填字段齐全：任务时间 / 任务输入 / 执行过程 / 任务产出
    4. 任务时间格式：YYYY-MM-DD HH:MM → HH:MM
    5. 任务块所在日期分区与编号日期一致

退出码：0 全部通过；1 存在错误；2 未找到任务块。
"""
from __future__ import annotations

import argparse
import re
import sys
from pathlib import Path

DEFAULT_LOG = Path(__file__).resolve().parents[4] / "docs" / "worklog.md"

RE_BLOCK = re.compile(r"^####\s+(T-\d{8}-\d{2})\s*[｜|]\s*(.+?)\s*$")
RE_SECTION = re.compile(r"^##\s+(\d{4}-\d{2}-\d{2})")
RE_TIME = re.compile(
    r"(\d{4}-\d{2}-\d{2})\s+(\d{2}:\d{2})\s*(?:→|->|~|—)\s*(\d{2}:\d{2})"
)
REQUIRED = ["任务时间", "任务输入", "执行过程", "任务产出"]


def parse(path: Path):
    """返回 [(编号, 标题, 行号, 所在日期分区, 块文本)]"""
    lines = path.read_text(encoding="utf-8").splitlines()
    blocks = []
    cur_section = ""
    cur_id = cur_title = None
    cur_line = 0
    buf: list[str] = []

    def flush():
        if cur_id:
            blocks.append((cur_id, cur_title, cur_line, cur_section, "\n".join(buf)))

    for idx, line in enumerate(lines, 1):
        m_sec = RE_SECTION.match(line)
        if m_sec:
            flush()
            cur_id, cur_title, buf = None, None, []
            cur_section = m_sec.group(1)
            continue
        m_block = RE_BLOCK.match(line)
        if m_block:
            flush()
            cur_id, cur_title, cur_line = m_block.group(1), m_block.group(2), idx
            buf = [line]
            continue
        if cur_id is not None:
            buf.append(line)
    flush()
    return blocks


def check_block(block_id: str, title: str, body: str, section: str):
    errors: list[str] = []
    warnings: list[str] = []

    # 编号日期与所在分区
    id_date = block_id[2:10]
    id_date_fmt = f"{id_date[:4]}-{id_date[4:6]}-{id_date[6:8]}"
    if section and id_date_fmt != section:
        errors.append(f"编号日期 {id_date_fmt} 与所在分区 {section} 不一致")

    # 四项必填
    missing = [k for k in REQUIRED if f"**{k}**" not in body]
    if missing:
        errors.append("缺少字段：" + "、".join(missing))

    # 时间格式
    m_time = RE_TIME.search(body)
    if "**任务时间**" in body and not m_time:
        errors.append("任务时间格式不合规（需 YYYY-MM-DD HH:MM → HH:MM）")
    elif m_time and m_time.group(1) != id_date_fmt:
        errors.append(f"任务时间日期 {m_time.group(1)} 与编号日期 {id_date_fmt} 不一致")

    # 标题长度
    if len(title) > 30:
        warnings.append(f"标题偏长（{len(title)} 字），建议 ≤20 字")

    # 产出/输入是否为空
    for key in ("任务输入", "任务产出"):
        m = re.search(rf"\*\*{key}\*\*\s*[：:]\s*(.*)", body)
        if m and m.group(1).strip() in ("", "无", "-"):
            warnings.append(f"{key} 内容为空")

    return errors, warnings


def main() -> int:
    ap = argparse.ArgumentParser(description="校验工作日志任务块")
    ap.add_argument("-f", "--file", default=str(DEFAULT_LOG), help="日志文件路径")
    ap.add_argument("--date", default=None, help="只校验指定日期分区 YYYY-MM-DD")
    args = ap.parse_args()

    path = Path(args.file)
    if not path.exists():
        print(f"[ERR] 日志文件不存在：{path}")
        return 1

    blocks = parse(path)
    if args.date:
        blocks = [b for b in blocks if b[3] == args.date]

    if not blocks:
        print("[ERR] 未找到任务块（#### T-YYYYMMDD-NN …）")
        return 2

    total_err = 0
    seen: dict[str, int] = {}
    print(f"校验文件：{path}")
    print(f"任务块数量：{len(blocks)}\n")

    for block_id, title, line_no, section, body in blocks:
        errors, warnings = check_block(block_id, title, body, section)
        if block_id in seen:
            errors.append(f"任务编号重复（首次出现于第 {seen[block_id]} 行）")
        else:
            seen[block_id] = line_no

        if errors:
            total_err += len(errors)
            print(f"[FAIL] {block_id} ｜ {title}（第 {line_no} 行）")
            for e in errors:
                print(f"       - {e}")
        else:
            print(f"[ OK ] {block_id} ｜ {title}（第 {line_no} 行）")
        for w in warnings:
            print(f"       ! {w}")

    print()
    if total_err:
        print(f"结果：{len(blocks)} 个任务块，{total_err} 项错误")
        return 1
    print(f"结果：{len(blocks)} 个任务块全部通过")
    return 0


if __name__ == "__main__":
    sys.exit(main())
