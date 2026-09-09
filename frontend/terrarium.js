// ============================================================
//  PROJECT S-A TERMINAL — БИО-ТЕРРАРИУМ АКСОЛОТЛЯ (v0.2a)
//  Тамагочи-симбионт + Медленный кликер с прокачкой
// ============================================================

(function() {
  'use strict';

  const STORAGE_KEY = 'SA_TERRARIUM_STATE_V1';

  // Начальное состояние
  const DEFAULT_STATE = {
    impulses: 0,
    clickPower: 1,
    autoRate: 0,           // Пассивный приход в сек
    satiety: 100,          // Сытость 0..100
    cleanliness: 100,      // Чистота 0..100
    lastUpdate: Date.now(),
    upgradeClickCost: 20,
    upgradeAutoCost: 50,
  };

  let state = { ...DEFAULT_STATE };

  // Загрузка состояния из LocalStorage
  function loadState() {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        state = { ...DEFAULT_STATE, ...parsed };
      }
    } catch (e) {
      console.warn('[TERRARIUM] Ошибка загрузки состояния:', e);
    }
    calcOfflineProgress();
  }

  // Сохранение состояния
  function saveState() {
    try {
      state.lastUpdate = Date.now();
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch (e) {
      console.warn('[TERRARIUM] Ошибка сохранения состояния:', e);
    }
  }

  // Расчёт оффлайн-прогресса
  function calcOfflineProgress() {
    const now = Date.now();
    const elapsedSec = Math.min((now - (state.lastUpdate || now)) / 1000, 8 * 3600); // макс 8 часов

    if (elapsedSec > 5 && state.autoRate > 0) {
      const gained = Math.floor(elapsedSec * state.autoRate);
      state.impulses += gained;
    }

    // Медленный расход сытости (полный цикл ~12 часов)
    const satietyDrain = (elapsedSec / (12 * 3600)) * 100;
    state.satiety = Math.max(0, state.satiety - satietyDrain);

    // Медленный расход чистоты (полный цикл ~16 часов)
    const cleanDrain = (elapsedSec / (16 * 3600)) * 100;
    state.cleanliness = Math.max(0, state.cleanliness - cleanDrain);

    state.lastUpdate = now;
  }

  // ── ГРАФИКА И АНИМАЦИЯ АКСОЛОТЛЯ (CANVAS 2D) ──────────────────
  let canvas = null;
  let ctx = null;
  let animId = null;

  // Положение и физика аксолотля
  const axo = {
    x: 160,
    y: 42,
    vx: 0.35,
    targetX: 160,
    facing: 1, // 1 вправо, -1 влево
    bobOffset: 0,
    blinkTimer: 0,
    isBlinking: false,
    wigglePhase: 0,
    reactionTimer: 0,
  };

  // Пузырьки в террариуме
  const bubbles = [];
  // Всплывающие надписи (+1 ⚡)
  const floaters = [];

  function initCanvas() {
    canvas = document.getElementById('axolotl-canvas');
    if (!canvas) return;
    ctx = canvas.getContext('2d');

    // Настраиваем размер с учетом плотности пикселей
    function resize() {
      if (!canvas) return;
      const rect = canvas.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) return;
      const dpr = window.devicePixelRatio || 1;
      canvas.width = Math.floor(rect.width * dpr);
      canvas.height = Math.floor(rect.height * dpr);
      ctx.imageSmoothingEnabled = false;
    }
    resize();
    window.addEventListener('resize', resize);

    // Инициализация фоновых пузырьков
    bubbles.length = 0;
    for (let i = 0; i < 7; i++) {
      bubbles.push({
        x: Math.random() * 320,
        y: Math.random() * 80,
        speed: 0.2 + Math.random() * 0.35,
        r: 1 + Math.random() * 1.5,
      });
    }

    // Интерактив: клик по террариуму
    const tankArea = document.getElementById('terrarium-tank');
    if (tankArea) {
      tankArea.addEventListener('click', onTankClick);
    }
  }

  // Обработка клика по террариуму (генерация импульса)
  function onTankClick(e) {
    state.impulses += state.clickPower;
    saveState();
    updateUI();

    // Реакция аксолотля
    axo.reactionTimer = 18; // кадра реакции
    if (Math.random() > 0.5) axo.vx = -axo.vx; // иногда меняет направление

    // Всплывающий текст с координатами клика
    const rect = canvas.getBoundingClientRect();
    const clickX = e.clientX ? (e.clientX - rect.left) : (rect.width / 2);
    const clickY = e.clientY ? (e.clientY - rect.top) : (rect.height / 2);

    floaters.push({
      x: clickX,
      y: clickY,
      text: `+${state.clickPower} ⚡`,
      alpha: 1.0,
      vy: -1.2,
    });

    // Добавляем 2 пузырька на месте клика
    bubbles.push({
      x: clickX + (Math.random() * 12 - 6),
      y: clickY,
      speed: 0.8 + Math.random() * 0.6,
      r: 2,
    });

    // Виброотклик Telegram
    if (window.Telegram?.WebApp?.HapticFeedback) {
      window.Telegram.WebApp.HapticFeedback.impactOccurred('light');
    }
  }

  // Отрисовка пиксельного Аксолотля
  function drawPixelAxolotl(c, x, y, scale, facing, isHappy, isBlink, wiggle) {
    c.save();
    c.translate(x, y);
    c.scale(facing * scale, scale);

    // Палитра пиксельного аксолотля (как на референсе)
    const C_BODY = '#ffb3cb';       // Розовое тело
    const C_BODY_SHADOW = '#f29ab5'; // Тень тела
    const C_GILLS = '#ff548e';      // Яркие внешние жабры
    const C_GILLS_DARK = '#cc2a64'; // Контур жабр
    const C_OUTLINE = '#111111';    // Темный контур
    const C_WHITE = '#ffffff';      // Блики
    const C_MOUTH = '#991e4a';      // Ротик

    const p = (px, py, w, h, col) => {
      c.fillStyle = col;
      c.fillRect(px, py, w, h);
    };

    // Хвостик сзади (слегка покачивается)
    const tailWiggle = Math.round(Math.sin(wiggle * 1.5) * 2);
    p(-22, -2 + tailWiggle, 6, 7, C_BODY);
    p(-24, -1 + tailWiggle, 2, 5, C_BODY_SHADOW);
    p(-22, -3 + tailWiggle, 6, 1, C_OUTLINE);
    p(-22, 5 + tailWiggle, 6, 1, C_OUTLINE);
    p(-25, 0 + tailWiggle, 1, 3, C_OUTLINE);

    // Маленькие лапки
    p(-10, 8, 4, 3, C_BODY);
    p(-10, 10, 4, 1, C_OUTLINE);
    p(6, 8, 4, 3, C_BODY);
    p(6, 10, 4, 1, C_OUTLINE);

    // Жабры-веточки (3 пары сзади головы)
    // Верхние жабры
    const gTop = Math.round(Math.sin(wiggle + 0) * 1.5);
    p(-8, -13 + gTop, 4, 5, C_GILLS);
    p(-10, -11 + gTop, 2, 4, C_GILLS_DARK);
    p(-6, -14 + gTop, 3, 2, C_OUTLINE);
    p(8, -13 - gTop, 4, 5, C_GILLS);
    p(10, -11 - gTop, 2, 4, C_GILLS_DARK);
    p(7, -14 - gTop, 3, 2, C_OUTLINE);

    // Средние жабры (длинные)
    const gMid = Math.round(Math.sin(wiggle + 1.2) * 2);
    p(-14, -6 + gMid, 6, 4, C_GILLS);
    p(-18, -5 + gMid, 4, 3, C_GILLS_DARK);
    p(-18, -6 + gMid, 5, 1, C_OUTLINE);
    p(-19, -4 + gMid, 1, 2, C_OUTLINE);
    p(-18, -2 + gMid, 5, 1, C_OUTLINE);

    p(12, -6 - gMid, 6, 4, C_GILLS);
    p(16, -5 - gMid, 4, 3, C_GILLS_DARK);
    p(15, -6 - gMid, 5, 1, C_OUTLINE);
    p(20, -4 - gMid, 1, 2, C_OUTLINE);
    p(15, -2 - gMid, 5, 1, C_OUTLINE);

    // Нижние жабры
    const gBot = Math.round(Math.sin(wiggle + 2.4) * 1.5);
    p(-12, 1 + gBot, 5, 4, C_GILLS);
    p(-15, 2 + gBot, 3, 3, C_GILLS_DARK);
    p(10, 1 - gBot, 5, 4, C_GILLS);
    p(14, 2 - gBot, 3, 3, C_GILLS_DARK);

    // Основное тело / Голова (широкий милый овал)
    p(-14, -8, 28, 16, C_BODY);
    p(-16, -6, 32, 12, C_BODY);

    // Нижняя тень
    p(-12, 6, 24, 2, C_BODY_SHADOW);

    // Внешний контур тела
    p(-12, -9, 24, 1, C_OUTLINE); // верх
    p(-12, 8, 24, 1, C_OUTLINE);  // низ
    p(-17, -5, 1, 10, C_OUTLINE); // лево
    p(16, -5, 1, 10, C_OUTLINE);  // право
    p(-16, -7, 2, 2, C_OUTLINE);
    p(-16, 5, 2, 2, C_OUTLINE);
    p(14, -7, 2, 2, C_OUTLINE);
    p(14, 5, 2, 2, C_OUTLINE);

    // Глазки
    if (isBlink) {
      // Моргание (узкая линия)
      p(-7, -1, 5, 1, C_OUTLINE);
      p(4, -1, 5, 1, C_OUTLINE);
    } else if (isHappy) {
      // Счастливые прищуренные глазки ^ ^
      p(-7, -2, 2, 1, C_OUTLINE);
      p(-5, -3, 2, 1, C_OUTLINE);
      p(-3, -2, 2, 1, C_OUTLINE);
      p(4, -2, 2, 1, C_OUTLINE);
      p(6, -3, 2, 1, C_OUTLINE);
      p(8, -2, 2, 1, C_OUTLINE);
    } else {
      // Большие черные глазки с белым бликом
      p(-7, -2, 5, 4, C_OUTLINE);
      p(-6, -2, 2, 2, C_WHITE); // блик
      p(4, -2, 5, 4, C_OUTLINE);
      p(5, -2, 2, 2, C_WHITE);  // блик
    }

    // Ротик (улыбка)
    p(-2, 3, 5, 1, C_MOUTH);
    p(-3, 2, 1, 1, C_MOUTH);
    p(3, 2, 1, 1, C_MOUTH);

    // Румянец на щечках
    p(-10, 1, 2, 1, C_GILLS);
    p(9, 1, 2, 1, C_GILLS);

    c.restore();
  }

  // Главный цикл рендеринга террариума
  function render(time) {
    if (!ctx || !canvas) return;

    const terrariumEl = document.getElementById('bio-terrarium');
    if (terrariumEl && (terrariumEl.style.display === 'none' || terrariumEl.offsetParent === null)) {
      animId = requestAnimationFrame(render);
      return;
    }

    if (canvas.width === 0 || canvas.height === 0) {
      const rect = canvas.getBoundingClientRect();
      if (rect.width > 0 && rect.height > 0) {
        const dpr = window.devicePixelRatio || 1;
        canvas.width = Math.floor(rect.width * dpr);
        canvas.height = Math.floor(rect.height * dpr);
        ctx.imageSmoothingEnabled = false;
      } else {
        animId = requestAnimationFrame(render);
        return;
      }
    }

    const w = canvas.width;
    const h = canvas.height;
    const dpr = window.devicePixelRatio || 1;

    ctx.clearRect(0, 0, w, h);

    // Фон террариума (чистая монохромная эстетика)
    const isLight = document.documentElement.getAttribute('data-theme') === 'light';
    ctx.fillStyle = isLight ? '#f2f2eb' : '#0e0e0e';
    ctx.fillRect(0, 0, w, h);

    // Водная рябь вверху (пиксельная тонкая линия)
    ctx.fillStyle = isLight ? '#d4d4cc' : '#222222';
    for (let x = 0; x < w; x += 8 * dpr) {
      const waveY = Math.sin((time * 0.003) + (x * 0.05)) * 1.5 * dpr;
      ctx.fillRect(x, 4 * dpr + waveY, 4 * dpr, 1 * dpr);
    }

    // Движение и отрисовка пузырьков
    ctx.fillStyle = isLight ? 'rgba(0, 0, 0, 0.25)' : 'rgba(255, 255, 255, 0.35)';
    bubbles.forEach(b => {
      b.y -= b.speed * dpr;
      if (b.y < 2) {
        b.y = (h / dpr) + 4;
        b.x = Math.random() * (w / dpr);
      }
      ctx.beginPath();
      ctx.arc(b.x * dpr, b.y * dpr, b.r * dpr, 0, Math.PI * 2);
      ctx.fill();
    });

    // Обновление логики движения аксолотля
    const logicalW = w / dpr;
    const logicalH = h / dpr;

    axo.wigglePhase = time * 0.004;

    // Плавное парение по вертикали
    axo.bobOffset = Math.sin(time * 0.003) * 3.5;

    // Горизонтальное плавание
    axo.x += axo.vx;
    if (axo.x > logicalW - 55) {
      axo.x = logicalW - 55;
      axo.vx = -Math.abs(axo.vx);
    } else if (axo.x < 55) {
      axo.x = 55;
      axo.vx = Math.abs(axo.vx);
    }
    axo.facing = axo.vx >= 0 ? 1 : -1;

    // Таймер моргания
    axo.blinkTimer++;
    if (axo.blinkTimer > 160) {
      axo.isBlinking = true;
      if (axo.blinkTimer > 172) {
        axo.isBlinking = false;
        axo.blinkTimer = 0;
      }
    }

    // Реакция на клик
    let isHappy = false;
    if (axo.reactionTimer > 0) {
      axo.reactionTimer--;
      isHappy = true;
    }

    // Отрисовываем аксолотля
    const drawScale = 1.35 * dpr;
    drawPixelAxolotl(
      ctx,
      axo.x * dpr,
      (axo.y + axo.bobOffset) * dpr,
      drawScale,
      axo.facing,
      isHappy,
      axo.isBlinking,
      axo.wigglePhase
    );

    // Отрисовка всплывающих надписей (+1 ⚡)
    for (let i = floaters.length - 1; i >= 0; i--) {
      const f = floaters[i];
      f.y += f.vy;
      f.alpha -= 0.025;

      if (f.alpha <= 0) {
        floaters.splice(i, 1);
        continue;
      }

      ctx.save();
      ctx.fillStyle = isLight
        ? `rgba(10, 10, 10, ${f.alpha})`
        : `rgba(255, 255, 255, ${f.alpha})`;
      ctx.font = `bold ${12 * dpr}px 'Space Mono', monospace`;
      ctx.textAlign = 'center';
      ctx.fillText(f.text, f.x * dpr, f.y * dpr);
      ctx.restore();
    }

    animId = requestAnimationFrame(render);
  }

  // ── ИГРОВОЙ ЦИКЛ (СЕКУНДНЫЙ ТАКТ) ─────────────────────────────
  function gameLoopTick() {
    // Пассивный доход авто-кликера
    if (state.autoRate > 0) {
      state.impulses += state.autoRate;
    }

    // Постепенное снижение показателей
    // Сытость -1% каждые 430 сек (~7 минут на 1%)
    state.satiety = Math.max(0, state.satiety - 0.025);
    // Чистота -1% каждые 570 сек (~9.5 минут на 1%)
    state.cleanliness = Math.max(0, state.cleanliness - 0.018);

    saveState();
    updateUI();
  }

  // ── ОБНОВЛЕНИЕ ИНТЕРФЕЙСА ─────────────────────────────────────
  function updateUI() {
    const impulsesDisp = document.getElementById('terrarium-impulses-display');
    if (impulsesDisp) {
      impulsesDisp.textContent = `${Math.floor(state.impulses)} ⚡`;
    }

    const labImpulses = document.getElementById('lab-impulses-val');
    if (labImpulses) {
      labImpulses.textContent = `${Math.floor(state.impulses)} ⚡`;
    }

    const labSatiety = document.getElementById('lab-satiety-val');
    if (labSatiety) {
      labSatiety.textContent = `${Math.round(state.satiety)}%`;
    }

    const labClean = document.getElementById('lab-cleanliness-val');
    if (labClean) {
      labClean.textContent = `${Math.round(state.cleanliness)}%`;
    }

    // Статус и настроение
    const moodLabel = document.getElementById('terrarium-mood-label');
    if (moodLabel) {
      if (state.satiety < 25) {
        moodLabel.textContent = 'СТАТУС: ГОЛОДЕН';
      } else if (state.cleanliness < 25) {
        moodLabel.textContent = 'СТАТУС: ЭНТРОПИЯ';
      } else {
        moodLabel.textContent = 'СТАТУС: СПОКОЙСТВИЕ';
      }
    }

    const syncLabel = document.getElementById('terrarium-sync-label');
    if (syncLabel) {
      const avg = Math.round((state.satiety + state.cleanliness) / 2);
      syncLabel.textContent = `СИНХР: ${avg}%`;
    }

    // Цены улучшений
    const clickCostEl = document.getElementById('upgrade-click-cost');
    if (clickCostEl) clickCostEl.textContent = `${state.upgradeClickCost} ⚡`;

    const clickValEl = document.getElementById('upgrade-click-val');
    if (clickValEl) clickValEl.textContent = `+${state.clickPower}`;

    const autoCostEl = document.getElementById('upgrade-auto-cost');
    if (autoCostEl) autoCostEl.textContent = `${state.upgradeAutoCost} ⚡`;

    const autoValEl = document.getElementById('upgrade-auto-val');
    if (autoValEl) autoValEl.textContent = `+${state.autoRate.toFixed(1)}`;
  }

  // ── НАСТРОЙКА КНОПОК ЛАБОРАТОРИИ ──────────────────────────────
  function setupLabModal() {
    const modal = document.getElementById('modal-terrarium-lab');
    const btnOpen = document.getElementById('btn-open-terrarium-lab');
    const btnClose = document.getElementById('btn-close-terrarium-lab');

    if (btnOpen && modal) {
      btnOpen.addEventListener('click', (e) => {
        e.stopPropagation();
        modal.style.display = 'flex';
        updateUI();
        if (window.Telegram?.WebApp?.HapticFeedback) {
          window.Telegram.WebApp.HapticFeedback.impactOccurred('light');
        }
      });
    }

    if (btnClose && modal) {
      btnClose.addEventListener('click', () => {
        modal.style.display = 'none';
        if (window.Telegram?.WebApp?.HapticFeedback) {
          window.Telegram.WebApp.HapticFeedback.impactOccurred('light');
        }
      });
    }

    // Кормление
    const btnFeed = document.getElementById('btn-feed-axolotl');
    if (btnFeed) {
      btnFeed.addEventListener('click', () => {
        state.satiety = Math.min(100, state.satiety + 30);
        saveState();
        updateUI();
        if (window.Telegram?.WebApp?.HapticFeedback) {
          window.Telegram.WebApp.HapticFeedback.notificationOccurred('success');
        }
      });
    }

    // Очистка
    const btnClean = document.getElementById('btn-clean-axolotl');
    if (btnClean) {
      btnClean.addEventListener('click', () => {
        state.cleanliness = 100;
        saveState();
        updateUI();
        if (window.Telegram?.WebApp?.HapticFeedback) {
          window.Telegram.WebApp.HapticFeedback.notificationOccurred('success');
        }
      });
    }

    // Апгрейд силы клика
    const btnUpClick = document.getElementById('btn-upgrade-click');
    if (btnUpClick) {
      btnUpClick.addEventListener('click', () => {
        if (state.impulses >= state.upgradeClickCost) {
          state.impulses -= state.upgradeClickCost;
          state.clickPower += 1;
          state.upgradeClickCost = Math.round(state.upgradeClickCost * 1.8);
          saveState();
          updateUI();
          if (window.Telegram?.WebApp?.HapticFeedback) {
            window.Telegram.WebApp.HapticFeedback.notificationOccurred('success');
          }
        } else {
          if (window.Telegram?.WebApp?.HapticFeedback) {
            window.Telegram.WebApp.HapticFeedback.notificationOccurred('error');
          }
        }
      });
    }

    // Апгрейд авто-клика
    const btnUpAuto = document.getElementById('btn-upgrade-auto');
    if (btnUpAuto) {
      btnUpAuto.addEventListener('click', () => {
        if (state.impulses >= state.upgradeAutoCost) {
          state.impulses -= state.upgradeAutoCost;
          state.autoRate += 0.5;
          state.upgradeAutoCost = Math.round(state.upgradeAutoCost * 1.7);
          saveState();
          updateUI();
          if (window.Telegram?.WebApp?.HapticFeedback) {
            window.Telegram.WebApp.HapticFeedback.notificationOccurred('success');
          }
        } else {
          if (window.Telegram?.WebApp?.HapticFeedback) {
            window.Telegram.WebApp.HapticFeedback.notificationOccurred('error');
          }
        }
      });
    }
  }

  // ── ТОЧКА ВХОДА МОДУЛЯ ────────────────────────────────────────
  function initTerrarium() {
    loadState();
    initCanvas();
    setupLabModal();
    updateUI();

    // Запуск цикла отрисовки
    if (canvas) {
      animId = requestAnimationFrame(render);
    }

    // Секундный игровой такт
    setInterval(gameLoopTick, 1000);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initTerrarium);
  } else {
    initTerrarium();
  }

})();
