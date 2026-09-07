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
  operator:        null,   // { id, username, first_name }
  currentCategory: null,   // { slug, title }
  currentCard:     null,   // { id, title, sequence_index }
  pinCode:         '',     // введенный 4-значный ключ
  pinBusy:         false,  // флаг процесса проверки ключа
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
    if (btn.getAttribute('data-view') === viewId) {
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
      // По умолчанию активна 1-я категория или ранее выбранная
      const defaultCat = STATE.currentCategory
        ? (STATE.categories.find(c => c.slug === STATE.currentCategory.slug) || STATE.categories[0])
        : STATE.categories[0];
      await selectCategoryTab(defaultCat);
    } else {
      renderEmptyCards('ГРИМУАР ПУСТ. РАЗДЕЛЫ НЕ ЗАГРУЖЕНЫ.');
    }

    showView('view-categories');
  } catch (err) {
    showError(`ГРИМУАР НЕДОСТУПЕН. ${err.message}`, loadCategories);
  }
}

function renderCategoryTabs(categories) {
  const tabsBar = document.getElementById('category-tabs-bar');
  if (!tabsBar) return;
  tabsBar.innerHTML = '';

  categories.forEach((cat) => {
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

  // Обновляем активный класс на кнопках вкладок
  const tabBtns = document.querySelectorAll('.category-tab-btn');
  tabBtns.forEach(btn => {
    if (btn.getAttribute('data-slug') === category.slug) {
      btn.classList.add('active');
    } else {
      btn.classList.remove('active');
    }
  });

  // Заголовок раздела и статус загрузки
  const titleEl = document.getElementById('current-tab-label');
  const countEl = document.getElementById('current-tab-count');
  if (titleEl) titleEl.textContent = `РАЗДЕЛ // ${category.title.toUpperCase()}`;
  if (countEl) countEl.textContent = 'ЗАГРУЗКА...';

  // Индикация загрузки карточек
  const list = document.getElementById('category-cards-list');
  if (list) {
    list.innerHTML = `
      <li class="card-item">
        <div style="padding:14px; color:var(--text-dim); font-size:0.75rem;">
          СКАНИРОВАНИЕ КАРТОЧЕК...
        </div>
      </li>`;
  }

  try {
    const { data: cards } = await apiGet(`/categories/${category.slug}/cards`);
    renderCardsForCurrentTab(cards || []);
  } catch (err) {
    renderEmptyCards(`[b181] СБОЙ ЗАГРУЗКИ КАРТОЧЕК: ${err.message}`);
  }
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
    bc.textContent = STATE.currentCategory?.title?.toUpperCase() || 'РАЗДЕЛ';
  }

  // Контент карточки
  const content = document.getElementById('card-detail-content');
  if (content) {
    content.innerHTML = `
      <div class="card-detail-header">
        <div class="card-detail-seq">
          ПОСЛЕДОВАТЕЛЬНОСТЬ: §${String(card.sequence_index).padStart(2, '0')}
          &nbsp;&nbsp;|&nbsp;&nbsp;
          РАЗДЕЛ: ${escHtml(STATE.currentCategory?.title || '')}
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
  STATE.pinCode = '';
  STATE.pinBusy = false;
  updatePinSlots();
  setGateStatus('ОЖИДАНИЕ ВВОДА КЛЮЧА СИНХРОНИЗАЦИИ...', 'normal');
  showView('view-gate');
}

function setGateStatus(text, type = 'normal') {
  const el = document.getElementById('gate-status');
  if (!el) return;
  el.textContent = text;
  el.className = 'gate-status';
  if (type === 'error') el.classList.add('error');
  if (type === 'success') el.classList.add('success');
}

function updatePinSlots() {
  const slots = document.querySelectorAll('.pin-slot');
  slots.forEach((slot, idx) => {
    if (idx < STATE.pinCode.length) {
      slot.classList.add('filled');
      slot.textContent = STATE.pinCode[idx];
    } else {
      slot.classList.remove('filled');
      slot.textContent = '_';
    }
  });
}

function setupPinGate() {
  const keypad = document.getElementById('pin-keypad');
  if (keypad) {
    keypad.addEventListener('click', (e) => {
      const btn = e.target.closest('.pin-key');
      if (!btn || STATE.pinBusy) return;
      const digit = btn.getAttribute('data-digit');
      if (digit !== null) {
        handleDigitInput(digit);
      }
    });
  }

  const clearBtn = document.getElementById('btn-pin-clear');
  if (clearBtn) {
    clearBtn.addEventListener('click', () => {
      if (STATE.pinBusy) return;
      if (STATE.pinCode.length > 0) {
        STATE.pinCode = STATE.pinCode.slice(0, -1);
        if (tg?.HapticFeedback) tg.HapticFeedback.impactOccurred('light');
        updatePinSlots();
        setGateStatus('ОЖИДАНИЕ ВВОДА КЛЮЧА СИНХРОНИЗАЦИИ...', 'normal');
      }
    });
  }

  // Поддержка физической клавиатуры (ПК / браузер)
  window.addEventListener('keydown', (e) => {
    const gateView = document.getElementById('view-gate');
    if (!gateView || !gateView.classList.contains('active') || STATE.pinBusy) return;

    // Клавиши 0-7, 9 (восьмерки 8 нет в раскладке)
    if (/^[0-79]$/.test(e.key)) {
      handleDigitInput(e.key);
    } else if (e.key === 'Backspace') {
      if (STATE.pinCode.length > 0) {
        STATE.pinCode = STATE.pinCode.slice(0, -1);
        if (tg?.HapticFeedback) tg.HapticFeedback.impactOccurred('light');
        updatePinSlots();
        setGateStatus('ОЖИДАНИЕ ВВОДА КЛЮЧА СИНХРОНИЗАЦИИ...', 'normal');
      }
    }
  });
}

function setupResetButtons() {
  // Локальный сброс сессии (кнопка в шапке)
  const btnResetSession = document.getElementById('btn-reset-session');
  if (btnResetSession) {
    btnResetSession.addEventListener('click', () => {
      localStorage.removeItem(AUTH_STORAGE_KEY);
      localStorage.removeItem(AUTH_VERSION_KEY);
      if (tg?.HapticFeedback) tg.HapticFeedback.impactOccurred('medium');
      showGate();
    });
  }
}

function handleDigitInput(digit) {
  if (STATE.pinCode.length >= 4) return;
  STATE.pinCode += digit;
  if (tg?.HapticFeedback) tg.HapticFeedback.impactOccurred('light');
  updatePinSlots();

  if (STATE.pinCode.length === 4) {
    submitPin(STATE.pinCode);
  }
}

async function submitPin(code) {
  STATE.pinBusy = true;
  setGateStatus('ПРОВЕРКА КЛЮЧА ДОСТУПА...', 'normal');

  try {
    const res = await apiPost('/auth/verify', {
      code,
      telegram_id: STATE.operator?.id || null,
    });

    setGateStatus(res.message || 'СИНХРОНИЗАЦИЯ УСПЕШНА // ДОСТУП РАЗРЕШЕН', 'success');
    if (tg?.HapticFeedback) tg.HapticFeedback.notificationOccurred('success');
    
    localStorage.setItem(AUTH_STORAGE_KEY, 'synced');
    if (res.auth_version) {
      localStorage.setItem(AUTH_VERSION_KEY, String(res.auth_version));
    }

    setTimeout(async () => {
      await loadCategories();
    }, 450);

  } catch (err) {
    setGateStatus(`[${CONFIG.INCIDENT_CODE}] ДОСТУП ОТКЛОНЕН // НЕВЕРНЫЙ КЛЮЧ`, 'error');
    if (tg?.HapticFeedback) tg.HapticFeedback.notificationOccurred('error');

    const container = document.querySelector('.gate-container');
    if (container) container.classList.add('gate-shake');

    setTimeout(() => {
      if (container) container.classList.remove('gate-shake');
      STATE.pinCode = '';
      STATE.pinBusy = false;
      updatePinSlots();
      setGateStatus('ОЖИДАНИЕ ВВОДА КЛЮЧА СИНХРОНИЗАЦИИ...', 'normal');
    }, 850);
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

// ── НАБЛЮДЕНИЯ (ВКЛАДКИ: 1 - ИСТОЧНИК, 2 - ПОСЛАНИЕ) ───────────
const OBSERVATIONS_DATA = {
  source: [
    {
      code: 'SRC-01',
      title: 'ПЕРВИЧНАЯ ТОПОЛОГИЯ ИСТОЧНИКА',
      status: 'СТАБИЛЕН',
      body: `Фиксация опорной частоты контура.\nМодуляция сигнала не зависит от внешних ретрансляторов.\n\nПри сканировании фонового поля оператором обнаружено резонансное плато. Источник не производит прямого акустического давления, но регистрируется био-сенсором в диапазоне альфа-ритма (7.83–8.2 Гц). Рекомендуется регулярная калибровка через талую воду.`,
    },
    {
      code: 'SRC-02',
      title: 'ВЕКТОР ПРИЕМА И ДЕВИАЦИЯ',
      status: 'В НОРМЕ',
      body: `Отношение сигнал/шум превышает критический порог 3.4 dB.\nУтечки пакетов в узле связи не зафиксировано.\n\nЛюбое искажение восприятия оператора (соматическая усталость, когнитивный шум) приводит к фазовому сдвигу. Для компенсации применяйте дыхательный паттерн и депривацию сенсорного потока.`,
    },
    {
      code: 'SRC-03',
      title: 'ЭНЕРГЕТИЧЕСКИЙ ГРАДИЕНТ',
      status: 'АКТИВЕН',
      body: `Показатели проводимости био-поля оператора соответствуют рабочему протоколу.\nРегулярная синхронизация сохраняет непрерывность наблюдательного слоя.`,
    },
  ],
  message: [
    {
      code: 'MSG-001',
      title: 'ДЕКОДИРОВАННЫЙ ТРАНСКРИПТ // ПЕРВЫЙ СЛОЙ',
      status: 'РАСШИФРОВАНО',
      body: `«Форма сосуда определяет геометрию жидкости.\nОсвобождение контура начинается с чистоты кристаллической решетки.»\n\nТрансляция зафиксирована в секторе b181. Сообщение ориентирует на поэтапное выведение дейтериевого балласта из организма и фиксацию внимания на внутренней тишине.`,
    },
    {
      code: 'MSG-002',
      title: 'ДЕКОДИРОВАННЫЙ ТРАНСКРИПТ // ВТОРОЙ СЛОЙ',
      status: 'ПРИЕМ',
      body: `«Наблюдатель не отделен от наблюдаемого.\nВсякий акт измерения меняет фазу принимаемого сигнала.»\n\nКонтур реагирует на каждое состояние оператора. Не пытайтесь форсировать интерпретацию символов — позвольте гримуару структурироваться естественным темпом.`,
    },
    {
      code: 'MSG-003',
      title: 'СИСТЕМНЫЙ СИГНАЛ // ТРЕТИЙ СЛОЙ',
      status: 'АРХИВ',
      body: `«Каждое утро восстанавливайте точку опоры.\nСинхронизируйте вектор воли с ритмом внешних циклов.»`,
    },
  ],
};

function renderObservations(subtab = 'source') {
  document.querySelectorAll('.obs-tab-btn').forEach(btn => {
    if (btn.getAttribute('data-subtab') === subtab) {
      btn.classList.add('active');
    } else {
      btn.classList.remove('active');
    }
  });

  const container = document.getElementById('observations-content');
  if (!container) return;

  const items = OBSERVATIONS_DATA[subtab] || [];
  if (items.length === 0) {
    container.innerHTML = `<div style="padding:20px; color:var(--text-dim); text-align:center;">ДАННЫЕ ДАННОГО СЛОЯ НЕ НАЙДЕНЫ</div>`;
    return;
  }

  container.innerHTML = items.map(item => `
    <div class="obs-card">
      <div class="obs-card-header">
        <span class="obs-card-code">[ ${escHtml(item.code)} ]</span>
        <span class="tag-badge">[ ${escHtml(item.status)} ]</span>
      </div>
      <h3 class="obs-card-title">${escHtml(item.title)}</h3>
      <div class="obs-card-body">${escHtml(item.body)}</div>
    </div>
  `).join('');
}

function setupObservations() {
  const tabs = document.querySelectorAll('.obs-tab-btn');
  tabs.forEach(btn => {
    btn.addEventListener('click', () => {
      const subtab = btn.getAttribute('data-subtab');
      renderObservations(subtab);
      if (tg?.HapticFeedback) tg.HapticFeedback.impactOccurred('light');
    });
  });
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
  const btnCalc = document.getElementById('btn-calc-water');
  if (btnCalc) {
    btnCalc.addEventListener('click', () => {
      calcMeltWater();
      if (tg?.HapticFeedback) tg.HapticFeedback.impactOccurred('light');
    });
  }

  const btnTarot = document.getElementById('btn-draw-tarot');
  if (btnTarot) {
    btnTarot.addEventListener('click', drawTarotCard);
  }

  // Предварительный расчет калькулятора по умолчанию
  calcMeltWater();
}

// ── НИЖНЯЯ ПАНЕЛЬ НАВИГАЦИИ (DOCK) ───────────────────────────
function setupBottomNav() {
  const navBtns = document.querySelectorAll('.bottom-nav-btn');
  navBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      const targetView = btn.getAttribute('data-view');
      const currentActive = document.querySelector('.view.active')?.id;

      if (currentActive === targetView) {
        // Повторный клик по активной вкладке возвращает в гримуар
        showView('view-categories');
        if (tg?.HapticFeedback) tg.HapticFeedback.impactOccurred('light');
        return;
      }

      showView(targetView);
      if (tg?.HapticFeedback) tg.HapticFeedback.impactOccurred('light');

      // Инициализация контента при переходе
      if (targetView === 'view-observations') {
        const activeObsTab = document.querySelector('.obs-tab-btn.active')?.getAttribute('data-subtab') || 'source';
        renderObservations(activeObsTab);
      } else if (targetView === 'view-bookmarks') {
        renderBookmarks();
      }
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
  setupBookmarkButton();
  setupObservations();
  setupTools();

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

// Запуск после загрузки DOM
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', main);
} else {
  main();
}
