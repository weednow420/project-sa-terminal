// ============================================================
//  syncCards.js — Автоматическая синхронизация карточек из папки cards/
//  Имя .txt файла  → Название карточки (title)
//  Текст файла     → Содержимое карточки (body_text)
// ============================================================
import { readdirSync, readFileSync, existsSync, statSync } from 'fs';
import { join, dirname, parse } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const CARDS_ROOT = join(__dirname, '..', '..', '..', 'cards');

export async function syncCardsFromFiles(passedDb = null, helpers = {}) {
  let { run: runFn, queryOne: queryOneFn, persistDb: persistDbFn } = helpers;

  if (!passedDb || !runFn) {
    const initModule = await import('./init.js');
    passedDb = passedDb || await initModule.getDb();
    runFn = runFn || initModule.run;
    queryOneFn = queryOneFn || initModule.queryOne;
    persistDbFn = persistDbFn || initModule.persistDb;
  }

  const db = passedDb;
  if (!existsSync(CARDS_ROOT)) {
    console.warn(`[SYNC] Папка карточек не найдена: ${CARDS_ROOT}`);
    return;
  }

  console.log('[SYNC] Сканирование папки cards/ для обновления карточек...');

  const entries = readdirSync(CARDS_ROOT);
  let totalCardsSynced = 0;

  for (const entry of entries) {
    const fullPath = join(CARDS_ROOT, entry);
    if (!statSync(fullPath).isDirectory()) continue;

    const catInfo = resolveCategoryInfo(entry);
    if (!catInfo) {
      console.warn(`[SYNC] Не удалось сопоставить категорию для папки: ${entry}`);
      continue;
    }

    // Проверяем или создаем категорию в БД
    let catRow = queryOneFn(db, 'SELECT id, title FROM categories WHERE slug = ?', [catInfo.slug]);
    if (!catRow) {
      // Проверяем по sort_order (для старых баз со старыми слагами)
      catRow = queryOneFn(db, 'SELECT id, title FROM categories WHERE sort_order = ?', [catInfo.sortOrder]);
      if (catRow) {
        runFn(db, 'UPDATE categories SET slug = ?, title = ?, is_active = 1 WHERE id = ?', [catInfo.slug, catInfo.title, catRow.id]);
      } else {
        runFn(db, 'INSERT INTO categories (slug, title, description, sort_order, is_active) VALUES (?, ?, ?, ?, 1)',
          [catInfo.slug, catInfo.title, '', catInfo.sortOrder]);
        catRow = queryOneFn(db, 'SELECT id, title FROM categories WHERE slug = ?', [catInfo.slug]);
      }
    } else {
      runFn(db, 'UPDATE categories SET title = ?, sort_order = ?, is_active = 1 WHERE id = ?',
        [catInfo.title, catInfo.sortOrder, catRow.id]);
    }

    const categoryId = catRow.id;

    // Читаем все .txt файлы в папке категории
    const files = readdirSync(fullPath)
      .filter(f => f.toLowerCase().endsWith('.txt') && !f.startsWith('.'))
      .sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' }));

    let seqIndex = 1;
    for (const file of files) {
      const filePath = join(fullPath, file);
      const parsed = parse(file);

      // Имя карточки берётся ИЗ ИМЕНИ ФАЙЛА (без расширения .txt)
      const title = parsed.name.trim();

      // Текст карточки берётся ИЗ СОДЕРЖИМОГО ФАЙЛА
      const bodyText = readFileSync(filePath, 'utf8').trim();

      if (!title || !bodyText) continue;

      // Запись/обновление в SQLite
      runFn(
        db,
        `INSERT INTO cards (category_id, title, body_text, sequence_index, is_active)
         VALUES (?, ?, ?, ?, 1)
         ON CONFLICT(category_id, sequence_index) DO UPDATE SET
           title = excluded.title,
           body_text = excluded.body_text,
           is_active = 1`,
        [categoryId, title, bodyText, seqIndex]
      );

      seqIndex++;
      totalCardsSynced++;
    }

    // Если файлы были удалены, очищаем лишние sequence_index в этой категории
    const finalCount = seqIndex - 1;
    runFn(
      db,
      `DELETE FROM cards WHERE category_id = ? AND sequence_index > ?`,
      [categoryId, finalCount]
    );

    const catName = queryOneFn(db, 'SELECT title FROM categories WHERE id = ?', [categoryId])?.title || categoryId;
    console.log(`[SYNC] Вкладка/Категория "${catName}" (slug: ${catInfo.slug}, ID: ${categoryId}): ${finalCount} карточек.`);
  }

  persistDbFn();
  console.log(`[SYNC] Синхронизация завершена. Всего актуальных карточек: ${totalCardsSynced}.\n`);
  return totalCardsSynced;
}

function resolveCategoryInfo(folderName) {
  const clean = folderName.trim();
  const match = clean.match(/^(\d+)_(.+)$/);
  let sortOrder = 99;
  let rawName = clean;
  if (match) {
    sortOrder = parseInt(match[1], 10);
    rawName = match[2];
  }

  const lower = rawName.toLowerCase();
  let slug = lower.replace(/[^a-z0-9_-]/g, '-');
  let title = rawName.toUpperCase().replace(/[-_]/g, ' ');

  if (lower.includes('somatic') || lower.includes('соматик') || lower.includes('anomaly') || lower.includes('аномали')) {
    slug = 'somatics';
    title = 'СОМАТИКА';
    sortOrder = 1;
  } else if (lower.includes('cognitiv') || lower.includes('когнитив') || lower.includes('physics') || lower.includes('физик')) {
    slug = 'cognitivism';
    title = 'КОГНИТИВИСТИКА';
    sortOrder = 2;
  } else if (lower.includes('isolation') || lower.includes('изоляц') || lower.includes('protocol') || lower.includes('протокол')) {
    slug = 'isolation';
    title = 'ИЗОЛЯЦИЯ';
    sortOrder = 3;
  }

  return { sortOrder, slug, title };
}

// Прямой запуск из консоли (node src/db/syncCards.js)
if (process.argv[1] && process.argv[1].endsWith('syncCards.js')) {
  syncCardsFromFiles().then(() => process.exit(0));
}
