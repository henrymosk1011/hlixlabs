#!/usr/bin/env python3
"""
Local preview of the site with the same addresses as hlixlabs.com: /catalog serves
catalog.html and /catalog.html redirects to /catalog (Vercel's "cleanUrls" in vercel.json),
and /v2/ redirects to /v2, which serves v2/index.html ("trailingSlash": false).
No dependencies. The API functions (chat, checkout, accounts) don't run this way; use
`vercel dev` for those.

    python3 scripts/serve.py          # http://localhost:8743
    python3 scripts/serve.py 8000
"""
import http.server
import os
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent


class Handler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(ROOT), **kwargs)

    def do_GET(self):
        path, _, query = self.path.partition("?")
        if path.endswith(".html"):
            clean = path[: -len(".html")]
            if clean.endswith("/index"):
                clean = clean[: -len("index")]
            self.send_response(308)
            self.send_header("Location", clean + ("?" + query if query else ""))
            self.end_headers()
            return
        # "trailingSlash": false: /v2/ redirects to /v2, which serves v2/index.html
        if path != "/" and path.endswith("/"):
            self.send_response(308)
            self.send_header("Location", path.rstrip("/") + ("?" + query if query else ""))
            self.end_headers()
            return
        if path != "/" and not os.path.splitext(path)[1]:
            if (ROOT / (path.lstrip("/") + ".html")).is_file():
                self.path = path + ".html" + ("?" + query if query else "")
            elif (ROOT / path.lstrip("/") / "index.html").is_file():
                self.path = path + "/index.html" + ("?" + query if query else "")
        return super().do_GET()


if __name__ == "__main__":
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8743
    print(f"hlix on http://localhost:{port}")
    http.server.ThreadingHTTPServer(("", port), Handler).serve_forever()
