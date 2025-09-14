#!/usr/bin/env bash
set -euo pipefail

# Colors
RED="\033[31m"
GREEN="\033[32m"
YELLOW="\033[33m"
BLUE="\033[34m"
CYAN="\033[36m"
BOLD="\033[1m"
RESET="\033[0m"

FRONTEND_PORT=4000
PID_DIR="/tmp/asteroids"
PID_FILE_FRONTEND="$PID_DIR/asteroids_frontend.pid"

ensure_pid_dir() {
  mkdir -p "$PID_DIR" || true
  chmod 700 "$PID_DIR" || true
}

kill_pid_if_running() {
  local pid_file="$1"
  if [[ -f "$pid_file" ]]; then
    local pid
    pid=$(cat "$pid_file" || true)
    if [[ -n "${pid}" ]] && ps -p "$pid" >/dev/null 2>&1; then
      echo -e "${YELLOW}${BOLD}Stopping existing process PID ${pid}${RESET}"
      kill "$pid" || true
      # give it a moment, then force-kill if needed
      sleep 1
      if ps -p "$pid" >/dev/null 2>&1; then
        kill -9 "$pid" || true
      fi
    fi
    rm -f "$pid_file" || true
  fi
}

kill_port_if_bound() {
  local port="$1"
  if lsof -i tcp:"$port" -sTCP:LISTEN -t >/dev/null 2>&1; then
    local pids
    pids=$(lsof -i tcp:"$port" -sTCP:LISTEN -t | tr '\n' ' ')
    echo -e "${YELLOW}${BOLD}Port ${port} is in use by PID(s): ${pids}. Attempting to stop...${RESET}"
    while read -r p; do
      kill "$p" || true
      sleep 1
      if ps -p "$p" >/devnull 2>&1; then
        kill -9 "$p" || true
      fi
    done < <(echo "$pids" | tr ' ' '\n')
  fi
}

start_frontend() {
  echo -e "${CYAN}${BOLD}Starting frontend on http://localhost:${FRONTEND_PORT}${RESET}"
  # Use npm run dev with Vite, forcing port
  (npm run dev -- --port ${FRONTEND_PORT} >/tmp/asteroids_frontend.log 2>&1 & echo $! >"$PID_FILE_FRONTEND")
  chmod 600 "$PID_FILE_FRONTEND" || true
}

health_check() {
  local url="http://localhost:${FRONTEND_PORT}"
  for i in {1..30}; do
    if curl -fsS "$url" >/dev/null 2>&1; then
      echo -e "${GREEN}${BOLD}Frontend is up at ${url}${RESET}"
      return 0
    fi
    echo -e "${BLUE}Waiting for frontend... (${i}/30)${RESET}"
    sleep 0.5
  done
  echo -e "${RED}${BOLD}Frontend failed to start on ${url}${RESET}"
  echo -e "${YELLOW}Last 50 log lines:${RESET}"
  tail -n 50 /tmp/asteroids_frontend.log || true
  return 1
}

main() {
  ensure_pid_dir
  kill_pid_if_running "$PID_FILE_FRONTEND"
  kill_port_if_bound "$FRONTEND_PORT"
  start_frontend
  health_check
}

main "$@"
