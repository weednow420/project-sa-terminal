// ============================================================
//  TERMINAL_DB — Database (sql.js — pure WebAssembly, no build tools)
// ============================================================
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import initSqlJs from 'sql.js';
import { syncCardsFromFiles } from './syncCards.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

const DB_PATH    = process.env.DB_PATH || join(__dirname, '../../../terminal_db.sqlite');
const SCHEMA_SQL = join(__dirname, 'schema.sql');
const SEED_SQL   = join(__dirname, 'seed.sql');

let _db = null; // singleton in-process

// ── Загрузка / создание БД ────────────────────────────────────
export async function getDb() {
  if (_db) return _db;

  const SQL = await initSqlJs();

  if (existsSync(DB_PATH)) {
    const fileBuffer = readFileSync(DB_PATH);
    _db = new SQL.Database(fileBuffer);
  } else {
    _db = new SQL.Database();
    console.log('[TERMINAL] Новая БД создана в памяти.');
  }

  // WAL и FK через PRAGMA
  _db.run("PRAGMA journal_mode = WAL;");
  _db.run("PRAGMA foreign_keys = ON;");

  return _db;
}

// ── Сохранение БД на диск (вызывать после каждой записи) ─────
export function persistDb() {
  if (!_db) return;
  const data = _db.export();
  writeFileSync(DB_PATH, Buffer.from(data));
}

// ── Инициализация (schema + seed) ─────────────────────────────
export async function initDb() {
  const db = await getDb();

  try {
    const schema = readFileSync(SCHEMA_SQL, 'utf8');
    runStatements(db, schema);
    console.log('[TERMINAL] Schema applied OK');

    const seed = readFileSync(SEED_SQL, 'utf8');
    runStatements(db, seed);
    console.log('[TERMINAL] Seed data applied OK');

    // Миграция: убеждаемся что в operators есть колонка operator_number
    const cols = queryAll(db, "PRAGMA table_info(operators)").map(c => c.name);
    if (cols.length > 0 && !cols.includes('operator_number')) {
      console.log('[TERMINAL] Миграция: пересоздание таблицы operators со столбцом operator_number...');
      db.run("DROP TABLE IF EXISTS operators;");
      db.run(`CREATE TABLE IF NOT EXISTS operators (
        operator_number  INTEGER PRIMARY KEY AUTOINCREMENT,
        telegram_id      INTEGER NOT NULL UNIQUE,
        username         TEXT,
        first_name       TEXT,
        first_seen_at    TEXT NOT NULL DEFAULT (datetime('now')),
        last_seen_at     TEXT NOT NULL DEFAULT (datetime('now')),
        theme_preference TEXT NOT NULL DEFAULT 'auto',
        is_admin         INTEGER NOT NULL DEFAULT 0
      );`);
      console.log('[TERMINAL] Миграция operators завершена успешно.');
    } else if (cols.length > 0 && !cols.includes('is_admin')) {
      console.log('[TERMINAL] Миграция: добавление столбца is_admin в operators...');
      db.run("ALTER TABLE operators ADD COLUMN is_admin INTEGER NOT NULL DEFAULT 0;");
      console.log('[TERMINAL] Столбец is_admin добавлен.');
    }

    const updatedCols = queryAll(db, "PRAGMA table_info(operators)").map(c => c.name);
    if (!updatedCols.includes('auth_revoked')) {
      db.run("ALTER TABLE operators ADD COLUMN auth_revoked INTEGER NOT NULL DEFAULT 0;");
      console.log('[TERMINAL] Столбец auth_revoked добавлен в operators.');
    }
    if (!updatedCols.includes('auth_version')) {
      db.run("ALTER TABLE operators ADD COLUMN auth_version INTEGER NOT NULL DEFAULT 1;");
      console.log('[TERMINAL] Столбец auth_version добавлен в operators.');
    }

    // Создаем таблицу messages при необходимости
    db.run(`CREATE TABLE IF NOT EXISTS messages (
      id           INTEGER PRIMARY KEY AUTOINCREMENT,
      operator_id  INTEGER REFERENCES operators(telegram_id) ON DELETE SET NULL,
      username     TEXT,
      first_name   TEXT,
      message_text TEXT NOT NULL,
      created_at   TEXT NOT NULL DEFAULT (datetime('now'))
    );`);

    // Автоматическая синхронизация карточек из папки cards/*.txt
    try {
      await syncCardsFromFiles(db, { run, queryOne, persistDb });
    } catch (e) {
      console.warn('[TERMINAL] Предупреждение синхронизации карточек:', e.message);
    }

    persistDb();
    console.log(`[TERMINAL] DB saved → ${DB_PATH}`);
  } catch (err) {
    // Системный инцидент — метка b181
    console.error('[b181] DB initialization failed:', err.message);
    process.exit(1);
  }
}

// ── Выполнить несколько SQL-операторов из файла ───────────────
// sql.js не поддерживает db.run() с несколькими операторами —
// разбиваем по ';' и выполняем по одному.
function runStatements(db, sql) {
  // Убираем комментарии (-- ...) и пустые строки, затем сплитим по ;
  const statements = sql
    .split(';')
    .map(s => s.replace(/--[^\n]*/g, '').trim())
    .filter(s => s.length > 0);

  for (const stmt of statements) {
    db.run(stmt + ';');
  }
}

// ── Вспомогательная: выполнить SELECT → массив объектов ───────
export function queryAll(db, sql, params = []) {
  const stmt = db.prepare(sql);
  stmt.bind(params);
  const rows = [];
  while (stmt.step()) {
    rows.push(stmt.getAsObject());
  }
  stmt.free();
  return rows;
}

export function queryOne(db, sql, params = []) {
  const rows = queryAll(db, sql, params);
  return rows[0] ?? null;
}

export function run(db, sql, params = []) {
  const stmt = db.prepare(sql);
  stmt.run(params);
  stmt.free();
  persistDb(); // сохраняем на диск после каждой записи
}

// Запуск напрямую: node src/db/init.js
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  await initDb();
  process.exit(0);
}
