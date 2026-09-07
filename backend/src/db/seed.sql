-- ============================================================
--  TERMINAL_DB — SEED DATA
--  3 базовые категории + карточки (совместимый синтаксис)
-- ============================================================

-- КАТЕГОРИИ
INSERT OR IGNORE INTO categories (slug, title, description, sort_order) VALUES
    ('somatics',    'Соматика',        'Базовые определения. Природа отклонения. Точка отсчёта.', 1);
INSERT OR IGNORE INTO categories (slug, title, description, sort_order) VALUES
    ('cognitivism', 'Когнитивистика',  'Механика взаимодействий. Принципы работы контура.', 2);
INSERT OR IGNORE INTO categories (slug, title, description, sort_order) VALUES
    ('isolation',   'Изоляция',        'Операционные инструкции. Последовательности действий.', 3);

-- ── КАРТОЧКИ: Ядро аномалии ───────────────────────────────────
INSERT INTO cards (category_id, title, body_text, sequence_index)
VALUES (1, '[A-001] ОПРЕДЕЛЕНИЕ',
'Аномалия — это устойчивое отклонение Био-датчика от базовой линии нормы.
Не патология. Не дефект. Зафиксированное состояние системы,
требующее интерпретации. Терминал не ставит диагнозов.
Терминал регистрирует сигналы.', 1)
ON CONFLICT(category_id, sequence_index) DO UPDATE SET
  title = excluded.title, body_text = excluded.body_text;

INSERT INTO cards (category_id, title, body_text, sequence_index)
VALUES (1, '[A-002] КАЛИБРОВКА',
'Прежде чем считывать данные — установи нулевую точку.
Нулевая точка: спокойное состояние Оператора в момент открытия Терминала.
Все последующие показания будут отсчитываться от неё.', 2)
ON CONFLICT(category_id, sequence_index) DO UPDATE SET
  title = excluded.title, body_text = excluded.body_text;

INSERT INTO cards (category_id, title, body_text, sequence_index)
VALUES (1, '[A-003] ПАТТЕРН',
'Одиночный сигнал — шум. Повторяющийся сигнал — паттерн.
Терминал работает только с паттернами.
Минимальная выборка для фиксации паттерна: 3 цикла наблюдения.', 3)
ON CONFLICT(category_id, sequence_index) DO UPDATE SET
  title = excluded.title, body_text = excluded.body_text;

-- ── КАРТОЧКИ: Физика процесса ─────────────────────────────────
INSERT INTO cards (category_id, title, body_text, sequence_index)
VALUES (2, '[P-001] КОНТУР',
'Контур — замкнутая цепь взаимодействий между Оператором и Био-датчиком.
Контур активен всегда, независимо от осознанности Оператора.
Задача Терминала: сделать контур видимым.', 1)
ON CONFLICT(category_id, sequence_index) DO UPDATE SET
  title = excluded.title, body_text = excluded.body_text;

INSERT INTO cards (category_id, title, body_text, sequence_index)
VALUES (2, '[P-002] ВХОДЯЩИЙ СИГНАЛ',
'Входящие сигналы делятся на два класса:
ВНЕШНИЕ (среда, триггеры, нагрузка) и
ВНУТРЕННИЕ (реакции Био-датчика).
Смешение классов — источник ошибки интерпретации.', 2)
ON CONFLICT(category_id, sequence_index) DO UPDATE SET
  title = excluded.title, body_text = excluded.body_text;

INSERT INTO cards (category_id, title, body_text, sequence_index)
VALUES (2, '[P-003] ПЕТЛЯ ОБРАТНОЙ СВЯЗИ',
'Петля замыкается, когда выход системы становится её входом.
Усиливающая петля: отклонение нарастает.
Балансирующая петля: система стремится к равновесию.
Определи тип петли — определи стратегию.', 3)
ON CONFLICT(category_id, sequence_index) DO UPDATE SET
  title = excluded.title, body_text = excluded.body_text;

-- ── КАРТОЧКИ: Протокол ────────────────────────────────────────
INSERT INTO cards (category_id, title, body_text, sequence_index)
VALUES (3, '[PR-001] ИНИЦИАЛИЗАЦИЯ',
'// ОБЯЗАТЕЛЬНЫЙ ШАГ. ПРОПУСК НЕДОПУСТИМ. //

Шаг 1: Зафиксируй текущее состояние Био-датчика (числовая оценка 1-10).
Шаг 2: Зафиксируй контекст (время суток, последнее действие).
Шаг 3: Открой нужный раздел Гримуара.

Только после выполнения всех шагов переходи к следующей карточке.', 1)
ON CONFLICT(category_id, sequence_index) DO UPDATE SET
  title = excluded.title, body_text = excluded.body_text;

INSERT INTO cards (category_id, title, body_text, sequence_index)
VALUES (3, '[PR-002] ПОСЛЕДОВАТЕЛЬНОСТЬ',
'Протокол нарушен, если Оператор пропустил хотя бы один шаг.
Нарушенный протокол регистрируется как инцидент [b181].
При инциденте: вернись к PR-001 и пройди заново.', 2)
ON CONFLICT(category_id, sequence_index) DO UPDATE SET
  title = excluded.title, body_text = excluded.body_text;

INSERT INTO cards (category_id, title, body_text, sequence_index)
VALUES (3, '[PR-003] ЗАВЕРШЕНИЕ СЕССИИ',
'Сессия Терминала считается завершённой при выполнении условия:
Оператор прочитал минимум одну карточку полностью,
не прерывая чтение. Частичное прочтение — не завершение.', 3)
ON CONFLICT(category_id, sequence_index) DO UPDATE SET
  title = excluded.title, body_text = excluded.body_text;
