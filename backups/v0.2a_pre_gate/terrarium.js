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

  // Спрайт Кибер-Симбионта b181 (из референса)
  const cyberSprite = new Image();
  cyberSprite.src = 'assets/cyber_axolotl.png';
  let cyberSpriteLoaded = false;
  cyberSprite.onload = () => {
    cyberSpriteLoaded = true;
  };

  // Анимация мордочки в верхнем меню
  const axoFace = {
    blinkTimer: 0,
    isBlinking: false,
    wigglePhase: 0,
    bobOffset: 0,
  };

  // Физика живого пиксельного кибер-аксолотля в лаборатории
  const axoLab = {
    x: 150,
    y: 75,
    vx: 0.42,
    facing: 1,
    bobOffset: 0,
    tiltAngle: 0,
    speedMultiplier: 1.0,
    blinkTimer: 0,
    isBlinking: false,
    reactionTimer: 0,
    bubbleTimer: 0,
  };

  // Пузырьки, флоатеры, сонарные волны и электрические искры
  const labBubbles = [];
  const labFloaters = [];
  const labSonarWaves = [];
  const labSparks = [];

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

    axoObj.reactionTimer = 32;
    axoObj.speedMultiplier = 2.4;
    if (Math.random() > 0.65) axoObj.vx = -axoObj.vx;

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

    // Гидроакустическая сонарная волна от тапа
    labSonarWaves.push({
      x: clickX,
      y: clickY,
      r: 3,
      maxR: 45,
      alpha: 0.9,
      speed: 1.3,
    });

    // Электрические искры при тапе по кибер-симбионту
    for (let s = 0; s < 7; s++) {
      const angle = Math.random() * Math.PI * 2;
      const spd = 1.6 + Math.random() * 2.4;
      labSparks.push({
        x: clickX,
        y: clickY,
        vx: Math.cos(angle) * spd,
        vy: Math.sin(angle) * spd,
        alpha: 1.0,
        color: Math.random() > 0.35 ? '#38e8d8' : '#50ffb0'
      });
    }

    if (window.Telegram?.WebApp?.HapticFeedback) {
      window.Telegram.WebApp.HapticFeedback.impactOccurred('light');
    }
  }

  // ── ПОЛНОРАЗМЕРНЫЙ ЖИВОЙ КИБЕР-СИМБИОНТ b181 (ЛАБОРАТОРИЯ) ─────
  function drawLiveCyberAxolotl(c, x, y, scale, facing, isHappy, isBlink, time, reactionTimer, isLight) {
    c.save();
    c.translate(Math.round(x), Math.round(y));
    c.scale(facing * scale, scale);

    // Палитра кибер-симбионта (в точности по референсу)
    const C_SHELL        = '#d2d9cc'; // Светло-костяная экзо-броня
    const C_SHELL_MID    = '#b4c2af'; // Полутень брони
    const C_SHELL_SHADOW = '#889882'; // Глубокая тень пластин
    const C_SEAM         = '#38483d'; // Швы и стыки брони
    const C_GLYPH        = '#232f28'; // Антенный рунический глиф
    const C_GILLS        = '#202e25'; // Механические ветви жабр
    const C_GILLS_LIGHT  = '#4f6657'; // Ребра жесткости жабр
    const C_CYAN         = '#38e8d8'; // Неоновые бирюзовые световоды
    const C_CYAN_HOT     = '#a3fff6'; // Бело-бирюзовая вспышка импульса
    const C_SOCKET       = '#081711'; // Черный колодец CRT-матрицы
    const C_LED          = reactionTimer > 0 ? '#50ffb0' : '#38e892'; // Зеленые фосфорные светодиоды
    const C_CHIP         = '#1b2620'; // Микрочип / радиатор на боку
    const C_OUTLINE      = isLight ? '#14221b' : '#1f2e26';

    const p = (px, py, w, h, col) => {
      c.fillStyle = col;
      c.fillRect(Math.round(px), Math.round(py), Math.round(w), Math.round(h));
    };

    // Скорость и фазы движения
    const swimSpeed = reactionTimer > 0 ? 0.009 : 0.0042;
    const wave = time * swimSpeed;
    const isTapped = reactionTimer > 0;

    // Расчет изгиба хвоста и позвоночника (многосегментная синусоида)
    const seg1_y = Math.sin(wave - 0.4) * 2.5; // Плечи
    const seg2_y = Math.sin(wave - 1.0) * 5.0; // Середина тела / бок
    const seg3_y = Math.sin(wave - 1.7) * 8.5; // Таз
    const seg4_y = Math.sin(wave - 2.5) * 13.0; // Средняя часть хвоста
    const seg5_y = Math.sin(wave - 3.4) * 18.0; // Кончик хвоста
    const seg6_y = Math.sin(wave - 4.2) * 23.0; // Плавниковый кончик

    // Бегущий световой импульс по спинному световоду (data bus packet)
    const packetSegment = Math.floor((time * 0.008) % 6);

    // ── 1. ДАЛЬНИЕ ЛАПКИ (ПРАВАЯ СТОРОНА ЗА ТЕЛОМ) ─────────────────
    // Передняя правая лапка (гребок)
    const paw1_angle = Math.sin(wave * 0.9 + 1.2) * 4;
    p(-6, -10 + seg1_y * 0.5 + paw1_angle, 6, 4, C_SHELL_SHADOW);
    p(-9, -13 + seg1_y * 0.5 + paw1_angle * 1.3, 4, 3, C_SHELL_MID);
    p(-12, -15 + seg1_y * 0.5 + paw1_angle * 1.5, 2, 2, C_SHELL);
    p(-10, -16 + seg1_y * 0.5 + paw1_angle * 1.5, 2, 2, C_SHELL);
    p(-8, -15 + seg1_y * 0.5 + paw1_angle * 1.5, 2, 2, C_SHELL);

    // Задняя правая лапка
    const paw2_angle = Math.sin(wave * 0.9 + 2.8) * 5;
    p(-28, -8 + seg3_y * 0.8 + paw2_angle, 7, 4, C_SHELL_SHADOW);
    p(-33, -11 + seg3_y * 0.8 + paw2_angle * 1.3, 5, 3, C_SHELL_MID);
    p(-37, -13 + seg3_y * 0.8 + paw2_angle * 1.5, 2, 2, C_SHELL);
    p(-35, -14 + seg3_y * 0.8 + paw2_angle * 1.5, 2, 2, C_SHELL);
    p(-33, -13 + seg3_y * 0.8 + paw2_angle * 1.5, 2, 2, C_SHELL);

    // ── 2. ХВОСТ И ПЛАВНИК (ИЗВИВАЕТСЯ ВОЛНОЙ) ─────────────────────
    // Сегмент 6 (Самый кончик хвоста)
    p(-56, -2 + seg6_y, 8, 4, C_SHELL_MID);
    p(-60, -1 + seg6_y, 4, 2, C_CYAN); // световод на самом острие
    p(-58, -5 + seg6_y, 10, 3, C_GILLS); // плавник сверху
    p(-58, 2 + seg6_y, 10, 3, C_GILLS);  // плавник снизу
    p(-56, -6 + seg6_y, 8, 1, C_OUTLINE);
    p(-56, 5 + seg6_y, 8, 1, C_OUTLINE);

    // Сегмент 5
    p(-48, -4 + seg5_y, 9, 8, C_SHELL_MID);
    p(-50, -3 + seg5_y, 2, 6, C_SHELL_SHADOW);
    p(-49, -8 + seg5_y, 11, 4, C_GILLS); // верхний плавник
    p(-49, 4 + seg5_y, 11, 4, C_GILLS);  // нижний плавник
    p(-47, -2 + seg5_y, 7, 2, packetSegment === 4 ? C_CYAN_HOT : C_CYAN);
    p(-49, -9 + seg5_y, 11, 1, C_OUTLINE);
    p(-49, 8 + seg5_y, 11, 1, C_OUTLINE);

    // Сегмент 4
    p(-39, -6 + seg4_y, 10, 12, C_SHELL);
    p(-41, -5 + seg4_y, 3, 10, C_SHELL_SHADOW);
    p(-40, -10 + seg4_y, 12, 4, C_GILLS); // верхний гребень
    p(-40, 6 + seg4_y, 12, 4, C_GILLS);   // нижний гребень
    p(-38, -2 + seg4_y, 8, 2, packetSegment === 3 ? C_CYAN_HOT : C_CYAN);
    p(-40, -11 + seg4_y, 12, 1, C_OUTLINE);
    p(-40, 10 + seg4_y, 12, 1, C_OUTLINE);

    // Сегмент 3 (Тазовая часть)
    p(-29, -8 + seg3_y, 11, 16, C_SHELL);
    p(-31, -7 + seg3_y, 3, 14, C_SHELL_SHADOW);
    p(-29, -12 + seg3_y, 11, 4, C_GILLS);
    p(-29, 8 + seg3_y, 11, 4, C_GILLS);
    p(-28, -2 + seg3_y, 9, 2, packetSegment === 2 ? C_CYAN_HOT : C_CYAN);
    p(-29, -7 + seg3_y, 1, 14, C_SEAM);

    // ── 3. ТУЛОВИЩЕ И ГРУДНАЯ ПЛАТА ────────────────────────────────
    // Сегмент 2 (Середина тела)
    p(-18, -10 + seg2_y, 12, 20, C_SHELL);
    p(-20, -9 + seg2_y, 3, 18, C_SHELL_SHADOW);
    p(-17, -13 + seg2_y, 10, 3, C_GILLS);
    p(-17, -2 + seg2_y, 10, 2, packetSegment === 1 ? C_CYAN_HOT : C_CYAN);
    // Микрочип / Радиатор на боку
    p(-15, 0 + seg2_y, 7, 5, C_CHIP);
    p(-14, 1 + seg2_y, 5, 3, '#2a4235');
    p(-15, 2 + seg2_y, 1, 2, C_CYAN);
    p(-9, 2 + seg2_y, 1, 2, C_CYAN);

    // Сегмент 1 (Плечи и сочленение шеи)
    p(-7, -11 + seg1_y, 12, 22, C_SHELL);
    p(-9, -10 + seg1_y, 2, 20, C_SHELL_SHADOW);
    p(-7, -2 + seg1_y, 10, 2, packetSegment === 0 ? C_CYAN_HOT : C_CYAN);
    p(-6, -6 + seg1_y, 1, 12, C_SEAM);

    // ── 4. БЛИЖНИЕ ЛАПКИ (ЛЕВАЯ СТОРОНА ПЕРЕД ТЕЛОМ) ───────────────
    // Передняя левая лапка (активно гребет)
    const paw3_angle = Math.sin(wave * 0.9) * 5;
    p(-2, 10 + seg1_y * 0.7 + paw3_angle, 6, 5, C_SHELL);
    p(-5, 14 + seg1_y * 0.7 + paw3_angle * 1.3, 5, 4, C_SHELL_MID);
    p(-7, 18 + seg1_y * 0.7 + paw3_angle * 1.5, 2, 3, C_SHELL);
    p(-5, 19 + seg1_y * 0.7 + paw3_angle * 1.5, 2, 3, C_SHELL);
    p(-3, 19 + seg1_y * 0.7 + paw3_angle * 1.5, 2, 3, C_SHELL);
    p(-1, 18 + seg1_y * 0.7 + paw3_angle * 1.5, 2, 3, C_SHELL);
    p(-3, 12 + seg1_y * 0.7 + paw3_angle, 2, 2, C_SEAM);

    // Задняя левая лапка
    const paw4_angle = Math.sin(wave * 0.9 + 1.6) * 6;
    p(-24, 8 + seg3_y * 0.9 + paw4_angle, 7, 5, C_SHELL);
    p(-28, 12 + seg3_y * 0.9 + paw4_angle * 1.3, 6, 4, C_SHELL_MID);
    p(-31, 16 + seg3_y * 0.9 + paw4_angle * 1.5, 2, 3, C_SHELL);
    p(-29, 17 + seg3_y * 0.9 + paw4_angle * 1.5, 2, 3, C_SHELL);
    p(-27, 17 + seg3_y * 0.9 + paw4_angle * 1.5, 2, 3, C_SHELL);
    p(-25, 16 + seg3_y * 0.9 + paw4_angle * 1.5, 2, 3, C_SHELL);

    // ── 5. МЕХАНИЧЕСКИЕ ЖАБРЫ (6 ВЕТВЕЙ С ФИЗИКОЙ ИНЕРЦИИ) ────────
    const gFlare = isTapped ? 4 : 0;
    const gTop1 = Math.round(Math.sin(wave * 0.8 + 0.2) * 2.5) - gFlare;
    const gMid1 = Math.round(Math.sin(wave * 0.8 + 1.2) * 3.5) - gFlare;
    const gBot1 = Math.round(Math.sin(wave * 0.8 + 2.2) * 2.5);

    // Верхние жабры
    p(2, -14 + gTop1, 5, 5, C_GILLS);
    p(1, -17 + gTop1 * 1.3, 4, 4, C_GILLS);
    p(0, -21 + gTop1 * 1.6, 3, 4, C_GILLS_LIGHT);
    p(-1, -24 + gTop1 * 1.8, 2, 3, C_CYAN);
    p(4, -16 + gTop1, 2, 4, C_GILLS_LIGHT);

    // Средние жабры
    p(0, -18 + gMid1, 6, 5, C_GILLS);
    p(-3, -22 + gMid1 * 1.3, 5, 5, C_GILLS);
    p(-6, -26 + gMid1 * 1.6, 4, 5, C_GILLS_LIGHT);
    p(-8, -30 + gMid1 * 1.8, 3, 4, C_CYAN);
    p(-1, -21 + gMid1, 2, 5, C_GILLS_LIGHT);

    // Нижние жабры
    p(-2, -12 + gBot1, 5, 4, C_GILLS);
    p(-6, -15 + gBot1 * 1.3, 4, 4, C_GILLS_LIGHT);
    p(-9, -18 + gBot1 * 1.6, 3, 3, C_CYAN);

    // Жабры снизу головы
    const gSubTop = Math.round(Math.sin(wave * 0.8 + 0.7) * 2) + gFlare;
    const gSubMid = Math.round(Math.sin(wave * 0.8 + 1.7) * 3) + gFlare;
    p(2, 10 + gSubTop, 5, 5, C_GILLS);
    p(1, 14 + gSubTop * 1.3, 4, 4, C_GILLS_LIGHT);
    p(0, 18 + gSubTop * 1.6, 3, 3, C_CYAN);

    p(-1, 14 + gSubMid, 6, 5, C_GILLS);
    p(-4, 18 + gSubMid * 1.3, 5, 4, C_GILLS_LIGHT);
    p(-7, 22 + gSubMid * 1.6, 3, 4, C_CYAN);

    // ── 6. ГОЛОВА И ЭКЗО-ШЛЕМ ──────────────────────────────────────
    p(4, -12, 16, 24, C_SHELL);
    p(2, -10, 20, 20, C_SHELL);
    p(12, -7, 12, 14, C_SHELL);

    // Фаски и тени пластин шлема
    p(6, 9, 15, 3, C_SHELL_SHADOW);
    p(16, 5, 8, 2, C_SHELL_SHADOW);
    p(2, -1, 3, 10, C_SHELL_SHADOW);

    // Внешний контур головы
    p(4, -13, 16, 1, C_OUTLINE);
    p(4, 12, 16, 1, C_OUTLINE);
    p(20, -8, 4, 1, C_OUTLINE);
    p(20, 7, 4, 1, C_OUTLINE);
    p(24, -4, 1, 8, C_OUTLINE);

    // Швы панелей на морде
    p(7, -6, 1, 12, C_SEAM);
    p(12, 0, 8, 1, C_SEAM);

    // Рунический антенный глиф на лбу (по референсу)
    p(14, -8, 2, 7, C_GLYPH);
    p(11, -7, 8, 1, C_GLYPH);
    p(12, -4, 6, 1, C_GLYPH);

    // ── 7. ЦИФРОВЫЕ МАТРИЧНЫЕ CRT-ГЛАЗА ────────────────────────────
    // Левый глаз (ближний крупный)
    p(11, 1, 7, 6, C_SOCKET);
    p(10, 0, 9, 1, C_OUTLINE);
    p(10, 7, 9, 1, C_OUTLINE);

    // Правый глаз (дальний чуть меньше)
    p(12, -8, 6, 5, C_SOCKET);
    p(11, -9, 8, 1, C_OUTLINE);
    p(11, -3, 8, 1, C_OUTLINE);

    // Светодиоды матрицы глаз
    if (isBlink) {
      p(11, 4, 7, 1, C_LED);
      p(12, -6, 6, 1, C_LED);
    } else if (isHappy) {
      p(12, 5, 2, 1, C_LED);
      p(14, 3, 2, 1, C_LED);
      p(16, 5, 2, 1, C_LED);

      p(13, -5, 2, 1, C_LED);
      p(15, -7, 2, 1, C_LED);
      p(17, -5, 2, 1, C_LED);
    } else {
      // Матрица зеленых точек (Phosphor LED)
      p(12, 2, 2, 2, C_LED);
      p(15, 2, 2, 2, C_LED);
      p(12, 4, 2, 2, C_LED);
      p(15, 4, 2, 2, C_LED);

      p(13, -7, 2, 1, C_LED);
      p(16, -7, 2, 1, C_LED);
      p(13, -5, 2, 1, C_LED);
      p(16, -5, 2, 1, C_LED);
    }

    // Тонкий механический стык рта
    p(18, 6, 5, 1, C_SEAM);
    p(23, 5, 1, 1, C_SEAM);

    c.restore();
  }

  // ── ОТРИСОВКА КИБЕРНЕТИЧЕСКОЙ МОРДОЧКИ (ВЕРХНЕЕ МЕНЮ) ─────────
  function drawAxolotlFace(c, cx, cy, scale, isHappy, isBlink, isDistressed, wiggle, isLight) {
    c.save();
    c.translate(Math.round(cx), Math.round(cy));
    c.scale(scale, scale);

    // Палитра кибер-симбионта (в точности по референсу)
    const C_SHELL        = '#d2d9cc'; // Светло-костяная экзо-броня
    const C_SHELL_SHADOW = '#9bb098'; // Тень пластин брони
    const C_SEAM         = '#3c4d42'; // Швы и стыки пластин
    const C_GLYPH        = '#232f28'; // Рунический антенный глиф на лбу
    const C_GILLS        = '#223027'; // Механические темные жабры
    const C_GILLS_ACCENT = '#52695c'; // Металлический отблеск жабр
    const C_CYAN         = '#38e8d8'; // Неоновые бирюзовые световоды жабр
    const C_SOCKET       = '#081711'; // Глубокий колодец CRT-глаза
    const C_LED          = isDistressed ? '#cc8833' : '#38e892'; // Зеленая фосфорная матрица
    const C_OUTLINE      = isLight ? '#14221b' : '#27382f';

    const p = (px, py, w, h, col) => {
      c.fillStyle = col;
      c.fillRect(px, py, w, h);
    };

    // Жабры покачиваются
    const gTop = Math.round(Math.sin(wiggle) * 1.5);
    const gMid = Math.round(Math.sin(wiggle + 1.2) * 2);
    const gBot = Math.round(Math.sin(wiggle + 2.4) * 1.5);

    // Левые жабры (механические с бирюзовыми жилками)
    // Верхняя
    p(-15, -11 + gTop, 4, 4, C_GILLS);
    p(-17, -10 + gTop, 2, 3, C_GILLS_ACCENT);
    p(-14, -12 + gTop, 3, 1, C_CYAN); // световод
    p(-15, -13 + gTop, 4, 1, C_OUTLINE);
    // Средняя (длинная с неоновым концом)
    p(-19, -5 + gMid, 6, 4, C_GILLS);
    p(-22, -4 + gMid, 3, 3, C_GILLS_ACCENT);
    p(-24, -3 + gMid, 2, 2, C_CYAN);  // неоновый кончик
    p(-22, -5 + gMid, 5, 1, C_OUTLINE);
    p(-22, -1 + gMid, 5, 1, C_OUTLINE);
    // Нижняя
    p(-17, 1 + gBot, 5, 3, C_GILLS);
    p(-19, 2 + gBot, 2, 2, C_GILLS_ACCENT);
    p(-17, 3 + gBot, 3, 1, C_CYAN);

    // Правые жабры
    // Верхняя
    p(11, -11 - gTop, 4, 4, C_GILLS);
    p(15, -10 - gTop, 2, 3, C_GILLS_ACCENT);
    p(11, -12 - gTop, 3, 1, C_CYAN);
    p(11, -13 - gTop, 4, 1, C_OUTLINE);
    // Средняя
    p(13, -5 - gMid, 6, 4, C_GILLS);
    p(19, -4 - gMid, 3, 3, C_GILLS_ACCENT);
    p(22, -3 - gMid, 2, 2, C_CYAN);
    p(17, -5 - gMid, 5, 1, C_OUTLINE);
    p(17, -1 - gMid, 5, 1, C_OUTLINE);
    // Нижняя
    p(12, 1 - gBot, 5, 3, C_GILLS);
    p(17, 2 - gBot, 2, 2, C_GILLS_ACCENT);
    p(14, 3 - gBot, 3, 1, C_CYAN);

    // Голова / Экзо-пластины (костяной оттенок)
    p(-13, -7, 26, 15, C_SHELL);
    p(-15, -5, 30, 11, C_SHELL);

    // Теневые грани пластин снизу и по бокам
    p(-11, 6, 22, 2, C_SHELL_SHADOW);
    p(-15, -1, 2, 5, C_SHELL_SHADOW);
    p(13, -1, 2, 5, C_SHELL_SHADOW);

    // Швы и стыки панелей экзоскелета
    p(-13, 0, 26, 1, C_SEAM);
    p(-6, -6, 1, 4, C_SEAM);
    p(5, -6, 1, 4, C_SEAM);

    // Контур головы
    p(-11, -8, 22, 1, C_OUTLINE);
    p(-11, 8, 22, 1, C_OUTLINE);
    p(-16, -4, 1, 9, C_OUTLINE);
    p(15, -4, 1, 9, C_OUTLINE);
    p(-15, -6, 2, 2, C_OUTLINE);
    p(-15, 5, 2, 2, C_OUTLINE);
    p(13, -6, 2, 2, C_OUTLINE);
    p(13, 5, 2, 2, C_OUTLINE);

    // Рунический антенный глиф на лбу (по референсу)
    p(-1, -7, 2, 7, C_GLYPH);
    p(-4, -6, 8, 1, C_GLYPH);
    p(-3, -3, 6, 1, C_GLYPH);

    // Колодец CRT-глаз (темный фон матрицы)
    p(-8, -2, 5, 5, C_SOCKET);
    p(3, -2, 5, 5, C_SOCKET);

    // Цифровая зеленая матрица глаз (Phosphor LED Matrix)
    if (isBlink) {
      // Моргание: узкая полоска мерцающей матрицы
      p(-8, 0, 5, 1, C_LED);
      p(3, 0, 5, 1, C_LED);
    } else if (isDistressed) {
      // Низкий био-тонус: одиночные тусклые янтарные пиксели
      p(-6, 0, 2, 2, C_LED);
      p(4, 0, 2, 2, C_LED);
    } else if (isHappy) {
      // Радостные цифровые стрелки-шевроны ^ ^
      p(-8, 1, 2, 1, C_LED);
      p(-6, -1, 2, 1, C_LED);
      p(-4, 1, 2, 1, C_LED);
      p(3, 1, 2, 1, C_LED);
      p(5, -1, 2, 1, C_LED);
      p(7, 1, 2, 1, C_LED);
    } else {
      // Штатный режим: матрица зеленых светодиодов в каждом глазу
      p(-7, -1, 2, 2, C_LED);
      p(-4, -1, 1, 1, C_LED);
      p(-7, 1, 1, 1, C_LED);
      p(-5, 1, 2, 1, C_LED);

      p(4, -1, 2, 2, C_LED);
      p(6, -1, 1, 1, C_LED);
      p(4, 1, 1, 1, C_LED);
      p(5, 1, 2, 1, C_LED);
    }

    // Тонкий механический стык рта
    p(-2, 4, 4, 1, C_SEAM);

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
        // Кибер-резервуар: темная водная среда (по референсу)
        const reservoirBg = isLight ? '#e6ede9' : '#071514';
        ctxLab.fillStyle = reservoirBg;
        ctxLab.fillRect(0, 0, w, h);

        // Легкая гидроакустическая сетка сонара
        ctxLab.strokeStyle = isLight ? 'rgba(0, 40, 25, 0.04)' : 'rgba(56, 232, 216, 0.035)';
        ctxLab.lineWidth = 1 * dpr;
        for (let gx = 0; gx < w; gx += 28 * dpr) {
          ctxLab.beginPath();
          ctxLab.moveTo(gx, 0);
          ctxLab.lineTo(gx, h);
          ctxLab.stroke();
        }
        for (let gy = 0; gy < h; gy += 28 * dpr) {
          ctxLab.beginPath();
          ctxLab.moveTo(0, gy);
          ctxLab.lineTo(w, gy);
          ctxLab.stroke();
        }

        // Рябь на поверхности воды
        const surfaceCol = isLight ? 'rgba(40, 100, 80, 0.25)' : 'rgba(56, 232, 216, 0.25)';
        ctxLab.fillStyle = surfaceCol;
        for (let x = 0; x < w; x += 10 * dpr) {
          const waveY = Math.sin((time * 0.003) + (x * 0.04)) * 1.8 * dpr;
          ctxLab.fillRect(x, 4 * dpr + waveY, 5 * dpr, 1 * dpr);
        }

        // Круги гидроакустического сонара (от тапов и дыхания)
        for (let i = labSonarWaves.length - 1; i >= 0; i--) {
          const sw = labSonarWaves[i];
          sw.r += sw.speed * dpr;
          sw.alpha -= 0.016;
          if (sw.alpha <= 0 || sw.r >= sw.maxR * dpr) {
            labSonarWaves.splice(i, 1);
            continue;
          }
          ctxLab.save();
          ctxLab.strokeStyle = isLight 
            ? `rgba(20, 80, 60, ${sw.alpha * 0.6})` 
            : `rgba(56, 232, 216, ${sw.alpha * 0.75})`;
          ctxLab.lineWidth = 1.2 * dpr;
          ctxLab.beginPath();
          ctxLab.arc(sw.x * dpr, sw.y * dpr, sw.r, 0, Math.PI * 2);
          ctxLab.stroke();
          ctxLab.restore();
        }

        // Пузырьки с двойным контуром и бликами (как на референсе)
        const bubbleRingCol = isLight ? 'rgba(20, 60, 50, 0.35)' : 'rgba(56, 232, 216, 0.45)';
        const bubbleHighlight = isLight ? 'rgba(255, 255, 255, 0.7)' : 'rgba(200, 255, 240, 0.65)';
        labBubbles.forEach(b => {
          b.y -= b.speed * dpr;
          if (b.y < 2) {
            b.y = (h / dpr) + 4;
            b.x = Math.random() * logicalW;
          }
          const bx = b.x * dpr;
          const by = b.y * dpr;
          const br = b.r * dpr;

          ctxLab.strokeStyle = bubbleRingCol;
          ctxLab.lineWidth = 1 * dpr;
          ctxLab.beginPath();
          ctxLab.arc(bx, by, br, 0, Math.PI * 2);
          ctxLab.stroke();

          ctxLab.fillStyle = bubbleHighlight;
          ctxLab.fillRect(bx - br * 0.4, by - br * 0.4, 1.2 * dpr, 1.2 * dpr);
        });

        // Спонтанный сонарный импульс от дыхания аксолотля
        if (Math.random() < 0.007) {
          labSonarWaves.push({
            x: axoLab.x + (axoLab.facing * 25),
            y: axoLab.y + axoLab.bobOffset + 10,
            r: 2,
            maxR: 32,
            alpha: 0.55,
            speed: 0.6
          });
        }

        // Физика плавания Кибер-Аксолотля
        axoLab.y = logicalH * 0.52;
        axoLab.bobOffset = Math.sin(time * 0.0022) * 5;
        axoLab.tiltAngle = Math.sin(time * 0.0028) * 0.04;
        
        // Постепенное затухание ускорения от тапа
        if (axoLab.speedMultiplier > 1.0) {
          axoLab.speedMultiplier = Math.max(1.0, axoLab.speedMultiplier - 0.035);
        }
        axoLab.x += axoLab.vx * axoLab.speedMultiplier;

        const labPadding = 65;
        if (axoLab.x > logicalW - labPadding) {
          axoLab.x = logicalW - labPadding;
          axoLab.vx = -Math.abs(axoLab.vx);
        } else if (axoLab.x < labPadding) {
          axoLab.x = labPadding;
          axoLab.vx = Math.abs(axoLab.vx);
        }
        axoLab.facing = axoLab.vx >= 0 ? 1 : -1;

        // Моргание матричных глаз
        axoLab.blinkTimer++;
        if (axoLab.blinkTimer > 155) {
          axoLab.isBlinking = true;
          if (axoLab.blinkTimer > 167) {
            axoLab.isBlinking = false;
            axoLab.blinkTimer = 0;
          }
        }

        if (axoLab.reactionTimer > 0) {
          axoLab.reactionTimer--;
        }

        // Выпуск микропузырьков из жабр при плавании
        axoLab.bubbleTimer = (axoLab.bubbleTimer || 0) + 1;
        if (axoLab.bubbleTimer % (axoLab.reactionTimer > 0 ? 12 : 36) === 0) {
          labBubbles.push({
            x: axoLab.x - (axoLab.facing * 14) + (Math.random() * 6 - 3),
            y: axoLab.y + axoLab.bobOffset - 6 + (Math.random() * 8),
            speed: 0.45 + Math.random() * 0.4,
            r: 0.9 + Math.random() * 1.2
          });
        }

        // Электрические искры био-кибернетического разряда
        for (let i = labSparks.length - 1; i >= 0; i--) {
          const spk = labSparks[i];
          spk.x += spk.vx;
          spk.y += spk.vy;
          spk.vx *= 0.94;
          spk.vy *= 0.94;
          spk.alpha -= 0.035;
          if (spk.alpha <= 0) {
            labSparks.splice(i, 1);
            continue;
          }
          ctxLab.save();
          ctxLab.strokeStyle = spk.color;
          ctxLab.lineWidth = 1.4 * dpr;
          ctxLab.globalAlpha = Math.max(0, spk.alpha);
          ctxLab.beginPath();
          ctxLab.moveTo(spk.x * dpr, spk.y * dpr);
          ctxLab.lineTo((spk.x - spk.vx * 2.2) * dpr, (spk.y - spk.vy * 2.2) * dpr);
          ctxLab.stroke();
          ctxLab.restore();
        }

        // Мягкое био-кибернетическое неоновое свечение под аксолотлем
        const glowGrad = ctxLab.createRadialGradient(
          Math.round(axoLab.x * dpr), Math.round((axoLab.y + axoLab.bobOffset) * dpr), 2 * dpr,
          Math.round(axoLab.x * dpr), Math.round((axoLab.y + axoLab.bobOffset) * dpr), 65 * dpr
        );
        const glowAlpha = axoLab.reactionTimer > 0 ? 0.32 : (0.12 + Math.sin(time * 0.004) * 0.05);
        glowGrad.addColorStop(0, isLight ? `rgba(40, 140, 110, ${glowAlpha * 0.7})` : `rgba(56, 232, 216, ${glowAlpha})`);
        glowGrad.addColorStop(1, 'rgba(56, 232, 216, 0)');
        ctxLab.fillStyle = glowGrad;
        ctxLab.beginPath();
        ctxLab.arc(Math.round(axoLab.x * dpr), Math.round((axoLab.y + axoLab.bobOffset) * dpr), 65 * dpr, 0, Math.PI * 2);
        ctxLab.fill();

        // Отрисовка живого пиксельного кибер-аксолотля b181
        const isDistressedLab = state.satiety < 25 || state.cleanliness < 25;
        const isHappyLab = !isDistressedLab && (state.satiety > 70 && state.cleanliness > 70);
        const scaleLab = 1.35 * dpr;

        drawLiveCyberAxolotl(
          ctxLab,
          axoLab.x * dpr,
          (axoLab.y + axoLab.bobOffset) * dpr,
          scaleLab,
          axoLab.facing,
          isHappyLab,
          axoLab.isBlinking,
          time,
          axoLab.reactionTimer,
          isLight
        );

        // Флоатеры в лаборатории (числовые импульсы)
        for (let i = labFloaters.length - 1; i >= 0; i--) {
          const f = labFloaters[i];
          f.y += f.vy;
          f.alpha -= 0.025;
          if (f.alpha <= 0) {
            labFloaters.splice(i, 1);
            continue;
          }
          ctxLab.save();
          ctxLab.fillStyle = isLight ? `rgba(20, 40, 30, ${f.alpha})` : `rgba(80, 255, 176, ${f.alpha})`;
          ctxLab.font = `bold ${13 * dpr}px 'Space Mono', monospace`;
          ctxLab.textAlign = 'center';
          ctxLab.shadowColor = '#50ffb0';
          ctxLab.shadowBlur = 6 * dpr;
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
