// ============================================================
//  syncCards.js — Автоматическая синхронизация карточек из папки cards/
//  Поддержка разделов и вложенных подкатегорий (папок)
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
    return 0;
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
    const catName = catRow.title || catInfo.title;

    // Проверяем элементы внутри папки категории: есть ли подпапки (подкатегории)?
    const subEntries = readdirSync(fullPath);
    const subDirs = subEntries
      .filter(s => statSync(join(fullPath, s)).isDirectory() && !s.startsWith('.'))
      .sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' }));

    const rootFiles = subEntries
      .filter(f => statSync(join(fullPath, f)).isFile() && f.toLowerCase().endsWith('.txt') && !f.startsWith('.'))
      .sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' }));

    const activeSubcatsInDb = new Set();

    if (subDirs.length > 0) {
      // ── СЛУЧАЙ А: Раздел содержит подкатегории (подпапки) ─────
      for (const subDir of subDirs) {
        const subPath = join(fullPath, subDir);
        const subInfo = resolveSubcategoryInfo(subDir);
        activeSubcatsInDb.add(subInfo.slug);

        const files = readdirSync(subPath)
          .filter(f => f.toLowerCase().endsWith('.txt') && !f.startsWith('.'))
          .sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' }));

        let seqIndex = 1;
        for (const file of files) {
          const filePath = join(subPath, file);
          const parsed = parse(file);
          const title = parsed.name.trim();
          const bodyText = readFileSync(filePath, 'utf8').trim();

          if (!title || !bodyText) continue;

          runFn(
            db,
            `INSERT INTO cards (category_id, title, body_text, sequence_index, subcategory, subcategory_title, is_active)
             VALUES (?, ?, ?, ?, ?, ?, 1)
             ON CONFLICT(category_id, subcategory, sequence_index) DO UPDATE SET
               title = excluded.title,
               body_text = excluded.body_text,
               subcategory_title = excluded.subcategory_title,
               is_active = 1`,
            [categoryId, title, bodyText, seqIndex, subInfo.slug, subInfo.title]
          );

          seqIndex++;
          totalCardsSynced++;
        }

        const finalSubCount = seqIndex - 1;
        runFn(
          db,
          `DELETE FROM cards WHERE category_id = ? AND subcategory = ? AND sequence_index > ?`,
          [categoryId, subInfo.slug, finalSubCount]
        );

        console.log(`[SYNC]   ├─ Подкатегория "${subInfo.title}" (${subInfo.slug}): ${finalSubCount} карточек.`);
      }

      // Удаляем карточки подкатегорий, которых больше нет на диске
      const subSlugsArr = Array.from(activeSubcatsInDb);
      if (subSlugsArr.length > 0) {
        const placeholders = subSlugsArr.map(() => '?').join(',');
        runFn(
          db,
          `DELETE FROM cards WHERE category_id = ? AND subcategory != '' AND subcategory NOT IN (${placeholders})`,
          [categoryId, ...subSlugsArr]
        );
      }

      // Если в корне раздела больше нет файлов, очищаем старые корневые карточки
      if (rootFiles.length === 0) {
        runFn(
          db,
          `DELETE FROM cards WHERE category_id = ? AND (subcategory = '' OR subcategory IS NULL)`,
          [categoryId]
        );
      }
    }

    // Читаем также одиночные файлы в корне папки (если есть)
    if (rootFiles.length > 0 || subDirs.length === 0) {
      let rootSeqIndex = 1;
      for (const file of rootFiles) {
        const filePath = join(fullPath, file);
        const parsed = parse(file);
        const title = parsed.name.trim();
        const bodyText = readFileSync(filePath, 'utf8').trim();

        if (!title || !bodyText) continue;

        runFn(
          db,
          `INSERT INTO cards (category_id, title, body_text, sequence_index, subcategory, subcategory_title, is_active)
           VALUES (?, ?, ?, ?, '', '', 1)
           ON CONFLICT(category_id, subcategory, sequence_index) DO UPDATE SET
             title = excluded.title,
             body_text = excluded.body_text,
             subcategory_title = excluded.subcategory_title,
             is_active = 1`,
          [categoryId, title, bodyText, rootSeqIndex]
        );

        rootSeqIndex++;
        totalCardsSynced++;
      }

      const finalRootCount = rootSeqIndex - 1;
      runFn(
        db,
        `DELETE FROM cards WHERE category_id = ? AND subcategory = '' AND sequence_index > ?`,
        [categoryId, finalRootCount]
      );

      if (rootFiles.length > 0) {
        console.log(`[SYNC]   └─ Корневые карточки: ${finalRootCount}.`);
      }
    }

    console.log(`[SYNC] Раздел "${catName}" (slug: ${catInfo.slug}) синхронизирован.`);
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

  if (lower.includes('basis') || lower.includes('базис')) {
    slug = 'basis';
    title = 'БАЗИС';
    sortOrder = 0;
  } else if (lower.includes('somatic') || lower.includes('соматик') || lower.includes('anomaly') || lower.includes('аномали')) {
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

function resolveSubcategoryInfo(folderName) {
  const clean = folderName.trim();
  const match = clean.match(/^(\d+)_(.+)$/);
  let rawName = clean;
  if (match) {
    rawName = match[2];
  }

  const lower = rawName.toLowerCase();
  let slug = lower.replace(/[^a-z0-9_-]/g, '-');
  let title = rawName.toUpperCase().replace(/[-_]/g, ' ');

  if (lower.includes('classic') || lower.includes('класс')) {
    slug = 'classic';
    title = 'КЛАССИКА';
  } else if (lower.includes('esoteric') || lower.includes('эзотер')) {
    slug = 'esoterics';
    title = 'ЭЗОТЕРИКА';
  } else if (lower.includes('quantum') || lower.includes('квант')) {
    slug = 'quantum';
    title = 'КВАНТОВАЯ';
  }

  return { slug, title };
}

// Прямой запуск из консоли (node src/db/syncCards.js)
if (process.argv[1] && process.argv[1].endsWith('syncCards.js')) {
  syncCardsFromFiles().then(() => process.exit(0));
}
