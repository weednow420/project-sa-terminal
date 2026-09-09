/**
 * =============================================================================
 * PROJECT S-A TERMINAL // СИМБИОНТ CAT181b [КИБЕР-КОШКА]
 * Модуль интеграции стикеров-анимаций Steam и интерактивного взаимодействия
 * Ревизия: v1.0-alpha // PURE STEAM APNG SYMBIONT & DUAL-DOCK ENGINE
 * =============================================================================
 */

(function (window) {
  'use strict';

  const STEAM_ANIMATIONS = {
    sit: {
      id: 'sit',
      btnId: 'btn-cat-anim-sit',
      src: 'assets/cat/cat_sit.png',
      label: '[НАБЛЮДЕНИЕ]',
      desc: 'Базовый режим наблюдения. Фоновый био-скан и удержание фокуса.',
      status: 'В ПОКОЕ',
      sound: 'playCatPurr'
    },
    peek: {
      id: 'peek',
      btnId: 'btn-cat-anim-peek',
      src: 'assets/cat/cat_peek.png',
      label: '[ВЫГЛЯДЫВАНИЕ]',
      desc: 'Режим скрытности. Выглядывание из укрытия, калибровка сенсоров.',
      status: 'СКАН СЕКТОРА',
      sound: 'playCatMeow'
    },
    action: {
      id: 'action',
      btnId: 'btn-cat-anim-action',
      src: 'assets/cat/cat_action.png',
      label: '[АКТИВНОСТЬ]',
      desc: 'Тестирование кинематики. Разминка контура и проверка сервоприводов.',
      status: 'ИГРА / РАЗМИНКА',
      sound: 'playCatPlay'
    }
  };

  let currentMode = 'sit';
  let baseMode = 'sit';
  let tempTimer = null;
  let lastInteraction = Date.now();

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

  /**
   * =========================================================================
   * МЕНЕДЖЕР СИМБИОНТА CAT181b (Steam APNG + Интерактивный контур)
   * =========================================================================
   */
  const CatSymbiont = {
    init: function () {
      this.bindDOM();
      this.startIdleBehavior();
      this.setSteamAnimation('sit');
    },

    bindDOM: function () {
      // Клик по кошке в верхнем хедере (на всех экранах)
      const headerContainer = document.getElementById('cat-header-container');
      if (headerContainer) {
        headerContainer.addEventListener('click', () => {
          this.onHeaderCatClick();
        });
      }

      // Клик по отсеку чипа в Лаборатории
      const chipContainer = document.getElementById('cat-chip-container');
      if (chipContainer) {
        chipContainer.addEventListener('click', (e) => {
          if (!e.target.closest('button')) {
            this.petCat();
          }
        });
      }
    },

    onHeaderCatClick: function () {
      lastInteraction = Date.now();
      triggerHaptic('medium');

      if (window.SoundFX && window.SoundFX.playCatMeow) {
        window.SoundFX.playCatMeow();
      }

      // При клике в хедере CAT181b временно выглядывает или разминается
      const alternate = Math.random() < 0.5 ? 'peek' : 'action';
      const headerImg = document.getElementById('cat-header-sprite');
      if (headerImg) {
        headerImg.src = STEAM_ANIMATIONS[alternate].src;
        clearTimeout(this._headerTimer);
        this._headerTimer = setTimeout(() => {
          headerImg.src = STEAM_ANIMATIONS[baseMode].src;
        }, 3500);
      }
    },

    getAnimation: function () {
      return currentMode;
    },

    setSteamAnimation: function (modeKey, tempDuration = 0) {
      if (!STEAM_ANIMATIONS[modeKey]) return;
      lastInteraction = Date.now();

      if (tempDuration === 0) {
        baseMode = modeKey;
      }

      currentMode = modeKey;
      clearTimeout(tempTimer);

      const anim = STEAM_ANIMATIONS[modeKey];

      // E-Ink Micro-Refresh визуальный эффект
      const chipContainer = document.getElementById('cat-chip-container');
      if (chipContainer) {
        chipContainer.classList.add('cat-eink-flash');
        setTimeout(() => {
          chipContainer.classList.remove('cat-eink-flash');
        }, 60);
      }

      // Обновление спрайтов
      const labImg = document.getElementById('cat-lab-sprite');
      if (labImg) {
        labImg.src = anim.src;
      }

      const headerImg = document.getElementById('cat-header-sprite');
      if (headerImg && !tempDuration) {
        headerImg.src = anim.src;
      }

      // Обновление текстовых полей
      const badge = document.getElementById('cat-status-badge');
      if (badge) badge.textContent = anim.label;

      const desc = document.getElementById('cat-state-desc');
      if (desc) desc.textContent = anim.desc;

      const stripState = document.getElementById('cat-strip-state');
      if (stripState) stripState.textContent = anim.status;

      // Подсветка кнопок режимов
      Object.keys(STEAM_ANIMATIONS).forEach(k => {
        const btn = document.getElementById(STEAM_ANIMATIONS[k].btnId);
        if (btn) {
          btn.classList.toggle('active-cat-state', k === baseMode);
        }
      });

      triggerHaptic('light');

      // Если временная анимация (реакция)
      if (tempDuration > 0) {
        tempTimer = setTimeout(() => {
          this.setSteamAnimation(baseMode);
        }, tempDuration);
      }
    },

    // Действия взаимодействия
    petCat: function () {
      lastInteraction = Date.now();
      triggerHaptic('medium');
      if (window.SoundFX && window.SoundFX.playCatPurr) {
        window.SoundFX.playCatPurr();
      }
      this.setSteamAnimation('peek', 3500);
      const desc = document.getElementById('cat-state-desc');
      if (desc) desc.textContent = 'Контакт с CAT181b установлен. Снижение энтропии контура и мурлыкание.';
    },

    feed: function () {
      lastInteraction = Date.now();
      triggerHaptic('success');
      if (window.SoundFX && window.SoundFX.playCatCrunch) {
        window.SoundFX.playCatCrunch();
      }
      this.setSteamAnimation('action', 4000);
      const desc = document.getElementById('cat-state-desc');
      if (desc) desc.textContent = 'Прием нутриентов. Био-ресурс CAT181b восполнен (+30%).';
    },

    play: function () {
      lastInteraction = Date.now();
      triggerHaptic('medium');
      if (window.SoundFX && window.SoundFX.playCatPlay) {
        window.SoundFX.playCatPlay();
      }
      this.setSteamAnimation('action', 4500);
      const desc = document.getElementById('cat-state-desc');
      if (desc) desc.textContent = 'Тестирование кинематики лап CAT181b. Игра с клубком импульсов.';
    },

    clean: function () {
      lastInteraction = Date.now();
      triggerHaptic('light');
      if (window.SoundFX && window.SoundFX.playKeyClick) {
        window.SoundFX.playKeyClick(960);
      }
      this.setSteamAnimation('sit', 2500);
      const desc = document.getElementById('cat-state-desc');
      if (desc) desc.textContent = 'Продувка оптических сенсоров CAT181b. Санитарный цикл завершен.';
    },

    // Фоновые живые реакции
    startIdleBehavior: function () {
      setInterval(() => {
        const idleSec = (Date.now() - lastInteraction) / 1000;
        if (idleSec > 22 && baseMode === 'sit' && currentMode === 'sit') {
          const r = Math.random();
          if (r < 0.35) {
            this.setSteamAnimation('peek', 3500);
          }
        }
      }, 8000);
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
