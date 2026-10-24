# -*- coding: utf-8 -*-
"""V3: services/knowledge-rag (LangGraphRAG :14052) 全量接口与边界验证"""
import json
import time
import urllib.error
import urllib.request
import uuid

BASE = "http://127.0.0.1:14052"
PASS, FAIL = [], []
VALID_NODES = {"transform_query", "retrieve", "grade_documents", "generate", "generate_conv_reply"}


def record(name, ok, detail=""):
    (PASS if ok else FAIL).append(name)
    print(("[PASS] " if ok else "[FAIL] ") + name, "|", str(detail)[:260])


def req(method, path, body=None, raw=None, timeout=300):
    h = {"Content-Type": "application/json"}
    data = raw if raw is not None else (json.dumps(body).encode() if body is not None else None)
    if isinstance(data, str):
        data = data.encode()
    r = urllib.request.Request(BASE + path, data=data, method=method, headers=h)
    t0 = time.time()
    try:
        with urllib.request.urlopen(r, timeout=timeout) as resp:
            return resp.status, dict(resp.headers), resp.read().decode("utf-8", "ignore"), time.time() - t0
    except urllib.error.HTTPError as e:
        return e.code, dict(e.headers), e.read().decode("utf-8", "ignore"), time.time() - t0
    except Exception as e:
        return -1, {}, f"CONN-ERR {e}", time.time() - t0


# ---- 正常流程 ----
s, _, c, _ = req("GET", "/health", timeout=15)
record("1. GET /health", s == 200 and json.loads(c).get("status") == "ok", f"{s}")

s, _, c, _ = req("GET", "/", timeout=15)
d = json.loads(c)
record("2. GET / 服务说明", s == 200 and d.get("service") == "LangGraphRAG" and d.get("chat") == "POST /chat", f"{s}")

s, _, c, dt = req("POST", "/chat", {"question": "对象存储如何创建存储桶？"})
d = json.loads(c)
nodes = [x.get("node") for x in d.get("steps", [])]
src_ok = len(d.get("sources", [])) > 0 and all(("source" in x and "preview" in x) for x in d.get("sources", []))
record("3. 单轮知识问答（会话/答案/来源/步骤结构）",
       s == 200 and isinstance(d.get("session_id"), str) and len(d.get("answer", "")) > 30
       and src_ok and len(nodes) > 0 and set(nodes) <= VALID_NODES,
       f"{s} {dt:.0f}s nodes={nodes} sources={len(d.get('sources', []))} ans={(d.get('answer') or '')[:60]}")
sid = d.get("session_id")

s, _, c, dt = req("POST", "/chat", {"question": "那移动端怎么操作？", "session_id": sid})
d2 = json.loads(c)
record("4. 多轮追问（session 复用 + 上下文改写）",
       s == 200 and d2.get("session_id") == sid and len(d2.get("answer", "")) > 10,
       f"{s} {dt:.0f}s session一致={d2.get('session_id') == sid} ans={(d2.get('answer') or '')[:80]}")

s, _, c, _ = req("POST", f"/chat/reset?session_id={sid}", timeout=15)
record("5. reset 有效会话", s == 200 and json.loads(c).get("ok") is True, f"{s}")

s, _, c, dt = req("POST", "/chat", {"question": "今天天气怎么样？"})
d = json.loads(c)
record("6. 闲聊路由（casual_convo，无引用来源）",
       s == 200 and [x.get("node") for x in d.get("steps", [])] == ["generate_conv_reply"]
       and len(d.get("sources", [])) == 0,
       f"{s} {dt:.0f}s steps={[x.get('node') for x in d.get('steps', [])]}")

# ---- 边界 ----
unknown = str(uuid.uuid4())
s, _, c, dt = req("POST", "/chat", {"question": "你好呀", "session_id": unknown})
d = json.loads(c)
record("7. 未知 session_id（以新历史开始并回传原 id）",
       s == 200 and d.get("session_id") == unknown and len(d.get("answer", "")) > 0,
       f"{s} {dt:.0f}s 回传={d.get('session_id') == unknown}")

s, _, c, _ = req("POST", "/chat/reset?session_id=not-exist-sid", timeout=15)
record("8. reset 无效会话（幂等）", s == 200 and json.loads(c).get("ok") is True, f"{s}")

s, _, c, _ = req("POST", "/chat", {"question": ""}, timeout=30)
record("9. 空问题 → 422 校验", s == 422 and "detail" in json.loads(c), f"{s}")

s, _, c, dt = req("POST", "/chat", {"question": "   "})
try:
    d = json.loads(c)
except Exception:
    d = {}
record("10. 纯空白问题（边界：进程不崩溃且给出响应）",
       s in (200, 400, 422, 500) and s != -1,
       f"{s} {dt:.0f}s steps={[x.get('node') for x in (d.get('steps') or [])]} ans={(d.get('answer') or '')[:80]}")

s, _, c, _ = req("POST", "/chat", raw=b"{bad-json!", timeout=30)
record("11. 非法 JSON → 422", s == 422, f"{s}")

s, _, c, _ = req("GET", "/chat", timeout=15)
record("12. GET /chat → 405 方法约束", s == 405, f"{s}")

print()
print(f"==== services/knowledge-rag 汇总: PASS {len(PASS)} / FAIL {len(FAIL)} ====")
if FAIL:
    print("FAILED:", FAIL)
