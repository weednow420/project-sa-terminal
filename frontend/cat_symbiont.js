/**
 * =============================================================================
 * PROJECT S-A TERMINAL // СИМБИОНТ CAT-01 [КИБЕР-КОШКА]
 * Автономный модуль покадровой пиксельной анимации и матрицы состояний чипа
 * Ревизия: v0.6a // PURE MONOCHROME (БЕЗ ЗЕЛЕНОГО) & DISCRETE PIXEL ENGINE
 * =============================================================================
 */

(function (window) {
  'use strict';

  const CAT_STATES = {
    BASE: {
      id: 'BASE',
      label: '[BASE]',
      desc: 'Базовый режим наблюдения. Фоновый био-скан.',
      src: 'assets/cat/cat_idle.png',
      duration: 0 // перманентно
    },
    WINK: {
      id: 'WINK',
      label: '[WINK]',
      desc: 'Подмигивание. Контакт установлен.',
      src: 'assets/cat/cat_wink.png',
      duration: 1800,
      sound: 'playCatMeow'
    },
    ALERT: {
      id: 'ALERT',
      label: '[ALERT]',
      desc: 'Тревога / Настороженность. Сенсоры на максимуме.',
      src: 'assets/cat/cat_alert.png',
      duration: 2500,
      sound: 'playKeyClick'
    },
    STRETCH: {
      id: 'STRETCH',
      label: '[STRETCH]',
      desc: 'Калибровка сервоприводов. Разминка контура.',
      src: 'assets/cat/cat_stretch.png',
      duration: 3500
    },
    PLAY: {
      id: 'PLAY',
      label: '[PLAY]',
      desc: 'Тестирование кинематики лап с клубком импульсов.',
      src: 'assets/cat/cat_play.png',
      duration: 3500,
      sound: 'playCatPlay'
    },
    CLEAN: {
      id: 'CLEAN',
      label: '[CLEAN]',
      desc: 'Продувка оптических сенсоров. Санитарный цикл.',
      src: 'assets/cat/cat_clean.png',
      duration: 3500,
      sound: 'playCatPurr'
    },
    FEED: {
      id: 'FEED',
      label: '[FEED]',
      desc: 'Прием нутриентов. Восполнение био-ресурса.',
      src: 'assets/cat/cat_feed.png',
      duration: 4000,
      sound: 'playCatCrunch'
    },
    BOX: {
      id: 'BOX',
      label: '[BOX]',
      desc: 'Дренажный отсек. Сброс накопленной энтропии.',
      src: 'assets/cat/cat_box.png',
      duration: 3500
    },
    SLEEP: {
      id: 'SLEEP',
      label: '[SLEEP]',
      desc: 'Режим гибернации / низкого энергопотребления.',
      src: 'assets/cat/cat_sleep.png',
      duration: 0 // спит пока не разбудят
    }
  };

  const STATE_KEYS = ['BASE', 'WINK', 'ALERT', 'STRETCH', 'PLAY', 'CLEAN', 'FEED', 'BOX', 'SLEEP'];

  let currentState = 'BASE';
  let previousState = 'BASE';
  let stateTimer = null;
  let lastInteractionTime = Date.now();
  let isSleeping = false;

  // Кэш монохроматизированных спрайтов
  const processedSprites = {};
  let isEngineReady = false;

  // Тактильная отдача Telegram
  function triggerHaptic(type = 'light') {
    if (window.Telegram && window.Telegram.WebApp && window.Telegram.WebApp.HapticFeedback) {
      try {
        if (type === 'medium') {
          window.Telegram.WebApp.HapticFeedback.impactOccurred('medium');
        } else if (type === 'success') {
          window.Telegram.WebApp.HapticFeedback.notificationOccurred('success');
        } else {
          window.Telegram.WebApp.HapticFeedback.impactOccurred('light');
        }
      } catch (e) {}
    }
  }

  // Конвертер в 100% чистый монохром (БЕЗ ЗЕЛЕНОГО И КРАСНОГО)
  function processMonochrome(img) {
    const cv = document.createElement('canvas');
    cv.width = img.width;
    cv.height = img.height;
    const ctx = cv.getContext('2d');
    ctx.drawImage(img, 0, 0);

    const imgData = ctx.getImageData(0, 0, cv.width, cv.height);
    const d = imgData.data;

    for (let i = 0; i < d.length; i += 4) {
      const r = d[i], g = d[i + 1], b = d[i + 2];

      // 1. Зеленые/оливковые глаза -> чистое серебристое свечение
      if (g > 105 && g > r * 1.05 && g > b * 1.02) {
        const lum = Math.round(0.299 * r + 0.587 * g + 0.114 * b);
        const silver = Math.min(255, lum + 75);
        d[i] = silver;
        d[i + 1] = silver;
        d[i + 2] = silver;
      }
      // 2. Красный ошейник / клубок -> строгий монохромный серый
      else if (r > 120 && r > g * 1.25 && r > b * 1.25) {
        const grey = Math.round(0.299 * r + 0.587 * g + 0.114 * b);
        d[i] = grey;
        d[i + 1] = grey;
        d[i + 2] = grey;
      }
    }

    ctx.putImageData(imgData, 0, 0);
    return cv;
  }

  // Предзагрузка и подготовка всех 9 состояний
  function preloadAll(callback) {
    let loaded = 0;
    STATE_KEYS.forEach(key => {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.src = CAT_STATES[key].src;
      img.onload = () => {
        try {
          processedSprites[key] = processMonochrome(img);
        } catch (e) {
          processedSprites[key] = img;
        }
        loaded++;
        if (loaded === STATE_KEYS.length) {
          isEngineReady = true;
          if (callback) callback();
        }
      };
      img.onerror = () => {
        loaded++;
        if (loaded === STATE_KEYS.length) {
          isEngineReady = true;
          if (callback) callback();
        }
      };
    });
  }

  /**
   * =========================================================================
   * PIXEL ANIMATION ENGINE (Покадровый движок Tamagotchi v0.6a)
   * =========================================================================
   */
  const PixelEngine = {
    canvas: null,
    ctx: null,
    width: 160,
    height: 160,
    rafId: null,
    startTime: 0,
    lastFrameTime: 0,

    // Внутренние таймеры анимационных фаз
    blinkTimer: 0,
    isBlinking: false,
    blinkFrame: 0,
    earTwitchTimer: 0,
    isEarTwitching: false,

    // Сон: частицы z z Z
    sleepParticles: [],

    init: function () {
      this.canvas = document.getElementById('cat-pixel-canvas');
      if (!this.canvas) return;

      this.ctx = this.canvas.getContext('2d');
      this.ctx.imageSmoothingEnabled = false;
      this.width = this.canvas.width;
      this.height = this.canvas.height;

      this.startTime = performance.now();
      this.lastFrameTime = this.startTime;

      this.initParticles();
      this.startLoop();
    },

    initParticles: function () {
      this.sleepParticles = [
        { x: 105, y: 80, size: 8, char: 'z', alpha: 0, speedY: 0.25, phase: 0 },
        { x: 112, y: 70, size: 10, char: 'z', alpha: 0, speedY: 0.28, phase: 1.2 },
        { x: 120, y: 60, size: 12, char: 'Z', alpha: 0, speedY: 0.32, phase: 2.4 }
      ];
    },

    startLoop: function () {
      const render = (now) => {
        this.update(now);
        this.draw(now);
        this.rafId = requestAnimationFrame(render);
      };
      this.rafId = requestAnimationFrame(render);
    },

    update: function (now) {
      // Обновление таймера моргания
      if (currentState === 'BASE' && !isSleeping) {
        if (!this.isBlinking && now > this.blinkTimer) {
          this.isBlinking = true;
          this.blinkFrame = 0;
          this.blinkTimer = now + 3500 + Math.random() * 3000; // следующее через 3.5 - 6.5 сек
        }

        // Обновление таймера подергивания уха
        if (!this.isEarTwitching && now > this.earTwitchTimer) {
          this.isEarTwitching = true;
          this.earTwitchTimer = now + 6000 + Math.random() * 4000;
          setTimeout(() => { this.isEarTwitching = false; }, 140);
        }
      }

      // Обновление частиц сна
      if (currentState === 'SLEEP') {
        const timeSec = now / 1000;
        this.sleepParticles.forEach(p => {
          const cycle = (timeSec + p.phase) % 3.0;
          if (cycle < 2.0) {
            p.alpha = Math.sin((cycle / 2.0) * Math.PI);
            p.currentY = p.y - (cycle * 12);
            p.currentX = p.x + Math.sin(cycle * 3) * 3;
          } else {
            p.alpha = 0;
          }
        });
      }
    },

    draw: function (now) {
      const ctx = this.ctx;
      if (!ctx) return;

      ctx.clearRect(0, 0, this.width, this.height);

      const sprite = processedSprites[currentState] || processedSprites.BASE;
      if (!sprite) return;

      const timeSec = now / 1000;

      // ─── 1. [BASE] РЕЖИМ ОЖИДАНИЯ: 4-ФАЗНЫЙ ПОКАДРОВЫЙ ЦИКЛ ───
      if (currentState === 'BASE') {
        // Дискретный шаг дыхания (8-битный Tamagotchi step)
        // Фаза 1.6 секунды: 0px -> -1px -> -2px -> -1px
        const breathePhase = Math.floor((timeSec % 1.6) / 0.4); // 0, 1, 2, 3
        let dy = 0;
        let dx = 0;

        if (breathePhase === 1) dy = -1;
        else if (breathePhase === 2) dy = -2;
        else if (breathePhase === 3) dy = -1;

        // Подергивание уха
        if (this.isEarTwitching) {
          dx = (Math.floor(timeSec * 20) % 2 === 0) ? -1 : 1;
        }

        // Моргание (подстановка кадра WINK)
        if (this.isBlinking) {
          const blinkProgress = (now % 300);
          if (blinkProgress < 160 && processedSprites.WINK) {
            ctx.drawImage(processedSprites.WINK, dx, dy, this.width, this.height);
          } else {
            this.isBlinking = false;
            ctx.drawImage(sprite, dx, dy, this.width, this.height);
          }
        } else {
          ctx.drawImage(sprite, dx, dy, this.width, this.height);
        }
      }

      // ─── 2. [PLAY] ИГРА С КЛУБКОМ: 4 КАДРА УДАРА И ОТКАТА ───
      else if (currentState === 'PLAY') {
        // Цикл 560 мс (по 140 мс на кадр)
        const frame = Math.floor((timeSec % 0.56) / 0.14); // 0, 1, 2, 3
        let dx = 0;
        let dy = 0;

        if (frame === 1) {
          // Удар лапкой по клубку
          dx = 1; dy = 1;
        } else if (frame === 2) {
          // Клубок катится вправо
          dx = 2; dy = 0;
        } else if (frame === 3) {
          // Возврат
          dx = 1; dy = -1;
        }

        ctx.drawImage(sprite, dx, dy, this.width, this.height);

        // Индикатор импульса (дискретная искорка)
        if (frame === 1) {
          ctx.fillStyle = '#ffffff';
          ctx.fillRect(45, 125, 3, 3);
        }
      }

      // ─── 3. [CLEAN] УМЫВАНИЕ ЛАПОЙ: 4 КАДРА ДВИЖЕНИЯ К УХУ ───
      else if (currentState === 'CLEAN') {
        // Цикл 640 мс (по 160 мс на кадр)
        const frame = Math.floor((timeSec % 0.64) / 0.16); // 0, 1, 2, 3
        let dx = 0;
        let dy = 0;

        if (frame === 1) {
          dy = -2; // Лапка поднимается к щеке
        } else if (frame === 2) {
          dy = -3; dx = -1; // Трёт ушко
        } else if (frame === 3) {
          dy = -1; // Опускается
        }

        ctx.drawImage(sprite, dx, dy, this.width, this.height);
      }

      // ─── 4. [FEED] КОРМЛЕНИЕ: 4 КАДРА НАКЛОНА И ХРУСТА ───
      else if (currentState === 'FEED') {
        // Цикл 600 мс (по 150 мс на кадр)
        const frame = Math.floor((timeSec % 0.60) / 0.15); // 0, 1, 2, 3
        let dx = 0;
        let dy = 0;

        if (frame === 1) {
          dy = 2; // Наклон к миске
        } else if (frame === 2) {
          dy = 1; // Жевание
        } else if (frame === 3) {
          dy = 0; // Подъем
        }

        ctx.drawImage(sprite, dx, dy, this.width, this.height);

        // Пиксельные крошки при хрусте
        if (frame === 1 || frame === 2) {
          ctx.fillStyle = '#e0e0e0';
          ctx.fillRect(56, 128, 2, 2);
          ctx.fillRect(62, 126, 2, 2);
        }
      }

      // ─── 5. [STRETCH] ПОТЯГИВАНИЕ: 4 КАДРА ПРОГИБА ───
      else if (currentState === 'STRETCH') {
        // Цикл 1.0 сек (по 250 мс на кадр)
        const frame = Math.floor((timeSec % 1.0) / 0.25);
        let dx = 0;
        let dy = 0;

        if (frame === 1) {
          dx = -2; dy = 1; // Вытягивание лап
        } else if (frame === 2) {
          dy = -2; // Прогиб спинки
        } else if (frame === 3) {
          dy = -1;
        }

        ctx.drawImage(sprite, dx, dy, this.width, this.height);
      }

      // ─── 6. [ALERT] ТРЕВОГА: ВЫСОКОЧАСТОТНАЯ ВИБРАЦИЯ ХВОСТА ───
      else if (currentState === 'ALERT') {
        // Нервное подергивание хвоста каждые 80 мс
        const jitter = (Math.floor(timeSec * 12) % 2 === 0) ? -1 : 1;
        ctx.drawImage(sprite, jitter, -1, this.width, this.height);
      }

      // ─── 7. [BOX] ЛОТОК / КОРОБКА: ПОКАЧИВАНИЕ ХВОСТА ───
      else if (currentState === 'BOX') {
        const frame = Math.floor((timeSec % 0.8) / 0.2); // 0, 1, 2, 3
        let dx = 0;
        if (frame === 1) dx = 1;
        else if (frame === 3) dx = -1;

        ctx.drawImage(sprite, dx, 0, this.width, this.height);
      }

      // ─── 8. [SLEEP] СОН: ПОПИКСЕЛЬНОЕ ДЫХАНИЕ И ЛЕТЯЩИЕ Z Z Z ───
      else if (currentState === 'SLEEP') {
        // Медленное дискретное дыхание (по 900 мс на фазу)
        const phase = Math.floor((timeSec % 1.8) / 0.9);
        const dy = (phase === 1) ? -1 : 0;

        ctx.drawImage(sprite, 0, dy, this.width, this.height);

        // Отрисовка пиксельных символов z z Z
        ctx.font = '10px "Space Mono", monospace';
        this.sleepParticles.forEach(p => {
          if (p.alpha > 0.05) {
            ctx.fillStyle = `rgba(220, 220, 220, ${p.alpha})`;
            ctx.fillText(p.char, p.currentX, p.currentY);
          }
        });
      }

      // ─── 9. [WINK] ПОДМИГИВАНИЕ ───
      else {
        ctx.drawImage(sprite, 0, 0, this.width, this.height);
      }
    }
  };

  /**
   * =========================================================================
   * МЕНЕДЖЕР СОСТОЯНИЙ И ИНТЕРФЕЙСА (CatSymbiont)
   * =========================================================================
   */
  const CatSymbiont = {
    init: function () {
      preloadAll(() => {
        PixelEngine.init();
      });

      this.bindDOM();
      this.startIdleWatcher();
      this.updateUI();
    },

    bindDOM: function () {
      const chipWidget = document.getElementById('cat-chip-widget');
      if (chipWidget) {
        chipWidget.addEventListener('click', (e) => {
          if (!e.target.closest('button')) {
            this.petCat();
          }
        });
      }
    },

    getState: function () {
      return currentState;
    },

    setState: function (stateKey, manual = false) {
      if (!CAT_STATES[stateKey]) return;

      clearTimeout(stateTimer);
      lastInteractionTime = Date.now();

      const next = CAT_STATES[stateKey];
      previousState = currentState;
      currentState = stateKey;

      if (stateKey === 'SLEEP') {
        isSleeping = true;
      } else {
        isSleeping = false;
      }

      // ── Аппаратный E-Ink Micro-Refresh (вспышка на 60 мс) ──
      const chipContainer = document.getElementById('cat-chip-container');
      if (chipContainer) {
        chipContainer.classList.add('cat-eink-flash');
        setTimeout(() => {
          chipContainer.classList.remove('cat-eink-flash');
        }, 60);
      }

      // Звуковое сопровождение
      if (next.sound && window.SoundFX && typeof window.SoundFX[next.sound] === 'function') {
        window.SoundFX[next.sound]();
      }

      if (manual) {
        triggerHaptic('light');
      }

      this.updateUI();

      // Авто-возврат в BASE после завершения временной анимации
      if (next.duration > 0) {
        stateTimer = setTimeout(() => {
          if (currentState === stateKey) {
            this.setState('BASE');
          }
        }, next.duration);
      }
    },

    cycleState: function () {
      const currentIndex = STATE_KEYS.indexOf(currentState);
      const nextIndex = (currentIndex + 1) % STATE_KEYS.length;
      this.setState(STATE_KEYS[nextIndex], true);
    },

    // Погладить кошку (клик по чипу)
    petCat: function () {
      lastInteractionTime = Date.now();
      triggerHaptic('medium');

      if (isSleeping) {
        if (window.SoundFX && window.SoundFX.playCatMeow) window.SoundFX.playCatMeow();
        this.setState('WINK');
        return;
      }

      if (window.SoundFX && window.SoundFX.playCatPurr) {
        window.SoundFX.playCatPurr();
      }
      this.setState('WINK');
    },

    feed: function () {
      this.setState('FEED', true);
    },

    play: function () {
      this.setState('PLAY', true);
    },

    clean: function () {
      this.setState('CLEAN', true);
    },

    // Наблюдатель бездействия
    startIdleWatcher: function () {
      setInterval(() => {
        const idleSec = (Date.now() - lastInteractionTime) / 1000;

        // Если бездействие > 45 сек — засыпает
        if (!isSleeping && idleSec > 45 && currentState === 'BASE') {
          this.setState('SLEEP');
          return;
        }

        // Случайные разминки в покое
        if (!isSleeping && idleSec > 15 && idleSec < 40 && currentState === 'BASE') {
          const rand = Math.random();
          if (rand < 0.35) {
            this.setState('STRETCH');
          } else if (rand < 0.65) {
            this.setState('ALERT');
          }
        }
      }, 5000);
    },

    updateUI: function () {
      const stateObj = CAT_STATES[currentState] || CAT_STATES.BASE;

      // Fallback на случай отсутствия canvas
      const imgEl = document.getElementById('cat-chip-img');
      if (imgEl && imgEl.src !== stateObj.src) {
        imgEl.src = stateObj.src;
      }

      // Текстовый бейдж статуса
      const badgeEl = document.getElementById('cat-status-badge');
      if (badgeEl) {
        badgeEl.textContent = stateObj.label;
      }

      // Описание состояния
      const descEl = document.getElementById('cat-state-desc');
      if (descEl) {
        descEl.textContent = stateObj.desc;
      }

      // Индикатор сна
      const chipContainer = document.getElementById('cat-chip-container');
      if (chipContainer) {
        if (currentState === 'SLEEP') {
          chipContainer.classList.add('cat-is-sleeping');
          chipContainer.classList.remove('cat-is-active');
        } else {
          chipContainer.classList.remove('cat-is-sleeping');
          chipContainer.classList.add('cat-is-active');
        }
      }

      // Подсветка кнопок матрицы
      STATE_KEYS.forEach(key => {
        const btn = document.getElementById(`btn-cat-state-${key}`);
        if (btn) {
          if (key === currentState) {
            btn.classList.add('active-cat-state');
          } else {
            btn.classList.remove('active-cat-state');
          }
        }
      });
    }
  };

  // Экспорт
  window.CatSymbiont = CatSymbiont;

  // Инициализация при готовности DOM
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => CatSymbiont.init());
  } else {
    CatSymbiont.init();
  }

})(window);
