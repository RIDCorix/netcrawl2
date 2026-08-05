import json
import threading
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

from netcrawl.daemon.spawner import kill_worker, spawn_worker


def test_worker_output_is_drained_while_on_loop_keeps_running(tmp_path, capfd):
    action_count = 0
    count_lock = threading.Lock()

    class Handler(BaseHTTPRequestHandler):
        def do_POST(self):
            nonlocal action_count
            length = int(self.headers.get("Content-Length", "0"))
            self.rfile.read(length)
            with count_lock:
                action_count += 1
            body = json.dumps({"ok": True}).encode()
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)

        def log_message(self, *_args):
            pass

    server = ThreadingHTTPServer(("127.0.0.1", 0), Handler)
    server_thread = threading.Thread(target=server.serve_forever, daemon=True)
    server_thread.start()

    worker_file = tmp_path / "chatty.py"
    worker_file.write_text(
        "from netcrawl import WorkerClass\n"
        "class Chatty(WorkerClass):\n"
        "    class_name = 'Chatty'\n"
        "    class_id = 'chatty'\n"
        "    def on_loop(self):\n"
        "        self.info('x' * 1024)\n",
        encoding="utf-8",
    )

    worker_id = "worker_output_drain"
    try:
        spawn_worker(
            worker_id=worker_id,
            script_path=str(worker_file),
            class_name="Chatty",
            api_url=f"http://127.0.0.1:{server.server_port}",
            injected_fields={},
        )
        deadline = time.time() + 10
        while time.time() < deadline:
            with count_lock:
                if action_count >= 128:
                    break
            time.sleep(0.02)

        with count_lock:
            assert action_count >= 128, "worker stalled after its unconsumed stdout pipe filled"
    finally:
        kill_worker(worker_id)
        server.shutdown()
        server.server_close()
        capfd.readouterr()
