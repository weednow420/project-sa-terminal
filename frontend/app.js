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

// ── TELEGRAM WEB APP ИНИЦИАЛИЗАЦИЯ ───────────────────────────
const tg = window.Telegram?.WebApp;

function initTelegram() {
  if (!tg) {
    console.warn('[TERMINAL] Telegram WebApp не найден. Режим разработки.');
    return null;
  }

  // Сообщаем Telegram что приложение готово
  tg.ready();

  // Разворачиваем на весь экран
  tg.expand();

  // Адаптируем тему: реагируем на colorScheme Telegram
  applyTheme(tg.colorScheme);

  // Подписка на смену темы (если пользователь переключит)
  tg.onEvent('themeChanged', () => applyTheme(tg.colorScheme));

  return tg;
}

function applyTheme(scheme) {
  // 'dark'  → консольная тема (по умолчанию в :root)
  // 'light' → E-ink тема ([data-theme="light"])
  // Монохром сохраняется в обоих случаях — только яркость меняется
  document.documentElement.setAttribute(
    'data-theme',
    scheme === 'light' ? 'light' : 'dark'
  );
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
        updateAdminUI(synced.is_admin);
        return synced;
      }
    }
  } catch (err) {
    console.warn('[TERMINAL] Ошибка синхронизации Оператора:', err);
  }
  return operator;
}

function updateAdminUI(isAdmin) {
  const adminSec = document.getElementById('admin-registry-section');
  if (adminSec) {
    adminSec.style.display = isAdmin ? 'block' : 'none';
  }
}

function renderOperatorId(operator) {
  const el = document.getElementById('operator-id');
  if (!el) return;
  const tag = operator.username ? `@${operator.username}` : `ID:${operator.id}`;

  // Номер Оператора отображается ТОЛЬКО у Администратора
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
    // Скролл наверх при смене вида
    document.querySelector('.terminal-main').scrollTop = 0;
  }
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

// ── РЕНДЕР КАТЕГОРИЙ ──────────────────────────────────────────
async function loadCategories() {
  showView('view-loading');

  try {
    const { data: categories } = await apiGet('/categories');
    renderCategories(categories);
    showView('view-categories');
  } catch (err) {
    showError(`ГРИМУАР НЕДОСТУПЕН. ${err.message}`, loadCategories);
  }
}

function renderCategories(categories) {
  const list = document.getElementById('category-list');
  list.innerHTML = '';

  if (!categories || categories.length === 0) {
    list.innerHTML = `
      <li class="category-item">
        <div style="padding:16px;color:var(--text-dim);font-size:0.75rem;">
          ГРИМУАР ПУСТ. КОНТЕНТ НЕ ЗАГРУЖЕН.
        </div>
      </li>`;
    return;
  }

  categories.forEach((cat, idx) => {
    const li = document.createElement('li');
    li.className = 'category-item';
    li.innerHTML = `
      <button aria-label="Открыть раздел ${cat.title}">
        <span class="category-index">${String(idx + 1).padStart(2, '0')}</span>
        <span>
          <span class="category-title">
            <span class="category-arrow">→</span>
            ${escHtml(cat.title)}
          </span>
          ${cat.description
            ? `<span class="category-desc">${escHtml(cat.description)}</span>`
            : ''}
        </span>
      </button>`;
    li.querySelector('button').addEventListener('click', () => {
      openCategory(cat);
    });
    list.appendChild(li);
  });
}

// ── РЕНДЕР КАРТОЧЕК В КАТЕГОРИИ ───────────────────────────────
async function openCategory(category) {
  STATE.currentCategory = category;
  showView('view-loading');

  try {
    const { data: cards } = await apiGet(`/categories/${category.slug}/cards`);
    renderCards(category, cards);
    showView('view-cards');
  } catch (err) {
    showError(`РАЗДЕЛ НЕДОСТУПЕН. ${err.message}`, loadCategories);
  }
}

function renderCards(category, cards) {
  // Breadcrumb
  document.getElementById('breadcrumb-category').textContent =
    category.title.toUpperCase();

  const list = document.getElementById('card-list');
  list.innerHTML = '';

  if (!cards || cards.length === 0) {
    list.innerHTML = `
      <li class="card-item">
        <div style="padding:12px 16px;color:var(--text-dim);font-size:0.75rem;">
          КАРТОЧКИ НЕ НАЙДЕНЫ.
        </div>
      </li>`;
    return;
  }

  // СТРОГО по sequence_index — сервер уже отдаёт в порядке
  // Визуально нумерация с 1 (принудительно)
  cards.forEach((card) => {
    const li = document.createElement('li');
    li.className = 'card-item';
    li.innerHTML = `
      <button aria-label="Карточка ${card.sequence_index}: ${card.title}">
        <span class="card-seq">§${String(card.sequence_index).padStart(2, '0')}</span>
        <span class="card-title-preview">${escHtml(card.title)}</span>
      </button>`;
    li.querySelector('button').addEventListener('click', () => {
      openCard(card);
    });
    list.appendChild(li);
  });
}

// ── РЕНДЕР ОДНОЙ КАРТОЧКИ ─────────────────────────────────────
function openCard(card) {
  STATE.currentCard = card;

  // Breadcrumb
  document.getElementById('breadcrumb-card-category').textContent =
    STATE.currentCategory?.title?.toUpperCase() || '──────';

  // Контент карточки
  const content = document.getElementById('card-detail-content');
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

  showView('view-card-detail');
}

// ── ЭКРАН ОШИБКИ b181 ─────────────────────────────────────────
function showError(message, retryFn) {
  document.getElementById('error-message').textContent = message;
  const retryBtn = document.getElementById('btn-retry');

  // Удаляем предыдущий обработчик
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

// ── РЕЕСТР ОПЕРАТОРОВ ─────────────────────────────────────────
let cachedOperatorsList = [];

async function loadRegistry() {
  if (!STATE.operator?.is_admin) {
    showError('[b181] ДОСТУП ЗАПРЕЩЁН. Раздел реестра доступен исключительно Администраторам.', loadCategories);
    return;
  }

  showView('view-loading');
  try {
    const res = await fetch(`${CONFIG.API_BASE}/operators`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        'ngrok-skip-browser-warning': 'true',
        'x-telegram-user-id': String(STATE.operator?.id || ''),
      },
    });

    if (res.status === 403) {
      showError('[b181] ДОСТУП ЗАПРЕЩЁН. Требуются права Администратора.', loadCategories);
      return;
    }

    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const { data } = await res.json();
    cachedOperatorsList = data || [];
    renderRegistry(cachedOperatorsList);
    showView('view-registry');
  } catch (err) {
    showError(`СБОЙ ЗАГРУЗКИ РЕЕСТРА: ${err.message}`, loadRegistry);
  }
}

function renderRegistry(operators) {
  const countEl = document.getElementById('registry-count');
  if (countEl) {
    countEl.textContent = `АКТИВНЫЕ БИО-ДАТЧИКИ: ${operators.length}`;
  }

  const list = document.getElementById('operator-list');
  if (!list) return;
  list.innerHTML = '';

  if (!operators || operators.length === 0) {
    list.innerHTML = `
      <li class="operator-card" style="text-align:center; padding:16px; color:var(--text-dim);">
        РЕЕСТР ПУСТ. НЕТ ЗАРЕГИСТРИРОВАННЫХ ОПЕРАТОРОВ.
      </li>`;
    return;
  }

  operators.forEach((op) => {
    const li = document.createElement('li');
    li.className = 'operator-card';
    const userTag = op.username ? `@${op.username}` : 'НЕ УКАЗАН';
    const opName = op.first_name || 'ОПЕРАТОР';

    li.innerHTML = `
      <div class="operator-card-header">
        <span class="operator-num">${op.display_number}</span>
        <span class="operator-code-badge">${op.operator_code}</span>
      </div>
      <div class="operator-grid">
        <span class="operator-grid-label">ПОЗЫВНОЙ:</span>
        <span class="operator-grid-val"><strong>${escHtml(opName)}</strong></span>
        <span class="operator-grid-label">TELEGRAM:</span>
        <span class="operator-grid-val">${escHtml(userTag)}</span>
        <span class="operator-grid-label">TG-ID:</span>
        <span class="operator-grid-val">${op.telegram_id}</span>
        <span class="operator-grid-label">КОНТАКТ:</span>
        <span class="operator-grid-val" style="color:var(--text-dim);">${op.first_seen_at || '—'}</span>
      </div>`;
    list.appendChild(li);
  });
}

// ── НАВИГАЦИЯ «НАЗАД» ─────────────────────────────────────────
function setupBackButtons() {
  document.getElementById('btn-back-to-categories')
    .addEventListener('click', loadCategories);

  const btnBackToGrimoire = document.getElementById('btn-back-to-grimoire');
  if (btnBackToGrimoire) {
    btnBackToGrimoire.addEventListener('click', loadCategories);
  }

  const btnOpenRegistry = document.getElementById('btn-open-registry');
  if (btnOpenRegistry) {
    btnOpenRegistry.addEventListener('click', loadRegistry);
  }

  const registrySearch = document.getElementById('registry-search-input');
  if (registrySearch) {
    registrySearch.addEventListener('input', (e) => {
      const q = e.target.value.trim().toLowerCase();
      if (!q) {
        renderRegistry(cachedOperatorsList);
        return;
      }
      const filtered = cachedOperatorsList.filter(op => {
        return (
          (op.display_number && op.display_number.toLowerCase().includes(q)) ||
          (op.operator_code && op.operator_code.toLowerCase().includes(q)) ||
          (op.username && op.username.toLowerCase().includes(q)) ||
          (op.first_name && op.first_name.toLowerCase().includes(q)) ||
          (String(op.telegram_id).includes(q))
        );
      });
      renderRegistry(filtered);
    });
  }

  document.getElementById('btn-back-to-cards')
    .addEventListener('click', () => {
      if (STATE.currentCategory) {
        openCategory(STATE.currentCategory);
      } else {
        loadCategories();
      }
    });
}

// ── ШЛЮЗ СИНХРОНИЗАЦИИ (ВВОД 4-ЗНАЧНОГО КОДА) ─────────────────
const AUTH_STORAGE_KEY = 'sa_terminal_synced';

function isAuthorized() {
  return localStorage.getItem(AUTH_STORAGE_KEY) === 'synced';
}

function showGate() {
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

  // 3. Настраиваем навигацию и клавиатуру шлюза
  setupBackButtons();
  setupPinGate();

  // 4. Проверка первичной синхронизации (авторизации)
  if (isAuthorized()) {
    await loadCategories();
  } else {
    showGate();
  }
}

// Запуск после загрузки DOM
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', main);
} else {
  main();
}
