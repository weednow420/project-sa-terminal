# PROJECT S-A TERMINAL

> Режим Наблюдателя (MVP Фаза 1). Telegram Mini App.

## Структура

```
project-sa-terminal/
├── bot/                    # Telegram бот (Python + Aiogram 3)
│   ├── main.py
│   ├── requirements.txt
│   └── .env.example
├── backend/                # REST API (Node.js + Fastify)
│   ├── src/
│   │   ├── db/
│   │   │   ├── schema.sql  # Схема TERMINAL_DB
│   │   │   ├── seed.sql    # Начальные данные (3 категории)
│   │   │   └── init.js     # Инициализатор БД
│   │   ├── routes/
│   │   │   ├── categories.js
│   │   │   └── cards.js
│   │   └── index.js        # Точка входа сервера
│   ├── package.json
│   └── .env.example
└── frontend/               # TMA Interface (Vanilla JS)
    ├── index.html
    ├── style.css
    └── app.js
```

## Быстрый запуск (Всё в 1 клик)

### Самый простой способ (Windows):
Просто запусти файл:
```bat
start.bat
```
Он автоматически:
1. Запустит Backend сервер (Fastify + SQLite на порту 3000).
2. Подключит безопасный HTTPS туннель через Ngrok.
3. Обновит конфигурацию бота с актуальным адресом.
4. Запустит Telegram-бота `@Project_Terminal_bot`.

---

### Запуск через консоль:
```bash
cd backend
npm start
```

### 3. Telegram Bot

```bash
cd bot
pip install -r requirements.txt
cp .env.example .env
# Заполни BOT_TOKEN и WEBAPP_URL в .env
python main.py
```

## API Endpoints

| Метод | URL | Описание |
|-------|-----|----------|
| GET | `/api/health` | Статус системы |
| GET | `/api/categories` | Список категорий Гримуара |
| GET | `/api/categories/:slug` | Одна категория |
| GET | `/api/categories/:slug/cards` | Карточки (с §01) |
| GET | `/api/cards/:id` | Одна карточка |

## Архитектурные правила

- **Метка инцидента:** все сбои БД = `b181`
- **Последовательность:** карточки читаются строго с `sequence_index = 1`
- **Авторизация:** только `window.Telegram.WebApp.initDataUnsafe`
- **Дизайн:** монохром, Fira Code/Space Mono, нет скруглений, нет градиентов

## Задел на будущее (Фаза 2)

- `daily_report_caps` — хард-кап 3 отчёта/день
- `focus_cycles` — циклы монолитного фокуса (3/7/21/28 дней)
- `operator_reports` — оплачиваемые отчёты

> Заглушки уже описаны в комментариях `schema.sql`
