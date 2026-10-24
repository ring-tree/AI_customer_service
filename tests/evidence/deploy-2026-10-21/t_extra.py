# -*- coding: utf-8 -*-
"""2026-10-21 补充测试：常见异常场景与已知缺陷复核（A1/A2/A3）"""
import json
import time
import urllib.request
import urllib.error

RESULTS = []


def req(base, method, path, body=None, raw=None, headers=None, timeout=120):
    h = {"Content-Type": "application/json; charset=utf-8"}
    if headers:
        h.update(headers)
    data = raw if raw is not None else (
        json.dumps(body, ensure_ascii=False).encode("utf-8") if body is not None else None
    )
    r = urllib.request.Request(base + path, data=data, headers=h, method=method)
    t0 = time.time()
    try:
        with urllib.request.urlopen(r, timeout=timeout) as resp:
            return resp.status, resp.read(), time.time() - t0
    except urllib.error.HTTPError as e:
        return e.code, e.read(), time.time() - t0


def rec(name, ok, detail):
    RESULTS.append((name, ok, detail))
    print(("[PASS] " if ok else "[FAIL] ") + name + " :: " + detail, flush=True)


def defect(name, reproduced, detail):
    print(("[缺陷复现] " if reproduced else "[未复现] ") + name + " :: " + detail, flush=True)
    RESULTS.append((name, not reproduced, detail))


A1 = "http://localhost:11434"
A2 = "http://localhost:3098"
A3 = "http://127.0.0.1:14052"

print("==== A1 异常与能力边界 ====")

# E1 仅空内容的 messages（前端“只发附件不填文字”会走到这里）
st, raw, dt = req(A1, "POST", "/v1/chat/completions",
                  {"model": "hy3", "messages": [{"role": "user", "content": "   "}], "max_tokens": 64})
detail = raw.decode("utf-8", "replace")[:140]
rec("E1 空消息体应返回 4xx 而非 5xx", 400 <= st < 500, f"HTTP {st} {dt:.1f}s {detail}")

# E2 未实现的能力端点
st, raw, dt = req(A1, "POST", "/v1/embeddings",
                  {"model": "kinfra-text-embedding-0.6b", "input": "测试"})
rec("E2 /v1/embeddings 存在性", st == 200, f"HTTP {st} {raw.decode('utf-8', 'replace')[:80]}")

st, raw, dt = req(A1, "GET", "/v1/models/hy3")
rec("E3 /v1/models/{id} 存在性", st == 200, f"HTTP {st} {raw.decode('utf-8', 'replace')[:80]}")

# E4 非法 JSON 请求体
st, raw, dt = req(A1, "POST", "/v1/chat/completions", raw=b'{"model": "hy3", "messages": [')
rec("E4 非法 JSON 应返回 400", st == 400, f"HTTP {st} {raw.decode('utf-8', 'replace')[:120]}")

# E5 上游鉴权失败的错误码映射（用一个不存在的模型名模拟 not supported 已覆盖；此处跳过真实 401）
print("\n==== A2 静态资源与 SPA 回退 ====")

st, raw, dt = req(A2, "GET", "/", headers={"Accept": "text/html"})
rec("E5 首页 HTML", st == 200 and b"<title>" in raw, f"HTTP {st} {raw[:80]!r}")

st, raw, dt = req(A2, "GET", "/src/main.tsx", headers={"Accept": "*/*"})
rec("E6 前端入口模块可编译", st == 200 and b"createRoot" in raw, f"HTTP {st} len={len(raw)}")

st, raw, dt = req(A2, "GET", "/chat", headers={"Accept": "text/html"})
rec("E7 /chat SPA 回退", st == 200 and b"<div id=\"root\">" in raw, f"HTTP {st} len={len(raw)}")

# E8 RAG 模式下 SearchDialog 实际会打的地址
st, raw, dt = req(A3, "POST", "/v1/chat/completions",
                  {"model": "hy3", "messages": [{"role": "user", "content": "hi"}]})
defect("E8 SearchDialog 在 RAG 模式打 /v1/chat/completions", st == 404,
       f"HTTP {st} {raw.decode('utf-8', 'replace')[:100]}（前端非 RAG 分支会拼出该路径）")

print("\n==== A3 接口健壮性 ====")

st, raw, dt = req(A3, "POST", "/chat", raw=b'{bad json', timeout=30)
rec("E9 A3 非法 JSON 返回 422", st == 422, f"HTTP {st}")

st, raw, dt = req(A3, "POST", "/chat", {"question": ""}, timeout=30)
rec("E10 A3 空字符串校验", st in (400, 422), f"HTTP {st} {raw.decode('utf-8', 'replace')[:100]}")

st, raw, dt = req(A3, "GET", "/chat", timeout=30)
rec("E11 A3 GET /chat 方法不允许", st == 405, f"HTTP {st}")

st, raw, dt = req(A3, "POST", "/chat/reset", timeout=30)
rec("E12 A3 reset 无参数幂等", st == 200 and json.loads(raw).get("ok") is True,
    f"HTTP {st} {raw.decode('utf-8', 'replace')[:80]}")

st, raw, dt = req(A3, "POST", "/chat/reset?session_id=%20", timeout=30)
rec("E13 A3 reset 空白 session 不报错", st == 200, f"HTTP {st}")

print("\n==== 汇总 ====")
print(f"通过 {sum(1 for _, ok, _ in RESULTS if ok)}/{len(RESULTS)}")
