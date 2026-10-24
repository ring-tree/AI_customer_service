# -*- coding: utf-8 -*-
"""V2: class1 (02api-proxy :11434) 全量接口与边界验证"""
import json
import time
import urllib.error
import urllib.request

BASE = "http://localhost:11434"
PASS, FAIL = [], []


def record(name, ok, detail=""):
    (PASS if ok else FAIL).append(name)
    print(("[PASS] " if ok else "[FAIL] ") + name, "|", str(detail)[:220])


def req(method, path, body=None, raw=None, timeout=180):
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
s, h, c, _ = req("GET", "/")
record("1. GET / 探活文本", s == 200 and "Multi-provider LLM proxy" in c, f"{s}")

s, h, c, _ = req("GET", "/health")
d = json.loads(c)
record("2. GET /health（providers/models）",
       s == 200 and d.get("status") == "ok" and d.get("providers") == ["hunyuan"]
       and set(d.get("models", [])) == {"hy3", "hy3-preview", "hunyuan-role-latest"},
       f"providers={d.get('providers')} models={d.get('models')}")

s, h, c, _ = req("GET", "/v1/models")
d = json.loads(c)
ids = [m["id"] for m in d.get("data", [])]
record("3. GET /v1/models（OpenAI list 结构）",
       s == 200 and d.get("object") == "list" and all(m["object"] == "model" for m in d["data"]),
       f"ids={ids}")
record("4. 模型列表按 Key 过滤（无 zhipu/kimi/deepseek）",
       "glm-4-flash" not in ids and "kimi-k2" not in ids and "deepseek-chat" not in ids, f"ids={ids}")

s, h, c, _ = req("OPTIONS", "/v1/chat/completions")
cors_ok = (h.get("Access-Control-Allow-Origin") == "*"
           and "POST" in (h.get("Access-Control-Allow-Methods") or "")
           and "Content-Type" in (h.get("Access-Control-Allow-Headers") or ""))
record("5. OPTIONS CORS 预检", s == 200 and cors_ok,
       {k: v for k, v in h.items() if "Access" in k})

# ---- 边界与异常 ----
s, h, c, _ = req("GET", "/foo")
d = json.loads(c)
record("6. 未知路由 → 404 统一错误结构",
       s == 404 and d["error"]["type"] == "invalid_request_error", f"{s} {c[:120]}")

s, h, c, _ = req("POST", "/v1/chat/completions", raw=b"{not-json!", timeout=30)
d = json.loads(c)
record("7. 非法 JSON → 500 封装（服务不崩）",
       s == 500 and "error" in d, f"{s} {c[:120]}")

s, h, c, _ = req("POST", "/v1/chat/completions", body={"messages": [{"role": "user", "content": "hi"}]})
d = json.loads(c)
record("8. 缺 model → 400 invalid_request_error",
       s == 400 and d["error"]["type"] == "invalid_request_error" and "model" in d["error"]["message"], f"{s}")

s, h, c, _ = req("POST", "/v1/chat/completions", body={"model": "hy3"})
d = json.loads(c)
record("9. 缺 messages → 400", s == 400 and "messages" in d["error"]["message"], f"{s}")

s, h, c, _ = req("POST", "/v1/chat/completions", body={"model": "gpt-4o", "messages": [{"role": "user", "content": "hi"}]})
d = json.loads(c)
record("10. 未知模型 → 404 not supported", s == 404 and "not supported" in d["error"]["message"], f"{s}")

s, h, c, _ = req("POST", "/v1/chat/completions", body={"model": "glm-4-flash", "messages": [{"role": "user", "content": "hi"}]})
d = json.loads(c)
record("11. 未配密钥厂商 → 404 not available", s == 404 and "not available" in d["error"]["message"], f"{s}")

s, h, c, _ = req("POST", "/v1/chat/completions",
                 body={"model": "hy3", "messages": [{"role": "user", "content": "   "}]}, timeout=90)
d = json.loads(c)
record("12. 空白消息清洗 + 上游 400 封装为 500（服务不崩）",
       s == 500 and "hunyuan HTTP 400" in d["error"]["message"], f"{s}")

s, h, c, _ = req("GET", "/v1/chat/completions")
record("13. 对话端点方法约束（GET → 404/405）", s in (404, 405), f"{s}")

# ---- 真实模型调用 ----
s, h, c, dt = req("POST", "/v1/chat/completions",
                  body={"model": "hy3", "messages": [{"role": "user", "content": "say ok"}], "max_tokens": 32})
d = json.loads(c)
ch = (d.get("choices") or [{}])[0]
record("14. 非流式 hy3（结构+内容）",
       s == 200 and d.get("object") == "chat.completion" and ch.get("message", {}).get("role") == "assistant"
       and ch.get("finish_reason") in ("stop", "length") and "usage" in d,
       f"{s} {dt:.1f}s usage={d.get('usage')}")

s, h, c, dt = req("POST", "/v1/chat/completions",
                  body={"model": "hy3", "messages": [{"role": "user", "content": "说四个字：连接正常"}],
                        "stream": True, "max_tokens": 96})
frames = [l[5:].strip() for l in c.split("\n") if l.strip().startswith("data:")]
role_first, stop_seen, usage_seen, parsed = False, False, False, 0
for i, fr in enumerate(frames):
    if fr == "[DONE]":
        continue
    try:
        obj = json.loads(fr)
    except Exception:
        continue
    parsed += 1
    delta = (obj.get("choices") or [{}])[0].get("delta", {})
    if i == 0 and delta.get("role") == "assistant":
        role_first = True
    if (obj.get("choices") or [{}])[0].get("finish_reason") == "stop":
        stop_seen = True
    if obj.get("usage"):
        usage_seen = True
record("15. 流式 hy3 SSE（首帧role/结束帧/usage/[DONE]/utf8）",
       s == 200 and h.get("Content-Type", "").startswith("text/event-stream")
       and frames and frames[-1] == "[DONE]" and role_first and stop_seen and usage_seen,
       f"{s} frames={len(frames)} parsed={parsed} role={role_first} stop={stop_seen} usage={usage_seen}")

print()
print(f"==== class1 汇总: PASS {len(PASS)} / FAIL {len(FAIL)} ====")
if FAIL:
    print("FAILED:", FAIL)
