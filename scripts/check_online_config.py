"""Validate the local online-development configuration without exposing secrets."""

from __future__ import annotations

import argparse
import json
import subprocess
from pathlib import Path

from dotenv import dotenv_values

from app.config import ConfigurationError, Settings


ROOT = Path(__file__).resolve().parents[1]


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--env-file", default=str(ROOT / "server/.env"))
    parser.add_argument("--json", action="store_true")
    args = parser.parse_args()
    env_file = Path(args.env_file).resolve()
    errors: list[str] = []
    if not env_file.is_file():
        errors.append("server/.env 不存在")
        values = {}
    else:
        values = {key: value or "" for key, value in dotenv_values(env_file).items()}
        ignored = subprocess.run(
            ["git", "check-ignore", "-q", str(env_file)], cwd=ROOT,
            check=False, capture_output=True, text=True,
        ).returncode == 0
        if not ignored:
            errors.append("server/.env 未被 Git 忽略")
    try:
        settings = Settings.from_environment(values)
    except ConfigurationError as exc:
        errors.append(str(exc))
        settings = None
    if settings is not None:
        if not settings.ors_api_key:
            errors.append("缺少 ORS_API_KEY，请在 server/.env 中配置")
        if settings.app_env != "development":
            errors.append("APP_ENV 必须为 development")
        if settings.app_host != "127.0.0.1" or settings.app_port != 8000:
            errors.append("APP_HOST/APP_PORT 必须为 127.0.0.1:8000")
        if settings.cors_origins != ("http://127.0.0.1:5500",):
            errors.append("CORS_ORIGINS 必须为 http://127.0.0.1:5500")
        if not settings.provider_ready:
            errors.append("在线 Provider 配置未就绪")
    payload = {
        "status": "ready" if not errors else "not-ready",
        "environment": settings.app_env if settings else "unknown",
        "providers": settings.readiness()["providers"] if settings else {},
        "mockFallback": settings.allow_mock_fallback if settings else False,
        "networkProbePerformed": False,
        "errors": errors,
    }
    if args.json:
        print(json.dumps(payload, ensure_ascii=False))
    elif errors:
        for error in errors:
            print(f"配置错误：{error}。")
    else:
        print("在线 Provider 本地配置已就绪（未执行网络探测）。")
    return 0 if not errors else 2


if __name__ == "__main__":
    raise SystemExit(main())
