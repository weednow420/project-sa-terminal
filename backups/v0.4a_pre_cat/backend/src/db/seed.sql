-- ============================================================
--  TERMINAL_DB — SEED DATA
--  3 базовые категории + карточки (совместимый синтаксис)
-- ============================================================

-- КАТЕГОРИИ
INSERT OR IGNORE INTO categories (slug, title, description, sort_order) VALUES
    ('basis',       'Базис',           'Фундаментальные понятия системы. Контур, оператор, био-датчик.', 0);
INSERT OR IGNORE INTO categories (slug, title, description, sort_order) VALUES
    ('somatics',    'Соматика',        'Базовые определения. Природа отклонения. Точка отсчёта.', 1);
INSERT OR IGNORE INTO categories (slug, title, description, sort_order) VALUES
    ('cognitivism', 'Когнитивистика',  'Механика взаимодействий. Принципы работы контура.', 2);
INSERT OR IGNORE INTO categories (slug, title, description, sort_order) VALUES
    ('isolation',   'Изоляция',        'Операционные инструкции. Последовательности действий.', 3);

-- ── КАРТОЧКИ: БАЗИС ──────────────────────────────────────────
INSERT INTO cards (category_id, title, body_text, sequence_index, subcategory, subcategory_title)
VALUES ((SELECT id FROM categories WHERE slug = 'basis'), '[B-001] ТЕРМИНАЛ S-A',
'// БАЗИС // СИСТЕМА

PROJECT S-A — автономная система регистрации психо-соматических и квантово-информационных состояний.
Терминал не ставит медицинских диагнозов, не развлекает и не поощряет дофаминовые циклы.

Главная задача Терминала:
1. Фиксация входящих сигналов.
2. Стабилизация тактовой частоты био-датчика.
3. Обнаружение скрытых девиаций и аномалий (код b181).

Каждое взаимодействие с системой формирует замкнутый Контур обратной связи.', 1, '', '')
ON CONFLICT(category_id, subcategory, sequence_index) DO UPDATE SET
  title = excluded.title, body_text = excluded.body_text;

INSERT INTO cards (category_id, title, body_text, sequence_index, subcategory, subcategory_title)
VALUES ((SELECT id FROM categories WHERE slug = 'basis'), '[B-002] ОПЕРАТОР И БИО-ДАТЧИК',
'// БАЗИС // АРХИТЕКТУРА

Человек в системе определяется как Оператор.
Тело, рецепторы и нервная система Оператора — Био-датчик.

Био-датчик непрерывно генерирует отклики на среду, физические нагрузки и внутренние процессы.

Оператор не тождественен датчику.
Оператор — наблюдатель, считывающий показания датчика без эмоционального вовлечения.

Связь «Оператор — Био-датчик — Терминал» образует единую рабочую триаду.', 2, '', '')
ON CONFLICT(category_id, subcategory, sequence_index) DO UPDATE SET
  title = excluded.title, body_text = excluded.body_text;

-- ── КАРТОЧКИ: Соматика // Классика ────────────────────────────
INSERT INTO cards (category_id, title, body_text, sequence_index, subcategory, subcategory_title)
VALUES ((SELECT id FROM categories WHERE slug = 'somatics'), '[A-001] ОПРЕДЕЛЕНИЕ',
'Аномалия — это устойчивое отклонение Био-датчика от базовой линии нормы.
Не патология. Не дефект. Зафиксированное состояние системы,
требующее интерпретации. Терминал не ставит диагнозов.
Терминал регистрирует сигналы.', 1, 'classic', 'КЛАССИКА')
ON CONFLICT(category_id, subcategory, sequence_index) DO UPDATE SET
  title = excluded.title, body_text = excluded.body_text;

INSERT INTO cards (category_id, title, body_text, sequence_index, subcategory, subcategory_title)
VALUES ((SELECT id FROM categories WHERE slug = 'somatics'), '[A-002] КАЛИБРОВКА',
'Прежде чем считывать данные — установи нулевую точку.
Нулевая точка: спокойное состояние Оператора в момент открытия Терминала.
Все последующие показания будут отсчитываться от неё.', 2, 'classic', 'КЛАССИКА')
ON CONFLICT(category_id, subcategory, sequence_index) DO UPDATE SET
  title = excluded.title, body_text = excluded.body_text;

INSERT INTO cards (category_id, title, body_text, sequence_index, subcategory, subcategory_title)
VALUES ((SELECT id FROM categories WHERE slug = 'somatics'), '[A-003] ПАТТЕРН',
'Одиночный сигнал — шум. Повторяющийся сигнал — паттерн.
Терминал работает только с паттернами.
Минимальная выборка для фиксации паттерна: 3 цикла наблюдения.', 3, 'classic', 'КЛАССИКА')
ON CONFLICT(category_id, subcategory, sequence_index) DO UPDATE SET
  title = excluded.title, body_text = excluded.body_text;

-- ── КАРТОЧКИ: Физика процесса (Когнитивистика) ────────────────
INSERT INTO cards (category_id, title, body_text, sequence_index, subcategory, subcategory_title)
VALUES ((SELECT id FROM categories WHERE slug = 'cognitivism'), '[P-001] КОНТУР',
'Контур — замкнутая цепь взаимодействий между Оператором и Био-датчиком.
Контур активен всегда, независимо от осознанности Оператора.
Задача Терминала: сделать контур видимым.', 1, '', '')
ON CONFLICT(category_id, subcategory, sequence_index) DO UPDATE SET
  title = excluded.title, body_text = excluded.body_text;

INSERT INTO cards (category_id, title, body_text, sequence_index, subcategory, subcategory_title)
VALUES ((SELECT id FROM categories WHERE slug = 'cognitivism'), '[P-002] ВХОДЯЩИЙ СИГНАЛ',
'Входящие сигналы делятся на два класса:
ВНЕШНИЕ (среда, триггеры, нагрузка) и
ВНУТРЕННИЕ (реакции Био-датчика).
Смешение классов — источник ошибки интерпретации.', 2, '', '')
ON CONFLICT(category_id, subcategory, sequence_index) DO UPDATE SET
  title = excluded.title, body_text = excluded.body_text;

INSERT INTO cards (category_id, title, body_text, sequence_index, subcategory, subcategory_title)
VALUES ((SELECT id FROM categories WHERE slug = 'cognitivism'), '[P-003] ПЕТЛЯ ОБРАТНОЙ СВЯЗИ',
'Петля замыкается, когда выход системы становится её входом.
Усиливающая петля: отклонение нарастает.
Балансирующая петля: система стремится к равновесию.
Определи тип петли — определи стратегию.', 3, '', '')
ON CONFLICT(category_id, subcategory, sequence_index) DO UPDATE SET
  title = excluded.title, body_text = excluded.body_text;

-- ── КАРТОЧКИ: Протокол (Изоляция) ─────────────────────────────
INSERT INTO cards (category_id, title, body_text, sequence_index, subcategory, subcategory_title)
VALUES ((SELECT id FROM categories WHERE slug = 'isolation'), '[PR-001] ИНИЦИАЛИЗАЦИЯ',
'// ОБЯЗАТЕЛЬНЫЙ ШАГ. ПРОПУСК НЕДОПУСТИМ. //

Шаг 1: Зафиксируй текущее состояние Био-датчика (числовая оценка 1-10).
Шаг 2: Зафиксируй контекст (время суток, последнее действие).
Шаг 3: Открой нужный раздел Гримуара.

Только после выполнения всех шагов переходи к следующей карточке.', 1, '', '')
ON CONFLICT(category_id, subcategory, sequence_index) DO UPDATE SET
  title = excluded.title, body_text = excluded.body_text;

INSERT INTO cards (category_id, title, body_text, sequence_index, subcategory, subcategory_title)
VALUES ((SELECT id FROM categories WHERE slug = 'isolation'), '[PR-002] ПОСЛЕДОВАТЕЛЬНОСТЬ',
'Протокол нарушен, если Оператор пропустил хотя бы один шаг.
Нарушенный протокол регистрируется как инцидент [b181].
При инциденте: вернись к PR-001 и пройди заново.', 2, '', '')
ON CONFLICT(category_id, subcategory, sequence_index) DO UPDATE SET
  title = excluded.title, body_text = excluded.body_text;

INSERT INTO cards (category_id, title, body_text, sequence_index, subcategory, subcategory_title)
VALUES ((SELECT id FROM categories WHERE slug = 'isolation'), '[PR-003] ЗАВЕРШЕНИЕ СЕССИИ',
'Сессия Терминала считается завершённой при выполнении условия:
Оператор прочитал минимум одну карточку полностью,
не прерывая чтение. Частичное прочтение — не завершение.', 3, '', '')
ON CONFLICT(category_id, subcategory, sequence_index) DO UPDATE SET
  title = excluded.title, body_text = excluded.body_text;
