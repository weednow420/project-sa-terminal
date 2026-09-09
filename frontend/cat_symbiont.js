/**
 * =============================================================================
 * PROJECT S-A TERMINAL // СИМБИОНТ CAT-01 [КИБЕР-КОШКА]
 * Автономный модуль анимации, жизненного цикла и матрицы состояний чипа
 * Ревизия: v0.4a // ЧИСТЫЙ МОНОХРОМ (БЕЗ ЗЕЛЕНОГО)
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
  let blinkTimer = null;
  let idleTimer = null;
  let lastInteractionTime = Date.now();
  let isSleeping = false;

  // Предзагрузка всех 9 кадров в кэш браузера для мгновенного переключения
  function preloadImages() {
    STATE_KEYS.forEach(key => {
      const img = new Image();
      img.src = CAT_STATES[key].src;
    });
  }

  // Запуск тактильной отдачи Telegram
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

  const CatSymbiont = {
    init: function () {
      preloadImages();
      this.bindDOM();
      this.startBlinkCycle();
      this.startIdleWatcher();
      this.updateUI();
    },

    bindDOM: function () {
      const chipWidget = document.getElementById('cat-chip-widget');
      if (chipWidget) {
        chipWidget.addEventListener('click', (e) => {
          // Если кликнули не по кнопкам матрицы, гладим кошку
          if (!e.target.closest('button')) {
            this.petCat();
          }
        });
      }
    },

    // Получить текущее состояние
    getState: function () {
      return currentState;
    },

    // Переключить состояние
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

      // Звуковое сопровождение
      if (next.sound && window.SoundFX && typeof window.SoundFX[next.sound] === 'function') {
        window.SoundFX[next.sound]();
      }

      if (manual) {
        triggerHaptic('light');
      }

      this.updateUI();

      // Авто-возврат в BASE после временных анимаций
      if (next.duration > 0) {
        stateTimer = setTimeout(() => {
          if (currentState === stateKey) {
            this.setState('BASE');
          }
        }, next.duration);
      }
    },

    // Переключить на следующее состояние в кольце
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
        // Просыпается
        if (window.SoundFX && window.SoundFX.playCatMeow) window.SoundFX.playCatMeow();
        this.setState('WINK');
        return;
      }

      // Если бодрствует — мурлычет и подмигивает
      if (window.SoundFX && window.SoundFX.playCatPurr) {
        window.SoundFX.playCatPurr();
      }
      this.setState('WINK');
    },

    // Покормить
    feed: function () {
      this.setState('FEED', true);
    },

    // Поиграть
    play: function () {
      this.setState('PLAY', true);
    },

    // Очистить / лоток
    clean: function () {
      this.setState('CLEAN', true);
    },

    // Цикл моргания (живой взгляд)
    startBlinkCycle: function () {
      const scheduleNextBlink = () => {
        const nextDelay = 3500 + Math.random() * 3500; // каждые 3.5 - 7 секунд
        blinkTimer = setTimeout(() => {
          if (currentState === 'BASE' && !isSleeping) {
            // Быстрое подмигивание
            const imgEl = document.getElementById('cat-chip-img');
            if (imgEl) {
              imgEl.src = CAT_STATES.WINK.src;
              setTimeout(() => {
                if (currentState === 'BASE' && !isSleeping && imgEl) {
                  imgEl.src = CAT_STATES.BASE.src;
                }
              }, 240); // закрытие глаза на 240 мс
            }
          }
          scheduleNextBlink();
        }, nextDelay);
      };
      scheduleNextBlink();
    },

    // Наблюдатель активности (Тамагочи-цикл)
    startIdleWatcher: function () {
      setInterval(() => {
        const idleSec = (Date.now() - lastInteractionTime) / 1000;

        // Если не спала и прошло больше 45 секунд — засыпает
        if (!isSleeping && idleSec > 45 && currentState === 'BASE') {
          this.setState('SLEEP');
          return;
        }

        // Если бездействие 15-35 сек и в BASE — случайная ненавязчивая активность
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

    // Обновление DOM элементов
    updateUI: function () {
      const stateObj = CAT_STATES[currentState] || CAT_STATES.BASE;

      // Изображение
      const imgEl = document.getElementById('cat-chip-img');
      if (imgEl && imgEl.src !== stateObj.src) {
        imgEl.src = stateObj.src;
        imgEl.alt = `CAT-01 ${stateObj.id}`;
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

      // Подсветка кнопок матрицы состояний
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
