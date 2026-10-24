# -*- coding: utf-8 -*-
"""A3 LangGraphRAG 知识服务（:14052）部署后冒烟测试"""
import json, time, urllib.request, urllib.error

BASE = "http://127.0.0.1:14052"
RESULTS = []


def req(method, path, body=None, timeout=300):
    data = json.dumps(body, ensure_ascii=False).encode("utf-8") if body is not None else None
    r = urllib.request.Request(BASE + path, data=data,
                               headers={"Content-Type": "application/json; charset=utf-8"}, method=method)
    t0 = time.time()
    try:
        with urllib.request.urlopen(r, timeout=timeout) as resp:
            return resp.status, json.loads(resp.read().decode("utf-8")), time.time() - t0
    except urllib.error.HTTPError as e:
        try:
            payload = json.loads(e.read().decode("utf-8"))
        except Exception:
            payload = {}
        return e.code, payload, time.time() - t0


def record(name, ok, detail):
    RESULTS.append((name, ok, detail))
    print(("[PASS] " if ok else "[FAIL] ") + name + " :: " + detail, flush=True)


# T1 健康检查
st, j, dt = req("GET", "/health")
record("T1 GET /health", st == 200 and j.get("status") == "ok", f"HTTP {st} {j} {dt:.2f}s")

# T2 服务说明
st, j, dt = req("GET", "/")
record("T2 GET /", st == 200 and j.get("service") == "LangGraphRAG", f"HTTP {st} {j}")

# T3 知识型问题（走 路由→改写→检索→评分→生成→校验）
st, j, dt = req("POST", "/chat", {"question": "企业微信如何获取access_token？"})
steps = [s.get("node") for s in j.get("steps", [])]
srcs = j.get("sources", [])
answer = j.get("answer", "")
record("T3 知识问答(RAG)", st == 200 and answer.strip() != "" and len(srcs) > 0,
       f"HTTP {st} {dt:.1f}s answer={answer[:80]!r} sources={len(srcs)} steps={steps}")
sid = j.get("session_id")
print("    session_id =", sid, flush=True)

# T4 同会话追问（验证多轮历史与改写）
st, j2, dt = req("POST", "/chat", {"question": "那移动端怎么操作？", "session_id": sid})
steps2 = [s.get("node") for s in j2.get("steps", [])]
record("T4 同会话多轮追问", st == 200 and j2.get("session_id") == sid and len(steps2) > 0,
       f"HTTP {st} {dt:.1f}s sid一致={j2.get('session_id') == sid} answer={j2.get('answer','')[:60]!r} steps={steps2}")

# T5 闲聊分支（应走 generate_conv_reply）
st, j3, dt = req("POST", "/chat", {"question": "今天天气怎么样？"})
steps3 = [s.get("node") for s in j3.get("steps", [])]
record("T5 闲聊路由分支", st == 200 and "generate_conv_reply" in steps3,
       f"HTTP {st} {dt:.1f}s steps={steps3} answer={j3.get('answer','')[:60]!r}")

# T6 未知 session_id 不报错（前端持久化了失效 sid 的自愈能力）
st, j4, dt = req("POST", "/chat", {"question": "腾讯云服务器如何重置实例密码？", "session_id": "not-exist-sid-xxx"})
record("T6 失效session_id自愈", st == 200 and j4.get("session_id") == "not-exist-sid-xxx",
       f"HTTP {st} {dt:.1f}s answer={j4.get('answer','')[:60]!r}")

# T7 会话重置
st, j5, dt = req("POST", "/chat/reset?session_id=not-exist-sid-xxx")
record("T7 POST /chat/reset", st == 200 and j5.get("ok") is True, f"HTTP {st} {j5}")

# T8 参数校验：空问题
st, j6, dt = req("POST", "/chat", {"question": ""})
record("T8 空问题校验", st in (400, 422), f"HTTP {st} detail={str(j6)[:100]}")

# T9 F6：纯空白问题应即时 400（不进检索环）
st, j7, dt = req("POST", "/chat", {"question": "   "})
record("T9 纯空白问题拦截", st == 400 and dt < 1.0, f"HTTP {st} {dt:.3f}s detail={str(j7)[:80]}")

print("\n==== 汇总 ====")
print(f"通过 {sum(1 for _, ok, _ in RESULTS if ok)}/{len(RESULTS)}")
