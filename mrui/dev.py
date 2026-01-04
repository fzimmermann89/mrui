from __future__ import annotations

import argparse
import os
from pathlib import Path
import signal
import subprocess
import time

def _terminate(proc: subprocess.Popen[bytes]) -> None:
    if proc.poll() is not None:
        return
    proc.terminate()
    try:
        proc.wait(timeout=8)
    except subprocess.TimeoutExpired:
        proc.kill()
        proc.wait(timeout=3)


def _spawn(name: str, command: list[str], cwd: Path) -> subprocess.Popen[bytes]:
    process = subprocess.Popen(command, cwd=cwd)
    print(f"[{name}] started pid={process.pid}: {' '.join(command)}")
    return process


def _build_frontend_command() -> list[str]:
    return ["npm", "run", "dev", "--", "--host", "0.0.0.0"]


def _build_api_command() -> list[str]:
    worker_count = os.getenv("MRUI_API_WORKERS", "1")
    return [
        "uv",
        "run",
        "uvicorn",
        "mrui.main:app",
        "--host",
        os.getenv("MRUI_HOST", "0.0.0.0"),
        "--port",
        os.getenv("MRUI_PORT", "8000"),
        "--workers",
        worker_count,
    ]


def _build_worker_command() -> list[str]:
    return [
        "uv",
        "run",
        "python",
        "-c",
        "import mrui.jobs; from huey.consumer import Consumer; from mrui.queue import huey; Consumer(huey).run()",
    ]


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Run mrui stack")
    parser.add_argument(
        "mode",
        nargs="?",
        default="dev",
        choices=["dev", "prod"],
        help="dev = api+worker+frontend, prod = api+worker",
    )
    args = parser.parse_args(argv)

    repo_root = Path(__file__).resolve().parents[1]
    backend_dir = repo_root
    frontend_dir = repo_root / "frontend"

    processes: dict[str, subprocess.Popen[bytes]] = {}
    processes["api"] = _spawn("api", _build_api_command(), backend_dir)
    processes["worker"] = _spawn("worker", _build_worker_command(), backend_dir)
    if args.mode == "dev":
        processes["frontend"] = _spawn("frontend", _build_frontend_command(), frontend_dir)

    stopping = False

    def _stop_all() -> None:
        nonlocal stopping
        if stopping:
            return
        stopping = True
        for proc in reversed(list(processes.values())):
            _terminate(proc)

    def _handle_signal(_signum: int, _frame: object) -> None:
        _stop_all()
        raise SystemExit(0)

    signal.signal(signal.SIGINT, _handle_signal)
    signal.signal(signal.SIGTERM, _handle_signal)

    exit_code = 0
    try:
        while True:
            for name, proc in processes.items():
                code = proc.poll()
                if code is None:
                    continue
                print(f"[{name}] exited with code {code}")
                if code != 0 and exit_code == 0:
                    exit_code = code
                _stop_all()
                return exit_code
            time.sleep(0.5)
    finally:
        _stop_all()
    return exit_code


def run_dev() -> int:
    os.environ.setdefault("MRUI_API_WORKERS", "1")
    return main(["dev"])


def run_prod() -> int:
    os.environ.setdefault("MRUI_API_WORKERS", "2")
    return main(["prod"])


if __name__ == "__main__":
    raise SystemExit(main())
