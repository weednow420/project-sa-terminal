// ============================================================
//  PROJECT S-A TERMINAL — app.js
//  Telegram Mini App Frontend Logic
//  MVP Фаза 1: Режим Наблюдателя (Read-Only)
// ============================================================

// ── КОНФИГУРАЦИЯ ─────────────────────────────────────────────
const CONFIG = {
  // Автоматически берём хост с которого загружен фронтенд
  API_BASE:    `${window.location.origin}/api`,
  INCIDENT_CODE: 'b181',
};

// ── СОСТОЯНИЕ ПРИЛОЖЕНИЯ ──────────────────────────────────────
const STATE = {
  operator:              null,   // { id, username, first_name }
  categories:            [],
  currentCategory:       null,   // { slug, title }
  currentCategoryCards:  [],     // все карточки текущего раздела
  currentSubcategories:  [],     // доступные подкатегории текущего раздела
  currentSubcategory:    null,   // выбранная подкатегория
  currentCard:           null,   // { id, title, sequence_index }
  pinCode:               '',     // введенный 4-значный ключ
  pinBusy:               false,  // флаг процесса проверки ключа
};

// ── ТЕМА ОФОРМЛЕНИЯ (DARK / LIGHT E-INK) ─────────────────────
const THEME_STORAGE_KEY = 'sa_terminal_theme';

function getCurrentTheme() {
  const saved = localStorage.getItem(THEME_STORAGE_KEY);
  if (saved === 'light' || saved === 'dark') {
    return saved;
  }
  return tg?.colorScheme === 'light' ? 'light' : 'dark';
}

function applyTheme(scheme) {
  const theme = scheme === 'light' ? 'light' : 'dark';
  document.documentElement.setAttribute('data-theme', theme);

  const btn = document.getElementById('btn-theme-toggle');
  if (btn) {
    btn.textContent = theme === 'light' ? '[ТЕМА: СВЕТЛАЯ]' : '[ТЕМА: ТЁМНАЯ]';
  }

  // Обновляем цвет шапки Telegram
  if (tg?.setHeaderColor) {
    try {
      tg.setHeaderColor(theme === 'light' ? '#f5f5f0' : '#0a0a0a');
      tg.setBackgroundColor(theme === 'light' ? '#f5f5f0' : '#0a0a0a');
    } catch (_) {}
  }

  // Обновляем meta theme-color для браузера
  const metaTheme = document.querySelector('meta[name="theme-color"]');
  if (metaTheme) {
    metaTheme.setAttribute('content', theme === 'light' ? '#f5f5f0' : '#0a0a0a');
  }
}

function toggleTheme() {
  const current = document.documentElement.getAttribute('data-theme') || getCurrentTheme();
  const next = current === 'light' ? 'dark' : 'light';
  localStorage.setItem(THEME_STORAGE_KEY, next);
  applyTheme(next);
  if (window.SoundFX) window.SoundFX.playThemeSwitch();
  if (tg?.HapticFeedback) tg.HapticFeedback.impactOccurred('light');

  // Сохраняем в БД предпочтение темы
  if (STATE.operator?.id) {
    syncOperator({ ...STATE.operator, theme_preference: next });
  }
}

function setupThemeToggle() {
  const btn = document.getElementById('btn-theme-toggle');
  if (btn) {
    btn.addEventListener('click', toggleTheme);
  }
}

// ── TELEGRAM WEB APP ИНИЦИАЛИЗАЦИЯ ───────────────────────────
const tg = window.Telegram?.WebApp;

function initTelegram() {
  if (!tg) {
    console.warn('[TERMINAL] Telegram WebApp не найден. Режим разработки.');
  } else {
    // Сообщаем Telegram что приложение готово
    tg.ready();

    // Разворачиваем на весь экран
    tg.expand();

    // Подписка на системную смену темы (только если пользователь не выбрал вручную)
    tg.onEvent('themeChanged', () => {
      if (!localStorage.getItem(THEME_STORAGE_KEY)) {
        applyTheme(tg.colorScheme);
      }
    });
  }

  // Применяем текущую тему (из localStorage или от Telegram)
  applyTheme(getCurrentTheme());
  return tg;
}

// ── ДАННЫЕ ОПЕРАТОРА ──────────────────────────────────────────
function resolveOperator() {
  // Приоритет: реальные данные Telegram
  if (tg?.initDataUnsafe?.user) {
    const u = tg.initDataUnsafe.user;
    return {
      id:         u.id,
      username:   u.username   || null,
      first_name: u.first_name || 'ОПЕРАТОР',
    };
  }

  // Fallback для локальной разработки (без Telegram)
  console.warn('[TERMINAL] initDataUnsafe пуст. Используется dev-заглушка.');
  return {
    id:         0,
    username:   'dev_operator',
    first_name: 'DEV',
  };
}

async function syncOperator(operator) {
  if (operator?.id === undefined || operator?.id === null) return operator;
  try {
    const res = await fetch(`${CONFIG.API_BASE}/operator/sync`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'ngrok-skip-browser-warning': 'true',
        'x-telegram-init-data': tg?.initData || '',
      },
      body: JSON.stringify({
        telegram_id: operator.id,
        username: operator.username,
        first_name: operator.first_name,
        theme_preference: tg?.colorScheme || 'auto',
      }),
    });
    if (res.ok) {
      const json = await res.json();
      if (json.data) {
        const synced = { ...operator, ...json.data };
        
        // Если сервер запросил ввод ключа (сброс сессии пользователя или глобальный)
        if (synced.auth_required) {
          console.log('[AUTH] Сервер запросил повторный ввод ключа.');
          localStorage.removeItem(AUTH_STORAGE_KEY);
          localStorage.removeItem(AUTH_VERSION_KEY);
          showGate(synced.auth_version);
        }

        return synced;
      }
    }
  } catch (err) {
    console.warn('[TERMINAL] Ошибка синхронизации Оператора:', err);
  }
  return operator;
}

function renderOperatorId(operator) {
  const el = document.getElementById('operator-id');
  if (!el) return;
  const tag = operator.username ? `@${operator.username}` : `ID:${operator.id}`;

  if (operator.is_admin) {
    const num = operator.display_number || (operator.operator_number ? `№ ${String(operator.operator_number).padStart(4, '0')}` : '№ 0001');
    el.textContent = `[АДМИН] ${num} [${tag}]`.toUpperCase();
  } else {
    el.textContent = `ОПЕРАТОР: ${tag}`.toUpperCase();
  }
}

// ── НАВИГАЦИЯ МЕЖДУ ВИДАМИ ────────────────────────────────────
function showView(viewId) {
  document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
  const target = document.getElementById(viewId);
  if (target) {
    target.classList.add('active');
    const mainEl = document.querySelector('.terminal-main');
    if (mainEl) mainEl.scrollTop = 0;
  }

  // Полноэкранный моно-минималистичный шлюз (скрывает верхний/нижний хром)
  document.body.classList.toggle('gate-active', viewId === 'view-gate');

  // Управление био-террариумом (скрыт до ввода пароля и авторизации)
  const terrariumEl = document.getElementById('bio-terrarium');
  if (terrariumEl) {
    if (viewId === 'view-gate' || viewId === 'view-loading' || viewId === 'view-error' || !isAuthorized()) {
      terrariumEl.style.display = 'none';
    } else {
      terrariumEl.style.display = 'block';
      window.dispatchEvent(new Event('resize'));
    }
  }

  // Управление нижней панелью навигации (скрыта на экране авторизации/загрузки/ошибки)
  const bottomNav = document.getElementById('terminal-bottom-nav');
  if (bottomNav) {
    if (viewId === 'view-gate' || viewId === 'view-loading' || viewId === 'view-error') {
      bottomNav.style.display = 'none';
    } else {
      bottomNav.style.display = 'grid';
    }
  }

  // Обновляем состояние кнопок нижнего меню
  document.querySelectorAll('.bottom-nav-btn').forEach(btn => {
    const btnTarget = btn.getAttribute('data-view');
    if (btnTarget === viewId || (btn.id === 'nav-btn-basis' && viewId !== 'view-terrarium-lab')) {
      btn.classList.add('active');
    } else {
      btn.classList.remove('active');
    }
  });
}

// ── API ЗАПРОСЫ ───────────────────────────────────────────────
async function apiGet(path) {
  const response = await fetch(`${CONFIG.API_BASE}${path}`, {
    method: 'GET',
    headers: {
      'Content-Type': 'application/json',
      'ngrok-skip-browser-warning': 'true',
    },
  });

  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error(body.error || `HTTP ${response.status}`);
  }

  return response.json();
}

async function apiPost(path, data) {
  const response = await fetch(`${CONFIG.API_BASE}${path}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'ngrok-skip-browser-warning': 'true',
    },
    body: JSON.stringify(data),
  });

  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(body.message || body.error || `HTTP ${response.status}`);
  }

  return body;
}

// ── РЕНДЕР ГОРИЗОНТАЛЬНЫХ ВКЛАДОК И КАРТОЧЕК ──────────────────
async function loadCategories() {
  showView('view-loading');

  try {
    const { data: categories } = await apiGet('/categories');
    STATE.categories = categories || [];
    renderCategoryTabs(STATE.categories);

    if (STATE.categories.length > 0) {
      if (STATE.currentCategory) {
        const cat = STATE.categories.find(c => c.slug === STATE.currentCategory.slug);
        if (cat) await selectCategoryTab(cat);
      } else {
        // Не загружаем категорию по умолчанию, показываем приветствие
        const list = document.getElementById('category-cards-list');
        if (list) {
          list.style.display = 'flex';
          list.innerHTML = `
            <li class="card-item" style="border: none; background: transparent; text-align: center; padding-top: 40px;">
              <div style="font-size: 1.2rem; margin-bottom: 12px; color: var(--text-primary); font-weight: bold;">ТЕРМИНАЛ АКТИВЕН</div>
              <div style="color: var(--text-dim); font-size: 0.8rem; line-height: 1.5;">ИСПОЛЬЗУЙТЕ КНОПКУ [ БАЗИС ] ВНИЗУ ЭКРАНА<br>ДЛЯ ДОСТУПА КО ВСЕМ МОДУЛЯМ СИСТЕМЫ.</div>
            </li>
          `;
        }
      }
    } else {
      renderEmptyCards('БАЗИС ПУСТ. РАЗДЕЛЫ НЕ ЗАГРУЖЕНЫ.');
    }

    showView('view-categories');
  } catch (err) {
    showError(`БАЗИС НЕДОСТУПЕН. ${err.message}`, loadCategories);
  }
}

function renderCategoryTabs(categories) {
  const tabsBar = document.getElementById('category-tabs-bar');
  if (!tabsBar) return;
  tabsBar.innerHTML = '';

  // В верхнем подменю отображаются только разделы: СОМАТИКА, КОГНИТИВИСТИКА, ИЗОЛЯЦИЯ.
  // Переход в БАЗИС осуществляется исключительно через нижний док (кнопка БАЗИС / ΒΑΣΙΣ).
  const subMenuCategories = categories.filter(cat => cat.slug !== 'basis');

  subMenuCategories.forEach((cat) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'category-tab-btn';
    btn.setAttribute('data-slug', cat.slug);
    btn.textContent = cat.title.toUpperCase();
    btn.addEventListener('click', () => {
      if (STATE.currentCategory?.slug === cat.slug) return;
      selectCategoryTab(cat);
      if (tg?.HapticFeedback) tg.HapticFeedback.impactOccurred('light');
    });
    tabsBar.appendChild(btn);
  });
}

async function selectCategoryTab(category) {
  STATE.currentCategory = category;
  STATE.currentSubcategory = null;

  // Обновляем активный класс на кнопках вкладок
  const tabBtns = document.querySelectorAll('.category-tab-btn');
  tabBtns.forEach(btn => {
    if (btn.getAttribute('data-slug') === category.slug) {
      btn.classList.add('active');
    } else {
      btn.classList.remove('active');
    }
  });

  // Скрываем breadcrumb подкатегории
  const subcatBc = document.getElementById('subcat-breadcrumb');
  if (subcatBc) subcatBc.style.display = 'none';

  // Заголовок раздела и статус загрузки
  const titleEl = document.getElementById('current-tab-label');
  const countEl = document.getElementById('current-tab-count');
  if (titleEl) titleEl.textContent = `РАЗДЕЛ // ${category.title.toUpperCase()}`;
  if (countEl) countEl.textContent = 'ЗАГРУЗКА...';

  // Индикация загрузки карточек
  const subcatsMenu = document.getElementById('category-subcats-menu');
  const list = document.getElementById('category-cards-list');
  if (subcatsMenu) subcatsMenu.style.display = 'none';
  if (list) {
    list.style.display = 'flex';
    list.innerHTML = `
      <li class="card-item">
        <div style="padding:14px; color:var(--text-dim); font-size:0.75rem;">
          СКАНИРОВАНИЕ КОНТУРА...
        </div>
      </li>`;
  }

  try {
    const res = await apiGet(`/categories/${category.slug}/cards`);
    STATE.currentCategoryCards = res.data || [];
    STATE.currentSubcategories = res.subcategories || [];

    if (subcatsMenu) subcatsMenu.style.display = 'none';
    if (list) list.style.display = 'flex';
    renderCardsForCurrentTab(STATE.currentCategoryCards);
  } catch (err) {
    renderEmptyCards(`[b181] СБОЙ ЗАГРУЗКИ КАРТОЧЕК: ${err.message}`);
  }
}

function showSubcategoriesMenu() {
  STATE.currentSubcategory = null;

  const subcatBc = document.getElementById('subcat-breadcrumb');
  if (subcatBc) subcatBc.style.display = 'none';

  const titleEl = document.getElementById('current-tab-label');
  const countEl = document.getElementById('current-tab-count');
  if (titleEl) titleEl.textContent = `РАЗДЕЛ // ${STATE.currentCategory?.title?.toUpperCase() || ''}`;
  if (countEl) countEl.textContent = `ПОДРАЗДЕЛОВ: ${STATE.currentSubcategories.length}`;

  const cardsList = document.getElementById('category-cards-list');
  if (cardsList) cardsList.style.display = 'none';

  const subcatsMenu = document.getElementById('category-subcats-menu');
  if (!subcatsMenu) return;
  subcatsMenu.style.display = 'flex';
  subcatsMenu.innerHTML = '';

  const subcatDescriptions = {
    'classic': 'В традиционном понимании соматика — это область телесных практик и терапии, направленная на переобучение нервной системы. Главная идея заключается в том, что стресс, травмы и привычки создают хроническое мышечное напряжение («сенсомоторную амнезию»), которое человек перестает замечать.',
    'esoterics': 'Эзотерические и духовные традиции рассматривают соматику через призму энергетической анатомии. В этой парадигме физическое тело — это лишь самый плотный слой человеческого существа, который неразрывно связан с тонкими телами (эфирным, астральным, ментальным).',
    'quantum': 'В последние десятилетия на стыке науки и философии нью-эйдж возникло направление, которое часто называют «квантовым исцелением» (популяризировано такими авторами, как Дипак Чопра или Джо Диспенза).',
  };

  STATE.currentSubcategories.forEach((sub, idx) => {
    const desc = subcatDescriptions[sub.subcategory] || `Карточек протокола: ${sub.count}`;
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'subcat-menu-btn';
    btn.setAttribute('data-subcat', sub.subcategory);
    btn.innerHTML = `
      <div class="subcat-menu-btn-top">
        <span class="subcat-menu-btn-name">${escHtml(sub.subcategory_title || sub.subcategory)}</span>
        <span class="subcat-menu-btn-arrow">${sub.count} КАРТОЧЕК →</span>
      </div>
      <div class="subcat-menu-btn-desc">${escHtml(desc)}</div>
    `;

    btn.addEventListener('click', () => {
      if (sub.subcategory === 'esoterics' || sub.subcategory === 'quantum') {
        showRestrictedBanner(sub.subcategory_title || sub.subcategory);
        return;
      }
      selectSubcategory(sub);
      if (tg?.HapticFeedback) tg.HapticFeedback.impactOccurred('light');
    });

    subcatsMenu.appendChild(btn);
  });
}

function selectSubcategory(sub) {
  if (sub.subcategory === 'esoterics' || sub.subcategory === 'quantum') {
    showRestrictedBanner(sub.subcategory_title || sub.subcategory);
    return;
  }
  STATE.currentSubcategory = sub;

  // Настройка хлебных крошек
  const subcatBc = document.getElementById('subcat-breadcrumb');
  const btnBack = document.getElementById('btn-back-to-subcats');
  const bcTitle = document.getElementById('breadcrumb-subcat-title');
  if (subcatBc) subcatBc.style.display = 'flex';
  if (btnBack) btnBack.textContent = `← ${STATE.currentCategory?.title?.toUpperCase() || 'РАЗДЕЛ'}`;
  if (bcTitle) bcTitle.textContent = (sub.subcategory_title || sub.subcategory).toUpperCase();

  // Заголовок
  const titleEl = document.getElementById('current-tab-label');
  if (titleEl) titleEl.textContent = `ПОДРАЗДЕЛ // ${(sub.subcategory_title || sub.subcategory).toUpperCase()}`;

  // Скрываем меню, показываем карточки
  const subcatsMenu = document.getElementById('category-subcats-menu');
  if (subcatsMenu) subcatsMenu.style.display = 'none';

  const cardsList = document.getElementById('category-cards-list');
  if (cardsList) cardsList.style.display = 'flex';

  const filteredCards = (STATE.currentCategoryCards || []).filter(c => c.subcategory === sub.subcategory);
  renderCardsForCurrentTab(filteredCards);
}

function renderCardsForCurrentTab(cards) {
  const countEl = document.getElementById('current-tab-count');
  if (countEl) countEl.textContent = `КАРТОЧЕК: ${cards.length}`;

  const list = document.getElementById('category-cards-list');
  if (!list) return;
  list.innerHTML = '';

  if (!cards || cards.length === 0) {
    renderEmptyCards('В ДАННОМ РАЗДЕЛЕ НЕТ КАРТОЧЕК.');
    return;
  }

  cards.forEach((card) => {
    const li = document.createElement('li');
    li.className = 'card-item';
    li.innerHTML = `
      <button aria-label="Карточка §${card.sequence_index}: ${card.title}">
        <span class="card-seq">§${String(card.sequence_index).padStart(2, '0')}</span>
        <span class="card-title-preview">${escHtml(card.title)}</span>
      </button>`;
    li.querySelector('button').addEventListener('click', () => {
      openCard(card);
    });
    list.appendChild(li);
  });
}

function renderEmptyCards(message) {
  const list = document.getElementById('category-cards-list');
  if (!list) return;
  list.innerHTML = `
    <li class="card-item">
      <div style="padding:16px; color:var(--text-dim); font-size:0.75rem; text-align:center;">
        ${escHtml(message)}
      </div>
    </li>`;
}

// ── РЕНДЕР ОДНОЙ КАРТОЧКИ ─────────────────────────────────────
function openCard(card) {
  STATE.currentCard = card;

  // Breadcrumb
  const bc = document.getElementById('breadcrumb-card-category');
  if (bc) {
    if (card.subcategory_title) {
      bc.textContent = `${STATE.currentCategory?.title?.toUpperCase()} / ${card.subcategory_title.toUpperCase()}`;
    } else {
      bc.textContent = STATE.currentCategory?.title?.toUpperCase() || 'РАЗДЕЛ';
    }
  }

  // Контент карточки
  const content = document.getElementById('card-detail-content');
  if (content) {
    const subcatPart = card.subcategory_title ? ` // ${escHtml(card.subcategory_title.toUpperCase())}` : '';
    content.innerHTML = `
      <div class="card-detail-header">
        <div class="card-detail-seq">
          ПОСЛЕДОВАТЕЛЬНОСТЬ: §${String(card.sequence_index).padStart(2, '0')}
          &nbsp;&nbsp;|&nbsp;&nbsp;
          РАЗДЕЛ: ${escHtml(STATE.currentCategory?.title || '')}${subcatPart}
        </div>
        <h1 class="card-detail-title">${escHtml(card.title)}</h1>
      </div>
      <div class="dot-grid-divider"></div>
      <pre class="card-detail-body">${escHtml(card.body_text)}</pre>`;
  }

  showView('view-card-detail');
  updateCardBookmarkButton(card.id);
}

// ── ЭКРАН ОШИБКИ b181 ─────────────────────────────────────────
function showError(message, retryFn) {
  document.getElementById('error-message').textContent = message;
  const retryBtn = document.getElementById('btn-retry');

  const newBtn = retryBtn.cloneNode(true);
  retryBtn.parentNode.replaceChild(newBtn, retryBtn);
  newBtn.addEventListener('click', retryFn);

  showView('view-error');
  console.error(`[${CONFIG.INCIDENT_CODE}]`, message);
}

// ── ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ ───────────────────────────────────
function escHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// ── НАВИГАЦИЯ «НАЗАД» ─────────────────────────────────────────
function setupBackButtons() {
  const btnBack = document.getElementById('btn-back-to-tab');
  if (btnBack) {
    btnBack.addEventListener('click', () => {
      showView('view-categories');
    });
  }

  const btnBackSubcats = document.getElementById('btn-back-to-subcats');
  if (btnBackSubcats) {
    btnBackSubcats.addEventListener('click', () => {
      showSubcategoriesMenu();
      if (tg?.HapticFeedback) tg.HapticFeedback.impactOccurred('light');
    });
  }

  const btnBackObs = document.getElementById('btn-back-observations');
  if (btnBackObs) {
    btnBackObs.addEventListener('click', () => {
      showView('view-categories');
    });
  }

  const btnBackBms = document.getElementById('btn-back-bookmarks');
  if (btnBackBms) {
    btnBackBms.addEventListener('click', () => {
      showView('view-categories');
    });
  }

  const btnBackTools = document.getElementById('btn-back-tools');
  if (btnBackTools) {
    btnBackTools.addEventListener('click', () => {
      showView('view-categories');
    });
  }
}

// ── БАННЕР ОГРАНИЧЕНИЯ ДОСТУПА [b181] ────────────────────────
function showRestrictedBanner(subcatTitle = '') {
  const modal = document.getElementById('modal-access-restricted');
  const titleEl = document.getElementById('restricted-modal-title');
  if (titleEl) {
    titleEl.textContent = subcatTitle ? `ДОСТУП ОГРАНИЧЕН // ${subcatTitle.toUpperCase()}` : 'ДОСТУП ОГРАНИЧЕН';
  }
  if (modal) {
    modal.style.display = 'flex';
  }
  if (tg?.HapticFeedback) {
    tg.HapticFeedback.notificationOccurred('warning');
  }
}

function hideRestrictedBanner() {
  const modal = document.getElementById('modal-access-restricted');
  if (modal) {
    modal.style.display = 'none';
  }
  if (tg?.HapticFeedback) {
    tg.HapticFeedback.impactOccurred('light');
  }
}

function setupRestrictedModal() {
  const closeBtn = document.getElementById('btn-close-restricted-modal');
  const ackBtn = document.getElementById('btn-ack-restricted-modal');
  const overlay = document.getElementById('modal-access-restricted');

  if (closeBtn) closeBtn.addEventListener('click', hideRestrictedBanner);
  if (ackBtn) ackBtn.addEventListener('click', hideRestrictedBanner);
  if (overlay) {
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) {
        hideRestrictedBanner();
      }
    });
  }

  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      hideRestrictedBanner();
    }
  });
}

// ── ШЛЮЗ СИНХРОНИЗАЦИИ (ВВОД 4-ЗНАЧНОГО КОДА) ─────────────────
const AUTH_STORAGE_KEY = 'sa_terminal_synced';
const AUTH_VERSION_KEY = 'sa_terminal_auth_version';

function isAuthorized(serverVersion = null) {
  const isSynced = localStorage.getItem(AUTH_STORAGE_KEY) === 'synced';
  if (!isSynced) return false;

  // Если сервер вернул версию ключа — сверяем с локальной
  if (serverVersion !== null && serverVersion !== undefined) {
    const localVer = Number(localStorage.getItem(AUTH_VERSION_KEY) || 0);
    if (localVer !== Number(serverVersion)) {
      console.log(`[AUTH] Сброс сессии: версия сервера (v${serverVersion}) отличается от локальной (v${localVer}).`);
      localStorage.removeItem(AUTH_STORAGE_KEY);
      localStorage.removeItem(AUTH_VERSION_KEY);
      return false;
    }
  }
  return true;
}

function showGate(serverVersion = null) {
  const terrariumEl = document.getElementById('bio-terrarium');
  if (terrariumEl) terrariumEl.style.display = 'none';
  STATE.pinCode = '';
  STATE.pinBusy = false;
  updatePinSlots();
  appendSysLog('[GATE] Инициализация шлюза. Ожидание 4-значного ключа_');
  showView('view-gate');
}

function triggerHaptic(type = 'light') {
  try {
    if (tg?.HapticFeedback) {
      if (type === 'error') {
        tg.HapticFeedback.notificationOccurred('error');
      } else if (type === 'success') {
        tg.HapticFeedback.notificationOccurred('success');
      } else if (type === 'warning') {
        tg.HapticFeedback.notificationOccurred('warning');
      } else {
        tg.HapticFeedback.impactOccurred('light');
      }
    } else if (navigator.vibrate) {
      navigator.vibrate(type === 'error' ? [50, 40, 50] : 20);
    }
  } catch (_) {}
}

function appendSysLog(msg, type = 'normal') {
  const logBox = document.getElementById('sys-log');
  if (!logBox) return;

  const now = new Date();
  const timeStr = now.toTimeString().split(' ')[0];
  const entry = document.createElement('div');
  entry.className = 'gate-log-entry';

  if (type === 'error') {
    entry.className += ' gate-log-warn';
    entry.innerHTML = `&gt; ${timeStr} <span style="color:#ff5555;">${escHtml(msg)}</span>`;
  } else if (type === 'success') {
    entry.className += ' gate-log-active';
    entry.innerHTML = `&gt; ${timeStr} <span style="color:#38e892; font-weight:700;">${escHtml(msg)}</span>`;
  } else {
    entry.className += ' gate-log-dim';
    entry.innerHTML = `&gt; ${timeStr} ${escHtml(msg)}`;
  }

  logBox.appendChild(entry);
  while (logBox.children.length > 5) {
    logBox.removeChild(logBox.children[0]);
  }
}

let gateAttempts = 3;

function updatePinSlots() {
  const MAX_LEN = 4;
  const feedbackEl = document.getElementById('feedback-msg');
  const attemptsEl = document.getElementById('attempts-count');

  if (attemptsEl) attemptsEl.textContent = gateAttempts;

  for (let i = 0; i < MAX_LEN; i++) {
    const slot = document.getElementById(`slot-${i}`);
    if (!slot) continue;
    const charSpan = slot.querySelector('.pin-char') || slot.querySelector('.slot-char');
    slot.classList.remove('filled', 'active-slot', 'success', 'error');

    if (i < STATE.pinCode.length) {
      slot.classList.add('filled');
      if (charSpan) charSpan.textContent = '●';
    } else {
      if (charSpan) charSpan.textContent = '_';
    }
  }

  if (feedbackEl) {
    if (STATE.pinCode.length === 0) {
      feedbackEl.textContent = 'ОЖИДАНИЕ ВВОДА ОПЕРАТОРА';
      feedbackEl.className = 'swiss-feedback-msg';
    } else {
      feedbackEl.textContent = `ВВОД: ПОЗИЦИЯ ${STATE.pinCode.length} / 4`;
      feedbackEl.className = 'swiss-feedback-msg';
    }
  }
}

function setupPinGate() {
  const keypad = document.getElementById('pin-keypad');
  if (keypad) {
    keypad.addEventListener('click', (e) => {
      if (STATE.pinBusy) return;
      const btn = e.target.closest('button');
      if (!btn) return;

      const digit = btn.getAttribute('data-digit') || btn.getAttribute('data-val');
      if (digit !== null && digit !== undefined) {
        handleDigitInput(digit);
      }
    });
  }

  // Кнопка [ C ] / [ СБРОС ]
  const btnClear = document.getElementById('btn-clear') || document.getElementById('btn-pin-reset');
  if (btnClear) {
    btnClear.addEventListener('click', () => {
      if (STATE.pinBusy) return;
      STATE.pinCode = '';
      if (window.SoundFX) window.SoundFX.playKeyBackspace();
      triggerHaptic('light');
      updatePinSlots();
      appendSysLog('[GATE] Буфер ввода очищен.');
    });
  }

  // Кнопка [ ⌫ ] (Backspace)
  const btnBack = document.getElementById('btn-back') || document.getElementById('btn-pin-backspace');
  if (btnBack) {
    btnBack.addEventListener('click', () => {
      if (STATE.pinBusy) return;
      if (STATE.pinCode.length > 0) {
        STATE.pinCode = STATE.pinCode.slice(0, -1);
        if (window.SoundFX) window.SoundFX.playKeyBackspace();
        triggerHaptic('light');
        updatePinSlots();
      }
    });
  }

  // Кнопка [ СБРОС СЕССИИ ]
  const btnResetSession = document.getElementById('btn-gate-reset') || document.getElementById('btn-reset-session');
  if (btnResetSession) {
    btnResetSession.addEventListener('click', () => {
      gateAttempts = 3;
      STATE.pinCode = '';
      STATE.pinBusy = false;
      const badge = document.getElementById('status-badge');
      if (badge) {
        badge.innerHTML = '<span>[ SEC_LVL: 0 ]</span>';
        badge.className = 'swiss-gate-badge';
      }
      if (window.SoundFX) window.SoundFX.playKeyBackspace();
      triggerHaptic('light');
      updatePinSlots();
      const feedbackEl = document.getElementById('feedback-msg');
      if (feedbackEl) {
        feedbackEl.textContent = 'СЕССИЯ СБРОШЕНА // ОЖИДАНИЕ ВВОДА';
        feedbackEl.className = 'swiss-feedback-msg';
      }
    });
  }

  // Поддержка физической клавиатуры (ПК / браузер)
  window.addEventListener('keydown', (e) => {
    const gateView = document.getElementById('view-gate');
    if (!gateView || !gateView.classList.contains('active') || STATE.pinBusy) return;

    if (/^[0-9]$/.test(e.key)) {
      handleDigitInput(e.key);
    } else if (e.key === 'Backspace') {
      if (STATE.pinCode.length > 0) {
        STATE.pinCode = STATE.pinCode.slice(0, -1);
        if (window.SoundFX) window.SoundFX.playKeyBackspace();
        triggerHaptic('light');
        updatePinSlots();
      }
    } else if (e.key === 'Escape' || e.key === 'Delete') {
      STATE.pinCode = '';
      if (window.SoundFX) window.SoundFX.playKeyBackspace();
      triggerHaptic('light');
      updatePinSlots();
    }
  });
}

function setupResetButtons() {
  // Локальный сброс сессии (кнопка в шапке)
  const btnResetSession = document.getElementById('btn-reset-session');
  if (btnResetSession) {
    btnResetSession.addEventListener('click', () => {
      const terrariumEl = document.getElementById('bio-terrarium');
      if (terrariumEl) terrariumEl.style.display = 'none';
      localStorage.removeItem(AUTH_STORAGE_KEY);
      localStorage.removeItem(AUTH_VERSION_KEY);
      if (window.SoundFX) window.SoundFX.playKeyBackspace();
      triggerHaptic('warning');
      showGate();
    });
  }
}

function handleDigitInput(digit) {
  if (STATE.pinCode.length >= 4) return;
  STATE.pinCode += digit;
  if (window.SoundFX) window.SoundFX.playKeyClick(840 + STATE.pinCode.length * 40);
  triggerHaptic('light');
  updatePinSlots();

  if (STATE.pinCode.length === 4) {
    submitPin(STATE.pinCode);
  }
}

async function submitPin(code) {
  STATE.pinBusy = true;
  const feedbackEl = document.getElementById('feedback-msg');
  const badge = document.getElementById('status-badge');
  const attemptsEl = document.getElementById('attempts-count');

  if (feedbackEl) {
    feedbackEl.textContent = 'ВЕРИФИКАЦИЯ КЛЮЧА...';
    feedbackEl.className = 'swiss-feedback-msg';
  }

  try {
    const res = await apiPost('/auth/verify', {
      code,
      telegram_id: STATE.operator?.id || null,
    });

    // Успешная авторизация
    for (let i = 0; i < 4; i++) {
      const slot = document.getElementById(`slot-${i}`);
      if (slot) slot.classList.add('success');
    }
    if (window.SoundFX) window.SoundFX.playAccessGranted();
    triggerHaptic('success');

    if (feedbackEl) {
      feedbackEl.textContent = 'ДОСТУП РАЗРЕШЕН // СЕССИЯ АКТИВНА';
      feedbackEl.className = 'swiss-feedback-msg feedback-success';
    }
    if (badge) {
      badge.innerHTML = '<span>[ ДОПУСК РАЗРЕШЕН ]</span>';
      badge.className = 'swiss-gate-badge badge-granted';
    }

    localStorage.setItem(AUTH_STORAGE_KEY, 'synced');
    if (res.auth_version) {
      localStorage.setItem(AUTH_VERSION_KEY, String(res.auth_version));
    }

    setTimeout(async () => {
      await loadCategories();
    }, 600);

  } catch (err) {
    gateAttempts = Math.max(0, gateAttempts - 1);
    if (attemptsEl) attemptsEl.textContent = gateAttempts;

    for (let i = 0; i < 4; i++) {
      const slot = document.getElementById(`slot-${i}`);
      if (slot) slot.classList.add('error');
    }
    if (window.SoundFX) window.SoundFX.playAccessDenied();
    triggerHaptic('error');

    if (feedbackEl) {
      if (gateAttempts <= 0) {
        feedbackEl.textContent = 'ТЕРМИНАЛ ЗАБЛОКИРОВАН';
        feedbackEl.className = 'swiss-feedback-msg feedback-error';
        if (badge) {
          badge.innerHTML = '<span>[ БЛОКИРОВКА ]</span>';
          badge.className = 'swiss-gate-badge badge-locked';
        }
      } else {
        feedbackEl.textContent = `ОШИБКА: НЕДЕЙСТВИТЕЛЬНЫЙ КЛЮЧ (ОСТАЛОСЬ: ${gateAttempts})`;
        feedbackEl.className = 'swiss-feedback-msg feedback-error';
      }
    }

    setTimeout(() => {
      for (let i = 0; i < 4; i++) {
        const slot = document.getElementById(`slot-${i}`);
        if (slot) slot.classList.remove('error');
      }
      STATE.pinCode = '';
      STATE.pinBusy = false;
      updatePinSlots();
    }, 700);
  }
}

// ── ЗАКЛАДКИ (СОХРАНЕНИЕ КАРТОЧЕК В ПАМЯТЬ ТЕРМИНАЛА) ────────
const BOOKMARKS_STORAGE_KEY = 'sa_terminal_bookmarks';

function getBookmarks() {
  try {
    const raw = localStorage.getItem(BOOKMARKS_STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch (_) {
    return [];
  }
}

function saveBookmarks(bookmarks) {
  try {
    localStorage.setItem(BOOKMARKS_STORAGE_KEY, JSON.stringify(bookmarks));
  } catch (e) {
    console.error('[BOOKMARKS] Ошибка записи в localStorage:', e);
  }
}

function isCardBookmarked(cardId) {
  if (!cardId) return false;
  const list = getBookmarks();
  return list.some(b => String(b.id) === String(cardId));
}

function toggleBookmarkForCurrentCard() {
  if (!STATE.currentCard) return;
  const card = STATE.currentCard;
  let list = getBookmarks();
  const exists = list.some(b => String(b.id) === String(card.id));

  if (exists) {
    list = list.filter(b => String(b.id) !== String(card.id));
  } else {
    list.unshift({
      id: card.id,
      sequence_index: card.sequence_index,
      title: card.title,
      body_text: card.body_text,
      category_slug: STATE.currentCategory?.slug || '',
      category_title: STATE.currentCategory?.title || 'ГРИМУАР',
      saved_at: new Date().toISOString(),
    });
  }

  saveBookmarks(list);
  updateCardBookmarkButton(card.id);
  if (tg?.HapticFeedback) tg.HapticFeedback.impactOccurred('medium');
}

function updateCardBookmarkButton(cardId) {
  const btn = document.getElementById('btn-card-bookmark');
  if (!btn) return;
  const bookmarked = isCardBookmarked(cardId);
  if (bookmarked) {
    btn.classList.add('bookmarked');
    btn.textContent = '[ ★ В ЗАКЛАДКАХ ]';
  } else {
    btn.classList.remove('bookmarked');
    btn.textContent = '[ 🔖 В ЗАКЛАДКИ ]';
  }
}

function setupBookmarkButton() {
  const btn = document.getElementById('btn-card-bookmark');
  if (btn) {
    btn.addEventListener('click', toggleBookmarkForCurrentCard);
  }
}

function renderBookmarks() {
  const list = getBookmarks();
  const countEl = document.getElementById('bookmarks-count');
  if (countEl) {
    countEl.textContent = `ВСЕГО: ${list.length}`;
  }

  const listEl = document.getElementById('bookmarks-cards-list');
  if (!listEl) return;
  listEl.innerHTML = '';

  if (list.length === 0) {
    listEl.innerHTML = `
      <li class="card-item">
        <div style="padding: 24px; text-align: center; color: var(--text-dim); font-size: 0.75rem; line-height: 1.6;">
          НЕТ СОХРАНЁННЫХ КАРТОЧЕК.<br/>
          ОТКРОЙТЕ ЛЮБУЮ КАРТОЧКУ В ГРИМУАРЕ И НАЖМИТЕ [ 🔖 В ЗАКЛАДКИ ].
        </div>
      </li>`;
    return;
  }

  list.forEach(item => {
    const li = document.createElement('li');
    li.className = 'card-item';
    li.innerHTML = `
      <button aria-label="Закладка §${item.sequence_index}: ${item.title}">
        <span class="card-seq">§${String(item.sequence_index).padStart(2, '0')}</span>
        <span class="card-title-preview">${escHtml(item.title)}</span>
      </button>`;
    li.querySelector('button').addEventListener('click', () => {
      STATE.currentCategory = {
        slug: item.category_slug,
        title: item.category_title || 'ГРИМУАР',
      };
      openCard(item);
    });
    listEl.appendChild(li);
  });
}

// ── НАБЛЮДЕНИЯ: 1 - ИСТОЧНИК (ЛОКАЛЬНО) И 2 - ПОСЛАНИЕ (СЕРВЕР) ─
const SOURCE_NOTES_STORAGE_KEY = 'sa_terminal_source_notes';
const SENT_MESSAGES_STORAGE_KEY = 'sa_terminal_sent_messages';

// ── 1. ИСТОЧНИК: ЛОКАЛЬНЫЕ ЗАМЕТКИ ОПЕРАТОРА ──────────────────
function getSourceNotes() {
  try {
    const raw = localStorage.getItem(SOURCE_NOTES_STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch (_) {
    return [];
  }
}

function saveSourceNotes(notes) {
  try {
    localStorage.setItem(SOURCE_NOTES_STORAGE_KEY, JSON.stringify(notes));
  } catch (e) {
    console.error('[SOURCE] Ошибка сохранения заметок:', e);
  }
}

function renderSourceNotes() {
  const notes = getSourceNotes();
  const countEl = document.getElementById('source-notes-count');
  if (countEl) countEl.textContent = `ВСЕГО: ${notes.length}`;

  const listEl = document.getElementById('source-notes-list');
  if (!listEl) return;

  if (notes.length === 0) {
    listEl.innerHTML = `
      <div class="source-note-card" style="text-align:center; color:var(--text-dim); padding:20px;">
        ИСТОЧНИК ПУСТ.<br/>
        СОЗДАЙТЕ СВОЮ ПЕРВУЮ ЛОКАЛЬНУЮ ЗАМЕТКУ С ПОМОЩЬЮ ФОРМЫ ВЫШЕ.
      </div>`;
    return;
  }

  listEl.innerHTML = notes.map(note => {
    const d = new Date(note.created_at);
    const dateStr = isNaN(d.getTime())
      ? note.created_at
      : d.toLocaleDateString('ru-RU') + ' ' + d.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });

    return `
      <div class="source-note-card">
        <div class="source-note-header">
          <span>[ ${escHtml(dateStr)} ]</span>
          <button type="button" class="btn-note-delete" data-del-note="${escHtml(note.id)}">[ ⌫ УДАЛИТЬ ]</button>
        </div>
        ${note.title ? `<div class="source-note-title">${escHtml(note.title)}</div>` : ''}
        <div class="source-note-body">${escHtml(note.body)}</div>
      </div>
    `;
  }).join('');

  // Обработчики удаления
  listEl.querySelectorAll('[data-del-note]').forEach(btn => {
    btn.addEventListener('click', () => {
      const id = btn.getAttribute('data-del-note');
      deleteSourceNote(id);
    });
  });
}

function createSourceNote() {
  const titleInput = document.getElementById('input-source-title');
  const bodyInput = document.getElementById('input-source-body');
  if (!bodyInput) return;

  const body = bodyInput.value.trim();
  const title = titleInput ? titleInput.value.trim() : '';

  if (!body) {
    alert('Введите текст наблюдения');
    return;
  }

  const notes = getSourceNotes();
  const newNote = {
    id: String(Date.now()),
    title: title || (body.length > 30 ? body.slice(0, 30) + '...' : body),
    body,
    created_at: new Date().toISOString(),
  };

  notes.unshift(newNote);
  saveSourceNotes(notes);

  if (titleInput) titleInput.value = '';
  bodyInput.value = '';

  renderSourceNotes();
  if (tg?.HapticFeedback) tg.HapticFeedback.notificationOccurred('success');
}

function deleteSourceNote(id) {
  let notes = getSourceNotes();
  notes = notes.filter(n => n.id !== String(id));
  saveSourceNotes(notes);
  renderSourceNotes();
  if (tg?.HapticFeedback) tg.HapticFeedback.impactOccurred('medium');
}

// ── 2. ПОСЛАНИЕ: ОТПРАВКА НА СЕРВЕР И ЛОГИРОВАНИЕ ─────────────
function getSentMessagesHistory() {
  try {
    const raw = localStorage.getItem(SENT_MESSAGES_STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch (_) {
    return [];
  }
}

function saveSentMessagesHistory(list) {
  try {
    localStorage.setItem(SENT_MESSAGES_STORAGE_KEY, JSON.stringify(list));
  } catch (e) {
    console.error('[MESSAGES] Ошибка сохранения истории отправки:', e);
  }
}

function renderSentMessagesHistory() {
  const history = getSentMessagesHistory();
  const countEl = document.getElementById('sent-messages-count');
  if (countEl) countEl.textContent = `ОТПРАВЛЕНО: ${history.length}`;

  const listEl = document.getElementById('sent-messages-list');
  if (!listEl) return;

  if (history.length === 0) {
    listEl.innerHTML = `
      <div class="sent-msg-card" style="text-align:center; color:var(--text-dim); padding:20px;">
        НЕТ ОТПРАВЛЕННЫХ ПОСЛАНИЙ.<br/>
        НАПИШИТЕ СООБЩЕНИЕ В ФОРМЕ ВЫШЕ И НАЖМИТЕ [ ОТПРАВИТЬ НА СЕРВЕР ].
      </div>`;
    return;
  }

  listEl.innerHTML = history.map(item => {
    const d = new Date(item.created_at);
    const dateStr = isNaN(d.getTime())
      ? item.created_at
      : d.toLocaleDateString('ru-RU') + ' ' + d.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });

    return `
      <div class="sent-msg-card">
        <div class="sent-msg-header">
          <span>[ ${escHtml(dateStr)} ]</span>
          <span class="tag-badge">[ ЗАЛОГИРОВАНО НА СЕРВЕРЕ ]</span>
        </div>
        <div class="sent-msg-text">${escHtml(item.text)}</div>
      </div>
    `;
  }).join('');
}

async function sendServerMessage() {
  const input = document.getElementById('input-message-body');
  const statusEl = document.getElementById('message-send-status');
  const sendBtn = document.getElementById('btn-send-server-message');
  if (!input || !sendBtn) return;

  const text = input.value.trim();
  if (!text) {
    if (statusEl) {
      statusEl.textContent = 'ВВЕДИТЕ ТЕКСТ ПОСЛАНИЯ ДЛЯ ОТПРАВКИ';
      statusEl.className = 'message-send-status error';
      statusEl.style.display = 'block';
    }
    return;
  }

  sendBtn.disabled = true;
  sendBtn.textContent = '[ ОТПРАВКА СИГНАЛА... ]';
  if (statusEl) {
    statusEl.textContent = 'ПЕРЕДАЧА ПОСЛАНИЯ В СЕКТОР b181...';
    statusEl.className = 'message-send-status';
    statusEl.style.display = 'block';
  }

  try {
    const res = await apiPost('/messages', {
      text,
      telegram_id: STATE.operator?.id || null,
      username: STATE.operator?.username || null,
      first_name: STATE.operator?.first_name || null,
    });

    if (statusEl) {
      statusEl.textContent = '✓ ' + (res.message || 'СИГНАЛ ПРИНЯТ СЕРВЕРОМ // ЗАЛОГИРОВАНО');
      statusEl.className = 'message-send-status success';
      statusEl.style.display = 'block';
    }

    // Сохраняем в локальную историю отправленных
    const history = getSentMessagesHistory();
    history.unshift({
      id: res.data?.id || Date.now(),
      text,
      created_at: res.data?.created_at || new Date().toISOString(),
    });
    saveSentMessagesHistory(history);

    input.value = '';
    renderSentMessagesHistory();

    if (tg?.HapticFeedback) tg.HapticFeedback.notificationOccurred('success');

    setTimeout(() => {
      if (statusEl) statusEl.style.display = 'none';
    }, 4500);

  } catch (err) {
    if (statusEl) {
      statusEl.textContent = `[${CONFIG.INCIDENT_CODE}] ОШИБКА ОТПРАВКИ: ${err.message}`;
      statusEl.className = 'message-send-status error';
      statusEl.style.display = 'block';
    }
    if (tg?.HapticFeedback) tg.HapticFeedback.notificationOccurred('error');
  } finally {
    sendBtn.disabled = false;
    sendBtn.textContent = '[ 📡 ОТПРАВИТЬ ПОСЛАНИЕ НА СЕРВЕР ]';
  }
}

// ── ПЕРЕКЛЮЧЕНИЕ ПОДВКЛАДОК НАБЛЮДЕНИЙ ────────────────────────
function switchObservationsSubtab(subtab = 'source') {
  document.querySelectorAll('.obs-tab-btn').forEach(btn => {
    if (btn.getAttribute('data-subtab') === subtab) {
      btn.classList.add('active');
    } else {
      btn.classList.remove('active');
    }
  });

  const paneSource = document.getElementById('obs-pane-source');
  const paneMessage = document.getElementById('obs-pane-message');

  if (subtab === 'source') {
    if (paneSource) paneSource.style.display = 'block';
    if (paneMessage) paneMessage.style.display = 'none';
    renderSourceNotes();
  } else {
    if (paneSource) paneSource.style.display = 'none';
    if (paneMessage) paneMessage.style.display = 'block';

    // Обновляем плашку оператора
    const senderInfo = document.getElementById('obs-sender-info');
    if (senderInfo && STATE.operator) {
      const tag = STATE.operator.username ? `@${STATE.operator.username}` : `ID:${STATE.operator.id}`;
      senderInfo.textContent = `ОТПРАВИТЕЛЬ: ${STATE.operator.first_name || 'ОПЕРАТОР'} [${tag}]`;
    }

    renderSentMessagesHistory();
  }
}

function setupObservations() {
  const tabs = document.querySelectorAll('.obs-tab-btn');
  tabs.forEach(btn => {
    btn.addEventListener('click', () => {
      const subtab = btn.getAttribute('data-subtab');
      switchObservationsSubtab(subtab);
      if (tg?.HapticFeedback) tg.HapticFeedback.impactOccurred('light');
    });
  });

  // Кнопка сохранения локальной заметки
  const btnSaveNote = document.getElementById('btn-save-source-note');
  if (btnSaveNote) {
    btnSaveNote.addEventListener('click', () => {
      createSourceNote();
    });
  }

  // Кнопка отправки серверного сообщения
  const btnSendMsg = document.getElementById('btn-send-server-message');
  if (btnSendMsg) {
    btnSendMsg.addEventListener('click', () => {
      sendServerMessage();
    });
  }

  // Инициализация первой подвкладки
  switchObservationsSubtab('source');
}

// ── ИНСТРУМЕНТЫ (КАЛЬКУЛЯТОР ТАЛОЙ ВОДЫ, ТАРО) ────────────────
function calcMeltWater() {
  const input = document.getElementById('input-water-vol');
  const result = document.getElementById('water-calc-result');
  if (!input || !result) return;

  const vol = parseFloat(input.value);
  if (isNaN(vol) || vol <= 0) {
    result.innerHTML = `<span style="color:var(--text-warn);">ВВЕДИТЕ КОРРЕКТНЫЙ ОБЪЁМ ВОДЫ (ОТ 0.5 ДО 20 Л)</span>`;
    return;
  }

  // Расчет фракций:
  // 1. Дейтерий (тяжелая вода) ~5%
  // 2. Биологический полезный выход (чистый талый лед) ~72%
  // 3. Мутный рассол / примеси (сердцевина) ~23%
  const f1 = vol * 0.05;
  const f2 = vol * 0.72;
  const f3 = vol * 0.23;

  const tDeuteriumHours = (1.2 * Math.sqrt(vol)).toFixed(1);
  const tFullHours = (4.8 * Math.sqrt(vol)).toFixed(1);

  result.innerHTML = `
    <div style="font-weight:700; margin-bottom:8px; letter-spacing:0.06em;">
      РЕЗУЛЬТАТ РАСЧЕТА ДЛЯ ${vol.toFixed(1)} ЛИТРОВ:
    </div>
    <div style="display:flex; justify-content:space-between; margin-bottom:4px;">
      <span style="color:var(--text-dim);">1. СБРОС ДЕЙТЕРИЯ (ПЕРВЫЙ ЛЕД, +3.8°C):</span>
      <strong style="color:var(--text-warn);">${f1.toFixed(2)} Л (~5%)</strong>
    </div>
    <div style="display:flex; justify-content:space-between; margin-bottom:4px;">
      <span>2. ПОЛЕЗНЫЙ ТАЛЫЙ ВЫХОД (ЖИВОЙ ЛЕД):</span>
      <strong>${f2.toFixed(2)} Л (~72%)</strong>
    </div>
    <div style="display:flex; justify-content:space-between; margin-bottom:8px;">
      <span style="color:var(--text-dim);">3. СЕРДЦЕВИНА С ПРИМЕСЯМИ (МУТНЫЙ РАССОЛ):</span>
      <strong style="color:var(--text-warn);">${f3.toFixed(2)} Л (~23%)</strong>
    </div>
    <div style="border-top:1px dashed var(--border); padding-top:6px; margin-top:6px; font-size:0.68rem; color:var(--text-dim); line-height:1.5;">
      • До первой дейтериевой пленки: ~${tDeuteriumHours} ч (снять и выбросить)<br/>
      • До замерзания 75% объема: ~${tFullHours} ч (слить жидкую сердцевину)<br/>
      • Оставшийся кристалл растопить при комнатной температуре.
    </div>
  `;
}

const TAROT_CARDS = [
  {
    arcana: '0',
    name: 'ДУРАК // ИСХОДНЫЙ НУЛЬ',
    energy: 'НАЧАЛО ЦИКЛА',
    text: 'Чистый лист сознания. Сбросьте накопленные суждения, ожидания и ментальный шум. Доверьтесь первичному импульсу и шагните в неизведанное.',
  },
  {
    arcana: 'I',
    name: 'МАГ // ФОКУС ВОЛИ',
    energy: 'АКТИВНОЕ ДЕЙСТВИЕ',
    text: 'Все необходимые инструменты уже находятся в вашем распоряжении. Время структурировать окружающий хаос в четкий вектор направленного намерения.',
  },
  {
    arcana: 'II',
    name: 'ЖРИЦА // СЕНСОР ТИШИНЫ',
    energy: 'ИНТУИЦИЯ И ПАУЗА',
    text: 'Не предпринимайте резких внешних движений. Ответ находится глубже уровня вербализации. Внимайте скрытым сигналам и фоновому шуму.',
  },
  {
    arcana: 'IV',
    name: 'ИМПЕРАТОР // КАРКАС КОНТУРА',
    energy: 'ДИСЦИПЛИНА И СТРУКТУРА',
    text: 'Наведите порядок в биоритме, расписании и границах внимания. Четкие правила защищают энергию оператора от энтропии.',
  },
  {
    arcana: 'VII',
    name: 'КОЛЕСНИЦА // ВЕКТОР ПРОРЫВА',
    energy: 'УПРАВЛЕНИЕ СИЛАМИ',
    text: 'Две противоположные силы требуют балансировки. Удерживайте фокус на главной цели дня, не позволяя эмоциям сбить траекторию.',
  },
  {
    arcana: 'IX',
    name: 'ОТШЕЛЬНИК // ДЕПРИВАЦИЯ',
    energy: 'ВНУТРЕННИЙ СВЕТ',
    text: 'Ограничьте избыточный социальный и цифровой поток. Время глубокого погружения в собственную суть, самонаблюдения и тишины.',
  },
  {
    arcana: 'X',
    name: 'КОЛЕСО СУДЬБЫ // ЦИКЛ СИНХРОНИИ',
    energy: 'ДИНАМИЧЕСКИЙ СДВИГ',
    text: 'Не сопротивляйтесь изменениям обстоятельств. Контур разворачивается по большему фрактальному закону. Ловите волну момента.',
  },
  {
    arcana: 'XI',
    name: 'СПРАВЕДЛИВОСТЬ // БАЛАНС СИСТЕМЫ',
    energy: 'ПРИЧИНА И СЛЕДСТВИЕ',
    text: 'Каждое ваше действие и мысль отзываются в ткани контура. Принимайте решения с предельной честностью и взвешенностью.',
  },
  {
    arcana: 'XIV',
    name: 'УМЕРЕННОСТЬ // АЛХИМИЯ ТАЛОЙ ВОДЫ',
    energy: 'СИНТЕЗ И ТЕРПЕНИЕ',
    text: 'Соединение противоположностей, плавное протекание процессов. Не форсируйте результаты: внутренний кристалл формируется в покое.',
  },
  {
    arcana: 'XVII',
    name: 'ЗВЕЗДА // СВЕТ ОРИЕНТИРА',
    energy: 'ЯСНОСТЬ И НАДЕЖДА',
    text: 'Канал связи чист. Долгосрочный маяк сияет перед вами. Продолжайте движение в выбранном направлении без сомнений.',
  },
  {
    arcana: 'XXI',
    name: 'МИР // ИНТЕГРАЦИЯ КОНТУРА',
    energy: 'ЦЕЛОСТНОСТЬ',
    text: 'Гармоничное завершение цикла. Все разрозненные элементы складываются в единую картину. Вы находитесь в правильной точке времени.',
  },
];

function drawTarotCard() {
  const result = document.getElementById('tarot-card-result');
  if (!result) return;

  const card = TAROT_CARDS[Math.floor(Math.random() * TAROT_CARDS.length)];
  const now = new Date();
  const timeStr = now.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });

  result.style.display = 'block';
  result.innerHTML = `
    <div class="tarot-card-name">${escHtml(card.name)}</div>
    <div class="tarot-card-archetype">АРКАН [ ${escHtml(card.arcana)} ] // ФОКУС: ${escHtml(card.energy)} [${timeStr}]</div>
    <div class="obs-card-divider" style="margin:6px 0; color:var(--border);">────────────────────────────────</div>
    <div class="tarot-card-text">${escHtml(card.text)}</div>
  `;

  if (tg?.HapticFeedback) tg.HapticFeedback.notificationOccurred('success');
}

function setupTools() {
  // Кнопки в меню инструментов (открытие конкретного инструмента)
  document.querySelectorAll('.tool-menu-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const toolId = btn.getAttribute('data-tool');
      selectTool(toolId);
      if (tg?.HapticFeedback) tg.HapticFeedback.impactOccurred('light');
    });
  });

  // Верхние кнопки быстрого переключения (вкладки)
  document.querySelectorAll('.tool-tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const toolId = btn.getAttribute('data-tool');
      selectTool(toolId);
      if (tg?.HapticFeedback) tg.HapticFeedback.impactOccurred('light');
    });
  });

  // Кнопка возврата в список инструментов
  const btnBackTools = document.getElementById('btn-back-to-tools-list');
  if (btnBackTools) {
    btnBackTools.addEventListener('click', () => {
      selectTool('menu');
      if (tg?.HapticFeedback) tg.HapticFeedback.impactOccurred('light');
    });
  }

  // 01. Калькулятор талой воды
  const btnCalc = document.getElementById('btn-calc-water');
  if (btnCalc) {
    btnCalc.addEventListener('click', () => {
      calcMeltWater();
      if (tg?.HapticFeedback) tg.HapticFeedback.impactOccurred('light');
    });
  }

  // 02. Утренний расклад Таро
  const btnTarot = document.getElementById('btn-draw-tarot');
  if (btnTarot) {
    btnTarot.addEventListener('click', drawTarotCard);
  }

  // 03. Таймер дыхания (4-4-4)
  const btnBreathing = document.getElementById('btn-toggle-breathing');
  if (btnBreathing) {
    btnBreathing.addEventListener('click', toggleBreathingTimer);
  }

  // 04. Журнал инцидентов b181
  const btnScanInc = document.getElementById('btn-scan-incidents');
  if (btnScanInc) {
    btnScanInc.addEventListener('click', scanIncidents);
  }

  // 05. Калькулятор фаз сна
  const btnSleepNow = document.getElementById('btn-calc-sleep-now');
  if (btnSleepNow) {
    btnSleepNow.addEventListener('click', calcSleepNow);
  }
  const btnSleepWake = document.getElementById('btn-calc-sleep-wake');
  if (btnSleepWake) {
    btnSleepWake.addEventListener('click', calcSleepWake);
  }

  // Первоначальная инициализация
  calcMeltWater();
  renderIncidentLogs();
  selectTool('menu');
}

// ── НАВИГАЦИЯ ПО ИНСТРУМЕНТАМ ─────────────────────────────────
const TOOL_NAMES = {
  'menu': 'ИНСТРУМЕНТЫ',
  'water-calc': 'КАЛЬКУЛЯТОР ТАЛОЙ ВОДЫ',
  'tarot': 'УТРЕННИЙ РАСКЛАД ТАРО',
  'breathing': 'БИО-РИТМ ДЫХАНИЯ (4-4-4)',
  'incident-log': 'ЖУРНАЛ ИНЦИДЕНТОВ b181',
  'sleep-calc': 'КАЛЬКУЛЯТОР ФАЗ СНА',
};

function selectTool(toolId) {
  // Обновляем верхние вкладки быстрого переключения
  document.querySelectorAll('.tool-tab-btn').forEach(btn => {
    if (btn.getAttribute('data-tool') === toolId) {
      btn.classList.add('active');
    } else {
      btn.classList.remove('active');
    }
  });

  const menuList = document.getElementById('tools-menu-list');
  const btnBackTools = document.getElementById('btn-back-to-tools-list');

  if (toolId === 'menu') {
    if (menuList) menuList.style.display = 'flex';
    document.querySelectorAll('.tool-pane').forEach(p => p.style.display = 'none');
    if (btnBackTools) btnBackTools.style.display = 'none';
    return;
  }

  // Скрываем меню кнопок и показываем конкретный инструмент
  if (menuList) menuList.style.display = 'none';
  document.querySelectorAll('.tool-pane').forEach(p => p.style.display = 'none');

  const targetPane = document.getElementById(`tool-pane-${toolId}`);
  if (targetPane) {
    targetPane.style.display = 'block';
  }
  if (btnBackTools) btnBackTools.style.display = 'block';

  if (toolId === 'water-calc') {
    calcMeltWater();
  }
}

// ── 03. БИО-РИТМ ДЫХАНИЯ (4-4-4) ─────────────────────────────
const BREATHING_PHASES = [
  { name: 'ВДОХ (НАБОР ЭНЕРГИИ)', duration: 4 },
  { name: 'ЗАДЕРЖКА (ФИКСАЦИЯ)', duration: 4 },
  { name: 'ВЫДОХ (СБРОС НАПРЯЖЕНИЯ)', duration: 4 },
  { name: 'ПАУЗА (ТИШИНА КОНТУРА)', duration: 4 },
];

let breathingTimer = null;
let breathingPhaseIdx = 0;
let breathingSecondsLeft = 4;
let breathingCycles = 0;

function toggleBreathingTimer() {
  if (breathingTimer) {
    stopBreathingTimer();
  } else {
    startBreathingTimer();
  }
}

function startBreathingTimer() {
  const btn = document.getElementById('btn-toggle-breathing');
  if (btn) btn.textContent = '[ СТОП ЦИКЛА ДЫХАНИЯ ]';

  breathingPhaseIdx = 0;
  breathingSecondsLeft = 4;
  updateBreathingUI();

  if (tg?.HapticFeedback) tg.HapticFeedback.notificationOccurred('success');

  breathingTimer = setInterval(() => {
    breathingSecondsLeft--;
    if (breathingSecondsLeft <= 0) {
      breathingPhaseIdx = (breathingPhaseIdx + 1) % 4;
      breathingSecondsLeft = 4;
      if (breathingPhaseIdx === 0) {
        breathingCycles++;
      }
      if (tg?.HapticFeedback) tg.HapticFeedback.impactOccurred('medium');
    }
    updateBreathingUI();
  }, 1000);
}

function stopBreathingTimer() {
  if (breathingTimer) {
    clearInterval(breathingTimer);
    breathingTimer = null;
  }
  const btn = document.getElementById('btn-toggle-breathing');
  if (btn) btn.textContent = '[ СТАРТ ЦИКЛА ДЫХАНИЯ ]';
  const label = document.getElementById('breathing-phase-label');
  if (label) label.textContent = 'ФАЗА: ГОТОВНОСТЬ';
  const display = document.getElementById('breathing-timer-display');
  if (display) display.textContent = '04';
  const fill = document.getElementById('breathing-progress-fill');
  if (fill) fill.style.width = '0%';
}

function updateBreathingUI() {
  const phase = BREATHING_PHASES[breathingPhaseIdx];
  const label = document.getElementById('breathing-phase-label');
  if (label) label.textContent = `ФАЗА: ${phase.name}`;

  const display = document.getElementById('breathing-timer-display');
  if (display) display.textContent = String(breathingSecondsLeft).padStart(2, '0');

  const fill = document.getElementById('breathing-progress-fill');
  if (fill) {
    const pct = ((4 - breathingSecondsLeft) / 4) * 100;
    fill.style.width = `${pct}%`;
  }

  const cycles = document.getElementById('breathing-cycle-count');
  if (cycles) cycles.textContent = `ЦИКЛОВ ВЫПОЛНЕНО: ${breathingCycles}`;
}

// ── 04. ЖУРНАЛ ИНЦИДЕНТОВ b181 ───────────────────────────────
const DEFAULT_INCIDENT_LOGS = [
  { time: '02:14:09', text: 'ПАКЕТ #9182 // СИНХРОНИЗАЦИЯ БИО-ДАТЧИКА ВЫПОЛНЕНА' },
  { time: '01:42:15', text: 'СЕКТОР b181 // ФОНОВОЕ ДАВЛЕНИЕ В ПРЕДЕЛАХ НОРМЫ' },
  { time: '00:15:33', text: 'КАЛИБРОВКА // ПОГРЕШНОСТЬ ТАКТОВОГО ГЕНЕРАТОРА: 0.001%' },
  { time: '23:59:00', text: 'СИСТЕМНЫЙ ЛОГ // КОНТУР НАБЛЮДАТЕЛЯ АКТИВИРОВАН' },
];

function renderIncidentLogs() {
  const term = document.getElementById('incident-log-terminal');
  if (!term) return;
  term.innerHTML = DEFAULT_INCIDENT_LOGS.map(entry => `
    <div class="incident-log-entry">
      <span class="incident-log-time">[${escHtml(entry.time)}]</span>
      <span class="incident-log-text">${escHtml(entry.text)}</span>
    </div>
  `).join('');
}

function scanIncidents() {
  const btn = document.getElementById('btn-scan-incidents');
  if (!btn) return;

  btn.textContent = '[ СКАНИРОВАНИЕ КОНТУРА... ]';
  btn.disabled = true;

  if (tg?.HapticFeedback) tg.HapticFeedback.impactOccurred('light');

  setTimeout(() => {
    const now = new Date();
    const timeStr = now.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    const randNum = Math.floor(1000 + Math.random() * 9000);
    const msgs = [
      `ТЕЛЕМЕТРИЯ #${randNum} // АНОМАЛИЙ НЕ ОБНАРУЖЕНО. КОНТУР СТАБИЛЕН.`,
      `СКАНЕР СЕКТОРА b181 // УТЕЧКИ СИГНАЛА ОТСУТСТВУЮТ. ДЕВИАЦИЯ 0.00%.`,
      `ИМПУЛЬС #${randNum} // ПРОВОДИМОСТЬ КАНАЛА В НОРМЕ. БИО-СЕНСОР В ПОРЯДКЕ.`,
      `СИСТЕМА // ТАКТОВАЯ СИНХРОНИЗАЦИЯ УЗЛА УСПЕШНО ПОДТВЕРЖДЕНА.`,
    ];
    const chosen = msgs[Math.floor(Math.random() * msgs.length)];

    DEFAULT_INCIDENT_LOGS.unshift({ time: timeStr, text: chosen });
    renderIncidentLogs();

    btn.textContent = '[ СКАНИРОВАТЬ КОНТУР НА АНОМАЛИИ ]';
    btn.disabled = false;

    if (tg?.HapticFeedback) tg.HapticFeedback.notificationOccurred('success');
  }, 750);
}

// ── 05. КАЛЬКУЛЯТОР ФАЗ СНА ──────────────────────────────────
function calcSleepNow() {
  const resultDiv = document.getElementById('sleep-calc-result');
  if (!resultDiv) return;

  const now = new Date();
  now.setMinutes(now.getMinutes() + 15); // Время на засыпание (15 мин)

  let html = `<p style="margin-bottom:8px;">ОПТИМАЛЬНОЕ ВРЕМЯ ПРОБУЖДЕНИЯ (с учетом 15 мин на засыпание):</p><ul style="list-style:none; padding:0; line-height:1.8;">`;
  
  // Циклы по 90 минут (начиная с 6 циклов - 9 часов, и вниз до 3 циклов - 4.5 часа)
  for (let i = 6; i >= 3; i--) {
    const wakeup = new Date(now.getTime() + (i * 90 * 60000));
    const hh = String(wakeup.getHours()).padStart(2, '0');
    const mm = String(wakeup.getMinutes()).padStart(2, '0');
    const cycleStr = i === 6 ? '[ОПТИМУМ]' : (i === 5 ? '[НОРМА]' : '[КРИТИЧНО]');
    
    html += `<li><strong style="color:var(--text-color); font-size:1.1rem;">${hh}:${mm}</strong> — ${i} ЦИКЛОВ ${cycleStr}</li>`;
  }
  
  html += `</ul>`;
  resultDiv.innerHTML = html;
  resultDiv.style.display = 'block';

  if (tg?.HapticFeedback) tg.HapticFeedback.notificationOccurred('success');
}

function calcSleepWake() {
  const timeInput = document.getElementById('input-wake-time');
  const resultDiv = document.getElementById('sleep-calc-result');
  if (!timeInput || !resultDiv) return;

  if (!timeInput.value) {
    resultDiv.innerHTML = '<span class="status-indicator">■ ОШИБКА: НЕ УКАЗАНО ВРЕМЯ</span>';
    resultDiv.style.display = 'block';
    return;
  }

  const [hours, minutes] = timeInput.value.split(':').map(Number);
  const wakeTime = new Date();
  wakeTime.setHours(hours, minutes, 0, 0);

  // Если время меньше текущего, значит это следующий день (но мы работаем только с интервалами, так что неважно)
  
  let html = `<p style="margin-bottom:8px;">ЧТОБЫ ПРОСНУТЬСЯ В ${timeInput.value}, ЛОЖИТЕСЬ СПАТЬ В:</p><ul style="list-style:none; padding:0; line-height:1.8;">`;
  
  for (let i = 6; i >= 3; i--) {
    // 90 мин на цикл + 15 мин на засыпание = 105 мин (отсчитываем назад)
    const sleepTime = new Date(wakeTime.getTime() - (i * 90 * 60000) - (15 * 60000));
    const hh = String(sleepTime.getHours()).padStart(2, '0');
    const mm = String(sleepTime.getMinutes()).padStart(2, '0');
    const cycleStr = i === 6 ? '[ОПТИМУМ]' : (i === 5 ? '[НОРМА]' : '[КРИТИЧНО]');
    
    html += `<li><strong style="color:var(--text-color); font-size:1.1rem;">${hh}:${mm}</strong> — ${i} ЦИКЛОВ ${cycleStr}</li>`;
  }
  
  html += `</ul>`;
  resultDiv.innerHTML = html;
  resultDiv.style.display = 'block';

  if (tg?.HapticFeedback) tg.HapticFeedback.notificationOccurred('success');
}

// ── НИЖНЯЯ ПАНЕЛЬ НАВИГАЦИИ (DOCK) ───────────────────────────
function setupBottomNav() {
  const navBtns = document.querySelectorAll('.bottom-nav-btn');
  navBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      if (btn.id === 'nav-btn-basis') {
        const modal = document.getElementById('modal-main-menu');
        if (modal) modal.style.display = 'flex';
        if (tg?.HapticFeedback) tg.HapticFeedback.impactOccurred('light');
        return;
      }

      const targetView = btn.getAttribute('data-view');
      if (!targetView) return;

      const currentActive = document.querySelector('.view.active')?.id;

      if (currentActive === targetView) {
        if (tg?.HapticFeedback) tg.HapticFeedback.impactOccurred('light');
        return;
      }

      showView(targetView);
      if (tg?.HapticFeedback) tg.HapticFeedback.impactOccurred('light');

      // Инициализация контента при переходе
      if (targetView === 'view-categories') {
        const basisCat = STATE.categories.find(c => c.slug === 'basis') || STATE.categories[0];
        if (basisCat && STATE.currentCategory?.slug !== 'basis') {
          selectCategoryTab(basisCat);
        }
      } else if (targetView === 'view-observations') {
        const activeObsTab = document.querySelector('.obs-tab-btn.active')?.getAttribute('data-subtab') || 'source';
        switchObservationsSubtab(activeObsTab);
      } else if (targetView === 'view-bookmarks') {
        renderBookmarks();
      } else if (targetView === 'view-tools') {
        selectTool('menu');
      } else if (targetView === 'view-terrarium-lab') {
        window.dispatchEvent(new Event('resize'));
      }
    });
  });
}

function setupMainMenu() {
  const modal = document.getElementById('modal-main-menu');
  const btnClose = document.getElementById('btn-close-main-menu');

  if (btnClose && modal) {
    btnClose.addEventListener('click', () => {
      modal.style.display = 'none';
      if (tg?.HapticFeedback) tg.HapticFeedback.impactOccurred('light');
    });
  }

  document.querySelectorAll('.main-menu-item').forEach(btn => {
    btn.addEventListener('click', () => {
      const action = btn.getAttribute('data-menu-action');
      if (modal) modal.style.display = 'none';
      
      if (action === 'bookmarks') {
        showView('view-bookmarks');
        renderBookmarks();
      } else if (action === 'tools') {
        showView('view-tools');
        selectTool('menu');
      } else if (action === 'lab') {
        showView('view-terrarium-lab');
      } else if (action === 'observations') {
        showView('view-observations');
        const activeObsTab = document.querySelector('.obs-tab-btn.active')?.getAttribute('data-subtab') || 'source';
        switchObservationsSubtab(activeObsTab);
      } else {
        // Это одна из категорий: somatics, cognitivism, isolation
        showView('view-categories');
        const cat = STATE.categories.find(c => c.slug === action);
        if (cat) {
          selectCategoryTab(cat);
        }
      }
      
      if (tg?.HapticFeedback) tg.HapticFeedback.impactOccurred('light');
    });
  });
}


// ── ГЛАВНАЯ ТОЧКА ВХОДА ───────────────────────────────────────
async function main() {
  // 1. Инициализируем Telegram WebApp
  initTelegram();

  // 2. Получаем данные Оператора (бесшовно через Telegram)
  STATE.operator = resolveOperator();
  renderOperatorId(STATE.operator);

  // Синхронизация с БД — получение закрепленного номера Оператора (№ 0001 / OP-0001)
  syncOperator(STATE.operator).then((synced) => {
    STATE.operator = synced;
    renderOperatorId(STATE.operator);
  });

  // 3. Настраиваем навигацию, клавиатуру шлюза, кнопки сброса и тему
  setupBackButtons();
  setupPinGate();
  setupResetButtons();
  setupThemeToggle();
  setupBottomNav();
  setupMainMenu();
  setupBookmarkButton();
  setupObservations();
  setupTools();
  setupRestrictedModal();

  // 4. Проверяем серверную версию ключа
  let serverAuthVersion = 1;
  try {
    const status = await apiGet('/auth/status');
    if (status && status.auth_version) {
      serverAuthVersion = status.auth_version;
    }
  } catch (err) {
    console.warn('[AUTH] Проверка auth/status не удалась:', err);
  }

  // 5. Проверка первичной синхронизации (авторизации)
  if (isAuthorized(serverAuthVersion)) {
    await loadCategories();
  } else {
    showGate(serverAuthVersion);
  }
}

// Переключение вкладки спутника (CAT-01 vs b181) в лаборатории
window.switchSymbiontTab = function(type) {
  const catPane = document.getElementById('symbiont-section-cat');
  const axolotlPane = document.getElementById('symbiont-section-axolotl');
  const catTab = document.getElementById('tab-symbiont-cat');
  const axolotlTab = document.getElementById('tab-symbiont-axolotl');

  if (type === 'cat') {
    if (catPane) catPane.style.display = 'block';
    if (axolotlPane) axolotlPane.style.display = 'none';
    if (catTab) catTab.classList.add('active');
    if (axolotlTab) axolotlTab.classList.remove('active');
  } else {
    if (catPane) catPane.style.display = 'none';
    if (axolotlPane) axolotlPane.style.display = 'block';
    if (catTab) catTab.classList.remove('active');
    if (axolotlTab) axolotlTab.classList.add('active');
  }
  if (window.SoundFX && window.SoundFX.playKeyClick) {
    window.SoundFX.playKeyClick(960);
  }
};

// Запуск после загрузки DOM
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', main);
} else {
  main();
}
