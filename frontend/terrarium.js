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

  // ── ГРАФИКА И ДВА ХОЛСТА (МОРДОЧКА ВВЕРХУ + ЛАБОРАТОРИЯ) ───────
  let canvasFace = null;
  let ctxFace = null;
  let canvasLab = null;
  let ctxLab = null;
  let animId = null;

  // Анимация мордочки в верхнем меню
  const axoFace = {
    blinkTimer: 0,
    isBlinking: false,
    wigglePhase: 0,
    bobOffset: 0,
  };

  // Физика аксолотля в лаборатории
  const axoLab = {
    x: 140,
    y: 65,
    vx: 0.35,
    facing: 1,
    bobOffset: 0,
    blinkTimer: 0,
    isBlinking: false,
    wigglePhase: 0,
    reactionTimer: 0,
  };

  // Пузырьки и флоатеры лаборатории
  const labBubbles = [];
  const labFloaters = [];

  function initCanvases() {
    canvasFace = document.getElementById('axolotl-canvas-face');
    if (canvasFace) ctxFace = canvasFace.getContext('2d');

    canvasLab = document.getElementById('axolotl-canvas-lab');
    if (canvasLab) ctxLab = canvasLab.getContext('2d');

    function resizeAll() {
      const dpr = window.devicePixelRatio || 1;

      if (canvasFace) {
        const rect = canvasFace.getBoundingClientRect();
        if (rect.width > 0 && rect.height > 0) {
          canvasFace.width = Math.floor(rect.width * dpr);
          canvasFace.height = Math.floor(rect.height * dpr);
          if (ctxFace) ctxFace.imageSmoothingEnabled = false;
        }
      }

      if (canvasLab) {
        const rect = canvasLab.getBoundingClientRect();
        if (rect.width > 0 && rect.height > 0) {
          canvasLab.width = Math.floor(rect.width * dpr);
          canvasLab.height = Math.floor(rect.height * dpr);
          if (ctxLab) ctxLab.imageSmoothingEnabled = false;
        }
      }
    }

    resizeAll();
    window.addEventListener('resize', resizeAll);

    // Пузырьки для лаборатории
    labBubbles.length = 0;
    for (let i = 0; i < 9; i++) {
      labBubbles.push({
        x: Math.random() * 320,
        y: Math.random() * 120,
        speed: 0.3 + Math.random() * 0.4,
        r: 1.2 + Math.random() * 1.5,
      });
    }

    // Клик по лаборатории (верхняя мордочка строго некликабельна)
    const labArea = document.getElementById('lab-tank-area');
    if (labArea) {
      labArea.addEventListener('click', (e) => {
        handleTap(e, canvasLab, labFloaters, labBubbles, axoLab);
      });
    }
  }

  // Общий обработчик клика
  function handleTap(e, targetCanvas, floatersList, bubblesList, axoObj) {
    state.impulses += state.clickPower;
    saveState();
    updateUI();

    axoObj.reactionTimer = 20;
    if (Math.random() > 0.5) axoObj.vx = -axoObj.vx;

    let clickX = 100;
    let clickY = 20;
    if (targetCanvas) {
      const rect = targetCanvas.getBoundingClientRect();
      clickX = e.clientX ? (e.clientX - rect.left) : (rect.width / 2);
      clickY = e.clientY ? (e.clientY - rect.top) : (rect.height / 2);
    }

    floatersList.push({
      x: clickX,
      y: clickY,
      text: `+${state.clickPower} ⚡`,
      alpha: 1.0,
      vy: -1.0,
    });

    bubblesList.push({
      x: clickX + (Math.random() * 10 - 5),
      y: clickY,
      speed: 0.7 + Math.random() * 0.5,
      r: 1.8,
    });

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

  // ── ОТРИСОВКА ТОЛЬКО МОРДОЧКИ АКСОЛОТЛЯ (ВЕРХНЕЕ МЕНЮ) ─────────
  function drawAxolotlFace(c, cx, cy, scale, isHappy, isBlink, isDistressed, wiggle, isLight) {
    c.save();
    c.translate(Math.round(cx), Math.round(cy));
    c.scale(scale, scale);

    const C_BODY = '#ffb3cb';        // Нежно-розовая голова
    const C_BODY_SHADOW = '#f29ab5'; // Тень снизу
    const C_GILLS = '#ff548e';       // Веточки-жабры
    const C_GILLS_DARK = '#cc2a64';  // Внутренний акцент жабр
    const C_OUTLINE = isLight ? '#111111' : '#333333'; // Контур головы
    const C_FEATURE = '#111111';     // Глазки (всегда темные на розовом)
    const C_WHITE = '#ffffff';       // Блики в глазках
    const C_MOUTH = '#991e4a';       // Ротик
    const C_BLUSH = '#ff6599';       // Румянец на щечках

    const p = (px, py, w, h, col) => {
      c.fillStyle = col;
      c.fillRect(px, py, w, h);
    };

    // Жабры покачиваются
    const gTop = Math.round(Math.sin(wiggle) * 1.5);
    const gMid = Math.round(Math.sin(wiggle + 1.2) * 2);
    const gBot = Math.round(Math.sin(wiggle + 2.4) * 1.5);

    // Левые жабры
    // Верхняя
    p(-15, -11 + gTop, 4, 4, C_GILLS);
    p(-17, -10 + gTop, 2, 3, C_GILLS_DARK);
    p(-15, -12 + gTop, 4, 1, C_OUTLINE);
    // Средняя
    p(-19, -5 + gMid, 6, 4, C_GILLS);
    p(-22, -4 + gMid, 3, 3, C_GILLS_DARK);
    p(-22, -5 + gMid, 5, 1, C_OUTLINE);
    p(-23, -3 + gMid, 1, 2, C_OUTLINE);
    p(-22, -1 + gMid, 5, 1, C_OUTLINE);
    // Нижняя
    p(-17, 1 + gBot, 5, 3, C_GILLS);
    p(-19, 2 + gBot, 2, 2, C_GILLS_DARK);

    // Правые жабры
    // Верхняя
    p(11, -11 - gTop, 4, 4, C_GILLS);
    p(15, -10 - gTop, 2, 3, C_GILLS_DARK);
    p(11, -12 - gTop, 4, 1, C_OUTLINE);
    // Средняя
    p(13, -5 - gMid, 6, 4, C_GILLS);
    p(19, -4 - gMid, 3, 3, C_GILLS_DARK);
    p(17, -5 - gMid, 5, 1, C_OUTLINE);
    p(22, -4 - gMid, 1, 2, C_OUTLINE);
    p(17, -1 - gMid, 5, 1, C_OUTLINE);
    // Нижняя
    p(12, 1 - gBot, 5, 3, C_GILLS);
    p(17, 2 - gBot, 2, 2, C_GILLS_DARK);

    // Голова (овал)
    p(-13, -7, 26, 15, C_BODY);
    p(-15, -5, 30, 11, C_BODY);

    // Тень снизу головы
    p(-11, 6, 22, 2, C_BODY_SHADOW);

    // Контур головы
    p(-11, -8, 22, 1, C_OUTLINE); // верх
    p(-11, 8, 22, 1, C_OUTLINE);  // низ
    p(-16, -4, 1, 9, C_OUTLINE);  // лево
    p(15, -4, 1, 9, C_OUTLINE);   // право
    p(-15, -6, 2, 2, C_OUTLINE);  // скругления углов
    p(-15, 5, 2, 2, C_OUTLINE);
    p(13, -6, 2, 2, C_OUTLINE);
    p(13, 5, 2, 2, C_OUTLINE);

    // Румянец на щечках
    p(-9, 1, 3, 2, C_BLUSH);
    p(6, 1, 3, 2, C_BLUSH);

    // Глазки
    if (isBlink) {
      // Моргание: аккуратные горизонтальные черточки
      p(-7, 0, 4, 1, C_FEATURE);
      p(3, 0, 4, 1, C_FEATURE);
    } else if (isDistressed) {
      // Маленькие обеспокоенные глазки
      p(-6, -1, 3, 3, C_FEATURE);
      p(3, -1, 3, 3, C_FEATURE);
    } else if (isHappy) {
      // Радостные прищуренные глазки-дуги ^ ^
      p(-7, 0, 1, 2, C_FEATURE);
      p(-6, -1, 2, 1, C_FEATURE);
      p(-4, 0, 1, 2, C_FEATURE);
      p(3, 0, 1, 2, C_FEATURE);
      p(4, -1, 2, 1, C_FEATURE);
      p(6, 0, 1, 2, C_FEATURE);
    } else {
      // Большие милые черные глазки с белым бликом
      p(-7, -2, 4, 4, C_FEATURE);
      p(-6, -2, 2, 2, C_WHITE);
      p(3, -2, 4, 4, C_FEATURE);
      p(4, -2, 2, 2, C_WHITE);
    }

    // Ротик
    if (isDistressed) {
      p(-2, 3, 4, 1, C_MOUTH);
    } else {
      p(-2, 3, 4, 1, C_MOUTH);
      p(-3, 2, 1, 1, C_MOUTH);
      p(2, 2, 1, 1, C_MOUTH);
    }

    c.restore();
  }

  // ── РЕНДЕР ХОЛСТОВ ─────────────────────────────────────────────
  function render(time) {
    const isLight = document.documentElement.getAttribute('data-theme') === 'light';
    const bgCol = isLight ? '#f2f2eb' : '#0e0e0e';
    const waveCol = isLight ? '#d4d4cc' : '#222222';
    const bubbleCol = isLight ? 'rgba(0, 0, 0, 0.25)' : 'rgba(255, 255, 255, 0.35)';
    const textCol = isLight ? 'rgba(10, 10, 10, ' : 'rgba(255, 255, 255, ';

    const dpr = window.devicePixelRatio || 1;

    // 1. РЕНДЕР МОРДОЧКИ В ВЕРХНЕМ МЕНЮ (ПРОСТО МОРДОЧКА С АНИМАЦИЕЙ, НЕКЛИКАБЕЛЬНАЯ)
    const terrariumWrapper = document.getElementById('bio-terrarium');
    if (canvasFace && ctxFace && terrariumWrapper && terrariumWrapper.style.display !== 'none') {
      if (canvasFace.width === 0 || canvasFace.height === 0) {
        const rect = canvasFace.getBoundingClientRect();
        if (rect.width > 0 && rect.height > 0) {
          canvasFace.width = Math.floor(rect.width * dpr);
          canvasFace.height = Math.floor(rect.height * dpr);
          ctxFace.imageSmoothingEnabled = false;
        }
      }

      if (canvasFace.width > 0 && canvasFace.height > 0) {
        const w = canvasFace.width;
        const h = canvasFace.height;
        const logicalW = w / dpr;
        const logicalH = h / dpr;

        ctxFace.clearRect(0, 0, w, h);

        // Фазы дыхания и покачивания жабр
        axoFace.wigglePhase = time * 0.004;
        axoFace.bobOffset = Math.sin(time * 0.003) * 1.5;

        // Таймер моргания
        axoFace.blinkTimer++;
        if (axoFace.blinkTimer > 165) {
          axoFace.isBlinking = true;
          if (axoFace.blinkTimer > 177) {
            axoFace.isBlinking = false;
            axoFace.blinkTimer = 0;
          }
        }

        const isDistressed = state.satiety < 25 || state.cleanliness < 25;
        const isHappy = !isDistressed && (state.satiety > 70 && state.cleanliness > 70);

        const scaleFace = 1.0 * dpr;
        drawAxolotlFace(
          ctxFace,
          (logicalW / 2) * dpr,
          (logicalH / 2 + axoFace.bobOffset) * dpr,
          scaleFace,
          isHappy,
          axoFace.isBlinking,
          isDistressed,
          axoFace.wigglePhase,
          isLight
        );
      }
    }

    // 2. РЕНДЕР ЛАБОРАТОРИИ
    const labView = document.getElementById('view-terrarium-lab');
    if (canvasLab && ctxLab && labView && labView.classList.contains('active')) {
      if (canvasLab.width === 0 || canvasLab.height === 0) {
        const rect = canvasLab.getBoundingClientRect();
        if (rect.width > 0 && rect.height > 0) {
          canvasLab.width = Math.floor(rect.width * dpr);
          canvasLab.height = Math.floor(rect.height * dpr);
          ctxLab.imageSmoothingEnabled = false;
        }
      }

      if (canvasLab.width > 0 && canvasLab.height > 0) {
        const w = canvasLab.width;
        const h = canvasLab.height;
        const logicalW = w / dpr;
        const logicalH = h / dpr;

        ctxLab.clearRect(0, 0, w, h);
        ctxLab.fillStyle = bgCol;
        ctxLab.fillRect(0, 0, w, h);

        // Рябь вверху
        ctxLab.fillStyle = waveCol;
        for (let x = 0; x < w; x += 8 * dpr) {
          const waveY = Math.sin((time * 0.003) + (x * 0.05)) * 1.5 * dpr;
          ctxLab.fillRect(x, 4 * dpr + waveY, 4 * dpr, 1 * dpr);
        }

        // Пузырьки
        ctxLab.fillStyle = bubbleCol;
        labBubbles.forEach(b => {
          b.y -= b.speed * dpr;
          if (b.y < 2) {
            b.y = (h / dpr) + 4;
            b.x = Math.random() * logicalW;
          }
          ctxLab.beginPath();
          ctxLab.arc(b.x * dpr, b.y * dpr, b.r * dpr, 0, Math.PI * 2);
          ctxLab.fill();
        });

        // Движение крупного аксолотля
        axoLab.wigglePhase = time * 0.004;
        axoLab.bobOffset = Math.sin(time * 0.003) * 4;
        axoLab.x += axoLab.vx;

        const labPadding = 55;
        if (axoLab.x > logicalW - labPadding) {
          axoLab.x = logicalW - labPadding;
          axoLab.vx = -Math.abs(axoLab.vx);
        } else if (axoLab.x < labPadding) {
          axoLab.x = labPadding;
          axoLab.vx = Math.abs(axoLab.vx);
        }
        axoLab.facing = axoLab.vx >= 0 ? 1 : -1;

        axoLab.blinkTimer++;
        if (axoLab.blinkTimer > 160) {
          axoLab.isBlinking = true;
          if (axoLab.blinkTimer > 172) {
            axoLab.isBlinking = false;
            axoLab.blinkTimer = 0;
          }
        }

        let isHappyLab = false;
        if (axoLab.reactionTimer > 0) {
          axoLab.reactionTimer--;
          isHappyLab = true;
        }

        const scaleLab = 1.45 * dpr;
        drawPixelAxolotl(
          ctxLab,
          axoLab.x * dpr,
          (axoLab.y + axoLab.bobOffset) * dpr,
          scaleLab,
          axoLab.facing,
          isHappyLab,
          axoLab.isBlinking,
          axoLab.wigglePhase
        );

        // Флоатеры в лаборатории
        for (let i = labFloaters.length - 1; i >= 0; i--) {
          const f = labFloaters[i];
          f.y += f.vy;
          f.alpha -= 0.025;
          if (f.alpha <= 0) {
            labFloaters.splice(i, 1);
            continue;
          }
          ctxLab.save();
          ctxLab.fillStyle = `${textCol}${f.alpha})`;
          ctxLab.font = `bold ${13 * dpr}px 'Space Mono', monospace`;
          ctxLab.textAlign = 'center';
          ctxLab.fillText(f.text, f.x * dpr, f.y * dpr);
          ctxLab.restore();
        }
      }
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
    const formattedImpulses = `${Math.floor(state.impulses)} ⚡`;

    // Экран лаборатории
    const labImpulses = document.getElementById('lab-impulses-val');
    if (labImpulses) {
      labImpulses.textContent = formattedImpulses;
    }

    const labClickBadge = document.getElementById('lab-click-power-badge');
    if (labClickBadge) {
      labClickBadge.textContent = `+${state.clickPower} ⚡/ТАП`;
    }

    // Сытость
    const satVal = Math.round(state.satiety);
    const labSatVal = document.getElementById('lab-satiety-val');
    if (labSatVal) labSatVal.textContent = `${satVal}%`;

    const labSatBar = document.getElementById('lab-satiety-bar');
    if (labSatBar) labSatBar.style.width = `${satVal}%`;

    // Чистота
    const cleanVal = Math.round(state.cleanliness);
    const labCleanVal = document.getElementById('lab-cleanliness-val');
    if (labCleanVal) labCleanVal.textContent = `${cleanVal}%`;

    const labCleanBar = document.getElementById('lab-clean-bar');
    if (labCleanBar) labCleanBar.style.width = `${cleanVal}%`;

    // Статус настроения
    const statusTag = document.getElementById('lab-tank-status-tag');
    if (statusTag) {
      if (state.satiety < 25) {
        statusTag.textContent = 'СТАТУС: ГОЛОДЕН // СНИЖЕНИЕ ТОНУСА';
      } else if (state.cleanliness < 25) {
        statusTag.textContent = 'СТАТУС: ВЫСОКАЯ ЭНТРОПИЯ';
      } else {
        statusTag.textContent = 'СТАТУС: СПОКОЙСТВИЕ';
      }
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

  // ── НАСТРОЙКА КНОПОК ПРОТОКОЛОВ И ПРОКАЧКИ ─────────────────────
  function setupLabControls() {
    // Восполнение сытости: [ ИНФУЗИЯ: ТАЛАЯ ВОДА ]
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

    // Уборка среды: [ ФИЛЬТРАЦИЯ КОНТУРА ]
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

    // Улучшение силы клика
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

    // Улучшение авто-кликера
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
    initCanvases();
    setupLabControls();
    updateUI();

    animId = requestAnimationFrame(render);
    setInterval(gameLoopTick, 1000);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initTerrarium);
  } else {
    initTerrarium();
  }

})();
