#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
BACKEND_HOST="127.0.0.1"
BACKEND_PORT="8000"
FRONTEND_HOST="127.0.0.1"
FRONTEND_PORT="5500"
BACKEND_PID=""
FRONTEND_PID=""

port_owner() {
  local port="$1"
  if command -v lsof >/dev/null 2>&1; then
    lsof -nP -iTCP:"${port}" -sTCP:LISTEN -Fpc 2>/dev/null | sed -n '1,4p' || true
  fi
  return 0
}

check_port() {
  local port="$1"
  local owner
  owner="$(port_owner "${port}")"
  if [[ -n "${owner}" ]]; then
    echo "端口 ${port} 已被占用："
    echo "${owner}"
    echo "不会自动终止该进程。请先停止旧实例，或显式配置一组同步的新端口。"
    return 2
  fi
  return 0
}

stop_children() {
  trap - INT TERM EXIT
  for pid in "${FRONTEND_PID}" "${BACKEND_PID}"; do
    if [[ -n "${pid}" ]] && kill -0 "${pid}" 2>/dev/null; then
      kill -TERM "${pid}" 2>/dev/null || true
    fi
  done
  for pid in "${FRONTEND_PID}" "${BACKEND_PID}"; do
    if [[ -n "${pid}" ]]; then
      wait "${pid}" 2>/dev/null || true
    fi
  done
}

cd "${PROJECT_ROOT}"

if [[ ! -x "server/.venv/bin/python" ]]; then
  echo "缺少 server/.venv/bin/python，请先安装后端依赖。"
  exit 2
fi
if ! command -v python3 >/dev/null 2>&1; then
  echo "缺少 python3，无法启动前端静态服务。"
  exit 2
fi

PYTHONPATH=server server/.venv/bin/python scripts/check_online_config.py
check_port "${BACKEND_PORT}"
check_port "${FRONTEND_PORT}"

if [[ "${1:-}" == "--check-only" ]]; then
  echo "配置与端口检查通过。"
  exit 0
fi

trap stop_children INT TERM EXIT

PYTHONPATH=server server/.venv/bin/python -m uvicorn app.main:app \
  --env-file server/.env --host "${BACKEND_HOST}" --port "${BACKEND_PORT}" &
BACKEND_PID="$!"

python3 -m http.server "${FRONTEND_PORT}" --bind "${FRONTEND_HOST}" &
FRONTEND_PID="$!"

health_ready="false"
for _ in $(seq 1 30); do
  if ! kill -0 "${BACKEND_PID}" 2>/dev/null || ! kill -0 "${FRONTEND_PID}" 2>/dev/null; then
    echo "本地服务在就绪前退出。"
    exit 2
  fi
  if server/.venv/bin/python -c 'import json,sys,urllib.request; data=json.load(urllib.request.urlopen("http://127.0.0.1:8000/api/v1/health", timeout=1)); sys.exit(0 if data.get("status")=="ready" and data.get("networkProbePerformed") is False else 1)' 2>/dev/null; then
    health_ready="true"
    break
  fi
  sleep 0.5
done

if [[ "${health_ready}" != "true" ]]; then
  echo "本地 health 在 15 秒内未就绪。"
  exit 2
fi

echo "Frontend: http://${FRONTEND_HOST}:${FRONTEND_PORT}"
echo "Backend:  http://${BACKEND_HOST}:${BACKEND_PORT}"
echo "在线 Provider 本地配置已就绪；health 未执行上游探测。"
echo "按 Ctrl+C 优雅停止本脚本启动的两个进程。"

wait
