# -*- coding: utf-8 -*-
"""契约测试：用一个 mock 上游验证 A1 是否透传 response_format / tools / tool_choice / stop / seed。
做法：mock 上游记录收到的请求体 → 另起一个 A1 实例（:11435）指向 mock → 比对字段。
不触碰正在运行的 11434 实例与真实 TokenHub。
"""
import json
import os
import subprocess
import sys
import threading
import time
import urllib.request
import urllib.error
from http.server import BaseHTTPRequestHandler, HTTPServer

CAPTURED = {}
MOCK_PORT = 11499
GW_PORT = 11435
ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
GW_DIR = os.path.join(ROOT, "class1", "02api-proxy")


class MockHandler(BaseHTTPRequestHandler):
    def do_POST(self):
        length = int(self.headers.get("Content-Length", 0))
        raw = self.rfile.read(length)
        try:
            CAPTURED["body"] = json.loads(raw)
        except Exception:
            CAPTURED["body"] = {"_raw": raw.decode("utf-8", "replace")}
        payload = json.dumps({
            "id": "chatcmpl-mock", "object": "chat.completion", "created": 0, "model": "hy3",
            "choices": [{"index": 0, "message": {"role": "assistant", "content": "MOCK-OK"},
                         "finish_reason": "stop"}],
            "usage": {"prompt_tokens": 1, "completion_tokens": 1, "total_tokens": 2},
        }).encode()
        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(payload)))
        self.end_headers()
        self.wfile.write(payload)

    def log_message(self, *args):
        pass


def wait_health(url, timeout=25):
    for _ in range(timeout * 2):
        try:
            with urllib.request.urlopen(url, timeout=2) as r:
                if r.status == 200:
                    return True
        except Exception:
            time.sleep(0.5)
    return False


def main():
    srv = HTTPServer(("127.0.0.1", MOCK_PORT), MockHandler)
    threading.Thread(target=srv.serve_forever, daemon=True).start()

    env = dict(os.environ)
    env.update({
        "PORT": str(GW_PORT),
        "HUNYUAN_API_KEY": "sk-mock-key",
        "HUNYUAN_API_URL": f"http://127.0.0.1:{MOCK_PORT}/v1",
    })
    proc = subprocess.Popen(["node", "src/index.js"], cwd=GW_DIR, env=env,
                            stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True)
    try:
        if not wait_health(f"http://127.0.0.1:{GW_PORT}/health"):
            print("[FAIL] mock 网关未启动")
            return 1

        payload = {
            "model": "hy3",
            "messages": [{"role": "user", "content": "只输出 JSON"}],
            "stream": False,
            "max_tokens": 256,
            "temperature": 0.2,
            "top_p": 0.9,
            "stop": ["END"],
            "seed": 42,
            "response_format": {
                "type": "json_schema",
                "json_schema": {"name": "route", "schema": {"type": "object",
                                "properties": {"datasource": {"type": "string"}},
                                "required": ["datasource"]}},
            },
            "tools": [{"type": "function", "function": {"name": "lookup", "parameters": {"type": "object"}}}],
            "tool_choice": "auto",
        }
        req = urllib.request.Request(
            f"http://127.0.0.1:{GW_PORT}/v1/chat/completions",
            data=json.dumps(payload, ensure_ascii=False).encode("utf-8"),
            headers={"Content-Type": "application/json; charset=utf-8"}, method="POST")
        with urllib.request.urlopen(req, timeout=30) as r:
            print(f"网关响应 HTTP {r.status}")

        body = CAPTURED.get("body", {})
        expected = ["model", "messages", "max_tokens", "temperature", "top_p", "stream", "stream_options"]
        extra = ["stop", "seed", "response_format", "tools", "tool_choice"]
        print("\n上游实际收到字段:", sorted(body.keys()))
        missing_expected = [k for k in expected if k not in body]
        print("基础字段:", "全部透传" if not missing_expected else f"缺失 {missing_expected}")
        for k in extra:
            print(f"  {k}: {'已透传' if k in body else '被丢弃'}")
        passed = not missing_expected
        print("\n结论:", "基础参数透传正常" if passed else "基础参数存在丢失")
        print("高级参数透传数: %d/%d" % (sum(1 for k in extra if k in body), len(extra)))
        return 0 if passed else 1
    finally:
        proc.terminate()
        try:
            proc.wait(timeout=5)
        except Exception:
            proc.kill()
        srv.shutdown()


if __name__ == "__main__":
    sys.exit(main())
