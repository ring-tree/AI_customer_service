# -*- coding: utf-8 -*-
"""已知问题复核：纯空白问题是否仍触发多轮检索循环"""
import json, time, urllib.request, urllib.error
BODY = json.dumps({"question": "   "}, ensure_ascii=False).encode()
r = urllib.request.Request("http://127.0.0.1:14052/chat", data=BODY,
                           headers={"Content-Type": "application/json"}, method="POST")
t0 = time.time()
try:
    with urllib.request.urlopen(r, timeout=420) as resp:
        d = json.loads(resp.read().decode())
    print(f"HTTP 200 耗时 {time.time()-t0:.1f}s")
    print("steps =", [s.get("node") for s in d.get("steps", [])])
    print("answer =", repr(d.get("answer", "")[:120]))
    print("sources =", len(d.get("sources", [])))
except urllib.error.HTTPError as e:
    print(f"HTTP {e.code} 耗时 {time.time()-t0:.1f}s", e.read().decode()[:200])
