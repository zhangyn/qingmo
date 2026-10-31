# -*- coding: utf-8 -*-
"""MD 编辑器本地启动器。

启动一个仅监听本机的静态服务器来托管编辑器（浏览器安全策略不允许
直接以 file:// 方式加载编辑器内核），然后以"应用窗口"模式打开浏览器。
空闲 2 小时后自动退出。
"""
import os
import socket
import subprocess
import sys
import threading
import time
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
IDLE_EXIT_SECONDS = 2 * 60 * 60
last_request = time.time()


class Handler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=BASE_DIR, **kwargs)

    def do_GET(self):
        global last_request
        last_request = time.time()
        super().do_GET()

    def log_message(self, fmt, *args):
        pass  # 不打印访问日志


def find_free_port():
    for port in range(8931, 8941):
        with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
            try:
                s.bind(("127.0.0.1", port))
                return port
            except OSError:
                continue
    return 0


def open_in_browser(url):
    """优先用 Edge/Chrome 的 --app 模式打开（无地址栏，像桌面软件）。"""
    for exe in ("msedge", "chrome"):
        try:
            subprocess.Popen(
                [exe, "--app=" + url],
                stdout=subprocess.DEVNULL,
                stderr=subprocess.DEVNULL,
            )
            return
        except OSError:
            continue
    import webbrowser

    webbrowser.open(url)


def main():
    port = find_free_port()
    if not port:
        print("没有可用端口")
        sys.exit(1)
    url = "http://127.0.0.1:%d/editor.html" % port

    httpd = ThreadingHTTPServer(("127.0.0.1", port), Handler)
    threading.Thread(target=httpd.serve_forever, daemon=True).start()
    threading.Timer(0.8, open_in_browser, (url,)).start()

    global last_request
    while True:
        time.sleep(30)
        if time.time() - last_request > IDLE_EXIT_SECONDS:
            break
    httpd.shutdown()


if __name__ == "__main__":
    main()
