# -*- coding: utf-8 -*-
"""F12 契约测试：前端 STEP_LABELS 键集合 == class3 图节点名集合。

防回归：任一侧改名（5 个图节点名是跨项目契约）都会静默退化为前端显示英文节点名。
路径自适应目录重命名（A6 前后均可）：按候选路径探测实际布局。
运行：cd class3 && ./.venv/Scripts/python.exe ../test-evidence/contract/step_labels_test.py
"""
import re
import sys
from pathlib import Path


def find_first(*candidates: Path) -> Path:
    for c in candidates:
        if c.exists():
            return c
    raise FileNotFoundError(f"均不存在: {candidates}")


ROOT = next(
    p for p in Path(__file__).resolve().parents
    if (p / "class3").is_dir() or (p / "services" / "knowledge-rag").is_dir()
)

tsx = find_first(
    ROOT / "class2" / "web_ui" / "src" / "components" / "ChatMessage.tsx",
    ROOT / "web" / "customer-console" / "src" / "components" / "ChatMessage.tsx",
).read_text(encoding="utf-8")
block = re.search(r"STEP_LABELS[^=]*=\s*\{(.*?)\}", tsx, re.S).group(1)
labels = set(re.findall(r"'(\w+)':", block)) or set(re.findall(r"(\w+)\s*:", block))

class3_dir = find_first(ROOT / "class3", ROOT / "services" / "knowledge-rag")
sys.path.insert(0, str(class3_dir))
from modules.rag_app import get_graph  # noqa: E402

graph, _ = get_graph()
nodes = set(graph.get_graph().nodes.keys()) - {"__start__", "__end__"}

print("前端 STEP_LABELS:", sorted(labels))
print("后端图节点名  :", sorted(nodes))
assert labels == nodes, f"契约不一致：差集 {labels ^ nodes}"
print("CONTRACT-OK")
