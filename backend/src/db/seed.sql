-- ============================================================
--  TERMINAL_DB — SEED DATA (ГРИМУАР // ТРИАДА ДОМЕНОВ)
-- ============================================================

-- ТРИАДА КАТЕГОРИЙ
INSERT OR IGNORE INTO categories (slug, title, description, sort_order) VALUES
    ('somatics',    'СОМАТИКА',        'Нейробиология, интероцепция, проприоцепция, эмбодимент и соматическая калибровка.', 1);
INSERT OR IGNORE INTO categories (slug, title, description, sort_order) VALUES
    ('cognitivism', 'КОГНИТИВИСТИКА',  'Внимание, нейропластичность, когнитивные искажения и метапознание.', 2);
INSERT OR IGNORE INTO categories (slug, title, description, sort_order) VALUES
    ('isolation',   'ИЗОЛЯЦИЯ',        'Сенсорная депривация, социальная тишина, автономия и аскеза.', 3);
