-- ============================================================
--  TERMINAL_DB — PROJECT S-A TERMINAL
--  MVP Фаза 1: Режим Наблюдателя (Read-Only)
--  Системная метка инцидента: b181
-- ============================================================


-- ------------------------------------------------------------
-- [1] КАТЕГОРИИ ГРИМУАРА
-- Основные разделы Библиотеки.
-- sort_order: порядок отображения в интерфейсе Терминала.
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS categories (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    slug        TEXT    NOT NULL UNIQUE,           -- машинный идентификатор (e.g. 'anomaly-core')
    title       TEXT    NOT NULL,                  -- отображаемое название
    description TEXT,                              -- краткое описание раздела
    sort_order  INTEGER NOT NULL DEFAULT 0,
    is_active   INTEGER NOT NULL DEFAULT 1,        -- 0 = скрыто от Оператора
    created_at  TEXT    NOT NULL DEFAULT (datetime('now'))
);

-- ------------------------------------------------------------
-- [2] КАРТОЧКИ ГРИМУАРА
-- Текстовые записи внутри категорий.
-- sequence_index: ОБЯЗАТЕЛЬНЫЙ порядок — Оператор не может
--                 пропустить строки калибровки (начало с 1).
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS cards (
    id             INTEGER PRIMARY KEY AUTOINCREMENT,
    category_id    INTEGER NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
    title          TEXT    NOT NULL,
    body_text      TEXT    NOT NULL,               -- основное содержимое карточки
    sequence_index INTEGER NOT NULL DEFAULT 1,     -- СТАРТ ВСЕГДА С 1, без пропусков
    is_active      INTEGER NOT NULL DEFAULT 1,
    created_at     TEXT    NOT NULL DEFAULT (datetime('now')),
    UNIQUE(category_id, sequence_index)            -- уникальный порядок внутри категории
);

-- ------------------------------------------------------------
-- [3] ОПЕРАТОРЫ
-- Реестр Операторов, авторизованных через Telegram.
-- operator_number: постоянный порядковый номер Оператора (№ 1, 2, 3...)
--                  для идентификации и синхронизации с транскриптом.
-- telegram_id: Telegram ID био-носителя (уникальный).
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS operators (
    operator_number  INTEGER PRIMARY KEY AUTOINCREMENT, -- Закрепленный номер Оператора (№ 0001)
    telegram_id      INTEGER NOT NULL UNIQUE,           -- из initDataUnsafe.user.id
    username         TEXT,                              -- @username (может быть NULL)
    first_name       TEXT,
    first_seen_at    TEXT NOT NULL DEFAULT (datetime('now')),
    last_seen_at     TEXT NOT NULL DEFAULT (datetime('now')),
    theme_preference TEXT NOT NULL DEFAULT 'auto',      -- 'light' | 'dark' | 'auto'
    is_admin         INTEGER NOT NULL DEFAULT 0         -- 1 = Администратор, 0 = Оператор
);

-- ------------------------------------------------------------
-- [4] ЛОГ ИНЦИДЕНТОВ
-- Системная метка телеметрии для стандартного сбоя: b181
-- Все критические ошибки БД фиксируются здесь.
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS incident_log (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    operator_id  INTEGER REFERENCES operators(telegram_id) ON DELETE SET NULL,
    error_code   TEXT    NOT NULL DEFAULT 'b181',  -- << ЗАФИКСИРОВАНО: b181
    severity     TEXT    NOT NULL DEFAULT 'ERROR', -- 'WARN' | 'ERROR' | 'CRITICAL'
    context_json TEXT,                             -- JSON с деталями инцидента
    occurred_at  TEXT    NOT NULL DEFAULT (datetime('now'))
);

-- ============================================================
-- ЗАГЛУШКИ ДЛЯ БУДУЩИХ ФАЗ (закомментированы)
-- ============================================================

-- FUTURE PHASE 2: Суточные хард-капы
-- Оператор не может получить более 3 оплачиваемых отчётов в сутки.
-- CREATE TABLE IF NOT EXISTS daily_report_caps (
--     id           INTEGER PRIMARY KEY AUTOINCREMENT,
--     operator_id  INTEGER NOT NULL REFERENCES operators(telegram_id),
--     report_date  TEXT    NOT NULL,               -- DATE: 'YYYY-MM-DD'
--     report_count INTEGER NOT NULL DEFAULT 0,     -- MAX = 3
--     UNIQUE(operator_id, report_date)
-- );

-- FUTURE PHASE 2: Система монолитного фокуса
-- Циклы тестирования карточек-протоколов: 3, 7, 21, 28 дней.
-- CREATE TABLE IF NOT EXISTS focus_cycles (
--     id          INTEGER PRIMARY KEY AUTOINCREMENT,
--     operator_id INTEGER NOT NULL REFERENCES operators(telegram_id),
--     card_id     INTEGER NOT NULL REFERENCES cards(id),
--     cycle_days  INTEGER NOT NULL CHECK(cycle_days IN (3, 7, 21, 28)),
--     started_at  TEXT    NOT NULL DEFAULT (datetime('now')),
--     ends_at     TEXT    NOT NULL,                -- started_at + cycle_days
--     status      TEXT    NOT NULL DEFAULT 'ACTIVE' -- 'ACTIVE' | 'COMPLETE' | 'ABORTED'
-- );

-- FUTURE PHASE 3: Оплачиваемые отчёты Операторов
-- CREATE TABLE IF NOT EXISTS operator_reports (
--     id          INTEGER PRIMARY KEY AUTOINCREMENT,
--     operator_id INTEGER NOT NULL REFERENCES operators(telegram_id),
--     report_type TEXT    NOT NULL,
--     payload_json TEXT,
--     created_at  TEXT    NOT NULL DEFAULT (datetime('now')),
--     is_paid     INTEGER NOT NULL DEFAULT 0
-- );
