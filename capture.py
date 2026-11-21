"""mitmproxy addon: 记录酷狗域名请求 + 响应，不改任何流量。"""
import json
import os
import time

HERE = os.path.dirname(os.path.abspath(__file__))
REQ_OUT = os.path.join(HERE, "captures.jsonl")
RES_OUT = os.path.join(HERE, "responses.jsonl")
HOSTS = ("kugou.com", "kglinker.com", "kgid.cn")


def _hit(host: str) -> bool:
    return any(host.endswith(h) for h in HOSTS)


def request(flow):
    host = flow.request.pretty_host
    if not _hit(host):
        return
    rec = {
        "ts": time.strftime("%Y-%m-%d %H:%M:%S"),
        "method": flow.request.method,
        "url": flow.request.pretty_url,
        "host": host,
        "path": flow.request.path.split("?")[0],
        "headers": dict(flow.request.headers),
        "body": flow.request.get_text(strict=False) or "",
    }
    with open(REQ_OUT, "a", encoding="utf-8") as f:
        f.write(json.dumps(rec, ensure_ascii=False) + "\n")
    print(f"[CAP] {flow.request.method} {flow.request.pretty_url}", flush=True)


def response(flow):
    host = flow.request.pretty_host
    if not _hit(host):
        return
    path = flow.request.path.split("?")[0]
    body = flow.response.get_text(strict=False) or ""
    with open(RES_OUT, "a", encoding="utf-8") as f:
        f.write(json.dumps({
            "ts": time.strftime("%Y-%m-%d %H:%M:%S"),
            "path": path,
            "status": flow.response.status_code,
            "body": body[:8000],
        }, ensure_ascii=False) + "\n")
    if any(k in path for k in ("sign", "vip", "recharge", "task")):
        print(f"[RES] {flow.response.status_code} {path} :: {body[:200]}", flush=True)
