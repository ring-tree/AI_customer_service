# -*- coding: utf-8 -*-
"""A1 统一模型服务（:11434）部署后冒烟测试"""
import json, time, urllib.request, urllib.error

BASE = "http://localhost:11434"
RESULTS = []


def req(method, path, body=None, headers=None, timeout=180):
    url = BASE + path
    data = None
    h = {"Content-Type": "application/json; charset=utf-8"}
    if headers:
        h.update(headers)
    if body is not None:
        data = json.dumps(body, ensure_ascii=False).encode("utf-8")
    r = urllib.request.Request(url, data=data, headers=h, method=method)
    t0 = time.time()
    try:
        with urllib.request.urlopen(r, timeout=timeout) as resp:
            raw = resp.read()
            return resp.status, raw, time.time() - t0, dict(resp.headers)
    except urllib.error.HTTPError as e:
        return e.code, e.read(), time.time() - t0, dict(e.headers)


def record(name, ok, detail):
    RESULTS.append((name, ok, detail))
    print(("[PASS] " if ok else "[FAIL] ") + name + " :: " + detail)


# 1 健康检查
st, raw, dt, _ = req("GET", "/health")
j = json.loads(raw)
record("T1 GET /health", st == 200 and j.get("status") == "ok",
       f"HTTP {st} providers={j.get('providers')} models={j.get('models')} {dt:.2f}s")

# 2 模型列表
st, raw, dt, _ = req("GET", "/v1/models")
j = json.loads(raw)
ids = [m["id"] for m in j.get("data", [])]
record("T2 GET /v1/models", st == 200 and "hy3" in ids, f"HTTP {st} models={ids}")

# 3 404
st, raw, dt, _ = req("GET", "/foo")
record("T3 未知路径 404", st == 404, f"HTTP {st} body={raw.decode('utf-8', 'ignore')[:80]}")

# 4 CORS 预检
st, raw, dt, hd = req("OPTIONS", "/v1/chat/completions")
acao = hd.get("Access-Control-Allow-Origin")
record("T4 OPTIONS CORS", st == 200 and acao == "*", f"HTTP {st} ACAO={acao}")

# 5 缺 model -> 400
st, raw, dt, _ = req("POST", "/v1/chat/completions", {"messages": [{"role": "user", "content": "hi"}]})
record("T5 缺 model 参数", st == 400, f"HTTP {st} body={raw.decode('utf-8', 'ignore')[:100]}")

# 6 非流式真实对话（hy3 为思考型模型，给足 token）
st, raw, dt, _ = req("POST", "/v1/chat/completions", {
    "model": "hy3",
    "messages": [{"role": "user", "content": "你好，请用一句话介绍你自己。"}],
    "stream": False, "max_tokens": 4096})
j = json.loads(raw)
c = (j.get("choices") or [{}])[0]
msg = c.get("message", {})
content = msg.get("content") or ""
reasoning = msg.get("reasoning_content") or ""
record("T6 非流式对话 hy3", st == 200 and len(content) > 0,
       f"HTTP {st} {dt:.1f}s finish={c.get('finish_reason')} content={content[:60]!r} reasoning_len={len(reasoning)} usage={j.get('usage')}")

# 7 流式对话：解析 SSE 帧序
url = BASE + "/v1/chat/completions"
body = json.dumps({"model": "hy3", "messages": [{"role": "user", "content": "你好，请用一句话介绍你自己。"}],
                   "stream": True}, ensure_ascii=False).encode("utf-8")
r = urllib.request.Request(url, data=body, headers={"Content-Type": "application/json; charset=utf-8"}, method="POST")
frames, content_parts, reasoning_parts, finish_count, done = [], [], [], 0, False
t0 = time.time()
with urllib.request.urlopen(r, timeout=300) as resp:
    for line in resp:
        s = line.decode("utf-8", "ignore").strip()
        if not s.startswith("data: "):
            continue
        payload = s[6:]
        if payload == "[DONE]":
            done = True
            break
        try:
            d = json.loads(payload)
        except Exception:
            continue
        ch = (d.get("choices") or [{}])[0]
        delta = ch.get("delta", {})
        if delta.get("content"):
            content_parts.append(delta["content"])
        if delta.get("reasoning_content"):
            reasoning_parts.append(delta["reasoning_content"])
        if ch.get("finish_reason"):
            finish_count += 1
            frames.append(ch["finish_reason"])
dt = time.time() - t0
stream_content = "".join(content_parts)
record("T7 流式对话 SSE", done and len(stream_content) > 0,
       f"{dt:.1f}s content={stream_content[:50]!r} reasoning_len={len(''.join(reasoning_parts))} finish_frames={finish_count}{frames} done={done}")

# 8 未知模型
st, raw, dt, _ = req("POST", "/v1/chat/completions", {"model": "gpt-4o", "messages": [{"role": "user", "content": "hi"}]})
record("T8 未支持模型", st == 404, f"HTTP {st} body={raw.decode('utf-8', 'ignore')[:100]}")

# 9 F1：response_format 结构化输出透传（输出须符合 schema）
st, raw, dt, _ = req("POST", "/v1/chat/completions", {
    "model": "hy3",
    "messages": [{"role": "user", "content": "返回一个对象，ok 为 true"}],
    "max_tokens": 4096,
    "response_format": {"type": "json_schema", "json_schema": {"name": "t", "strict": True,
        "schema": {"type": "object", "properties": {"ok": {"type": "boolean"}},
                   "required": ["ok"], "additionalProperties": False}}},
})
try:
    c9 = json.loads(raw)["choices"][0]["message"]["content"]
    ok9 = isinstance(json.loads(c9), dict) and "ok" in json.loads(c9)
except Exception:
    c9, ok9 = raw.decode("utf-8", "ignore")[:60], False
record("T9 response_format 透传", st == 200 and ok9, f"HTTP {st} {dt:.1f}s content={c9!r} schema解析={ok9}")

# 10 F2：/v1/embeddings 透传（1024 维）
st, raw, dt, _ = req("POST", "/v1/embeddings", {"model": "kinfra-text-embedding-0.6b", "input": "你好"})
try:
    dims = len(json.loads(raw)["data"][0]["embedding"])
except Exception:
    dims = -1
record("T10 embeddings 透传", st == 200 and dims == 1024, f"HTTP {st} {dt:.2f}s dims={dims}")

print("\n==== 汇总 ====")
print(f"通过 {sum(1 for _, ok, _ in RESULTS if ok)}/{len(RESULTS)}")
