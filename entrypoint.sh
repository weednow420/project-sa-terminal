#!/bin/bash
set -e

echo "============================================================"
echo "   PROJECT S-A TERMINAL // CLOUD RUNTIME (RENDER / HF)      "
echo "============================================================"

# Авто-определение публичного URL (Render.com, HF Spaces или прямое значение)
if [ -z "$WEBAPP_URL" ]; then
  if [ -n "$RENDER_EXTERNAL_URL" ]; then
    export WEBAPP_URL="${RENDER_EXTERNAL_URL}"
  elif [ -n "$SPACE_HOST" ]; then
    export WEBAPP_URL="https://${SPACE_HOST}"
  elif [ -n "$SPACE_ID" ]; then
    CLEAN_HOST=$(echo "$SPACE_ID" | tr '/' '-' | tr '[:upper:]' '[:lower:]')
    export WEBAPP_URL="https://${CLEAN_HOST}.hf.space"
  fi
  echo "[INIT] Автоматический WEBAPP_URL: ${WEBAPP_URL}"
fi

export PORT=${PORT:-10000}
export HOST=0.0.0.0

echo "[1/3] Инициализация базы данных и синхронизация карточек..."
cd /home/user/app/backend
node src/db/init.js

echo "[2/3] Запуск Backend сервера Fastify на порту ${PORT}..."
node src/index.js &
SERVER_PID=$!

echo "[3/3] Запуск Telegram-бота..."
cd /home/user/app/bot
python main.py &
BOT_PID=$!

echo "============================================================"
echo "   ВСЕ СЕРВИСЫ УСПЕШНО ЗАПУЩЕНЫ (BACKEND + TG-BOT)!        "
echo "============================================================"

cleanup() {
  echo "[SHUTDOWN] Остановка процессов..."
  kill -TERM "$SERVER_PID" "$BOT_PID" 2>/dev/null || true
  exit 0
}

trap cleanup SIGINT SIGTERM

wait -n "$SERVER_PID" "$BOT_PID"
