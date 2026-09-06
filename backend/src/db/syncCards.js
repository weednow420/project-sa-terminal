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

    const categoryId = resolveCategoryId(entry);
    if (!categoryId) {
      console.warn(`[SYNC] Не удалось сопоставить категорию для папки: ${entry}`);
      continue;
    }

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
    console.log(`[SYNC] Категория "${catName}" (ID ${categoryId}): ${finalCount} карточек синхронизировано.`);
  }

  persistDbFn();
  console.log(`[SYNC] Синхронизация завершена. Всего актуальных карточек: ${totalCardsSynced}.\n`);
  return totalCardsSynced;
}

function resolveCategoryId(folderName) {
  const name = folderName.toLowerCase();
  if (name.startsWith('1') || name.includes('anomaly') || name.includes('аномали')) {
    return 1;
  }
  if (name.startsWith('2') || name.includes('physics') || name.includes('физик') || name.includes('процесс')) {
    return 2;
  }
  if (name.startsWith('3') || name.includes('protocol') || name.includes('протокол')) {
    return 3;
  }
  return null;
}

// Прямой запуск из консоли (node src/db/syncCards.js)
if (process.argv[1] && process.argv[1].endsWith('syncCards.js')) {
  syncCardsFromFiles().then(() => process.exit(0));
}
