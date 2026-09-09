/**
 * =============================================================================
 * PROJECT S-A TERMINAL // СИМБИОНТ CAT181b [КИБЕР-КОШКА]
 * Модуль интеграции 6 пиксельных APNG-анимаций и интерактивного тамагочи-контура
 * Ревизия: v1.2-alpha // 6-STATE CYBER-SYMBIOT ENGINE (IDLE/PURR/MISCHIEF/SLEEP/ALERT/GLITCH)
 * =============================================================================
 */

(function (window) {
  'use strict';

  const CAT_ANIMATIONS = {
    idle: {
      id: 'idle',
      btnId: 'btn-cat-anim-idle',
      src: 'assets/cat/cat_idle.png',
      label: '[ПОКОЙ]',
      desc: 'Базовый режим наблюдения. Фоновый био-скан и удержание фокуса.',
      status: 'В ПОКОЕ',
      sound: 'playCatPurr'
    },
    purr: {
      id: 'purr',
      btnId: 'btn-cat-anim-purr',
      src: 'assets/cat/cat_purr.png',
      label: '[МУРЧАНИЕ]',
      desc: 'Режим глубокой синхронизации. Низкочастотное мурчание и гармонизация контура.',
      status: 'МУРЛЫКАНИЕ',
      sound: 'playCatPurr'
    },
    mischief: {
      id: 'mischief',
      btnId: 'btn-cat-anim-mischief',
      src: 'assets/cat/cat_mischief.png',
      label: '[ШАЛОСТЬ]',
      desc: 'Игровой режим. Проверка кинематики, виляние хвостом и готовность к активности.',
      status: 'ИГРА / ШАЛОСТЬ',
      sound: 'playCatPlay'
    },
    sleep: {
      id: 'sleep',
      btnId: 'btn-cat-anim-sleep',
      src: 'assets/cat/cat_sleep.png',
      label: '[СОН]',
      desc: 'Режим гибернации. Энергосбережение био-контура CAT181b и восстановление буфера.',
      status: 'ГИБЕРНАЦИЯ',
      sound: 'playKeyClick'
    },
    alert: {
      id: 'alert',
      btnId: 'btn-cat-anim-alert',
      src: 'assets/cat/cat_alert.png',
      label: '[ТРЕВОГА]',
      desc: 'Повышенная сенсорная активность. Фиксация аномалий и тревожных сигналов.',
      status: 'ТРЕВОГА-1',
      sound: 'playAccessDenied'
    },
    glitch: {
      id: 'glitch',
      btnId: 'btn-cat-anim-glitch',
      src: 'assets/cat/cat_glitch.png',
      label: '[ГЛИТЧ]',
      desc: 'Кибернетический сбой и помехи шины данных. Требуется калибровка или санитария.',
      status: 'СБОЙ ДАННЫХ',
      sound: 'playKeyBackspace'
    }
  };

  // Псевдонимы обратной совместимости
  const ALIASES = {
    sit: 'idle',
    peek: 'mischief',
    action: 'purr'
  };

  let currentMode = 'idle';
  let baseMode = 'idle';
  let tempTimer = null;
  let headerTimer = null;
  let lastInteraction = Date.now();

  function triggerHaptic(type = 'light') {
    if (window.Telegram && window.Telegram.WebApp && window.Telegram.WebApp.HapticFeedback) {
      try {
        if (type === 'medium') {
          window.Telegram.WebApp.HapticFeedback.impactOccurred('medium');
        } else if (type === 'success') {
          window.Telegram.WebApp.HapticFeedback.notificationOccurred('success');
        } else if (type === 'warning') {
          window.Telegram.WebApp.HapticFeedback.notificationOccurred('warning');
        } else if (type === 'error') {
          window.Telegram.WebApp.HapticFeedback.notificationOccurred('error');
        } else {
          window.Telegram.WebApp.HapticFeedback.impactOccurred('light');
        }
      } catch (e) {}
    }
  }

  /**
   * =========================================================================
   * МЕНЕДЖЕР СИМБИОНТА CAT181b (6-состояний + Тамагочи-контур)
   * =========================================================================
   */
  const CatSymbiont = {
    init: function () {
      this.bindDOM();
      this.startIdleBehavior();
      this.setAnimation('idle');
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

      // Если кот спал — будим его
      if (baseMode === 'sleep' || currentMode === 'sleep') {
        baseMode = 'idle';
        this.setAnimation('idle');
        return;
      }

      // Случайный интерактивный всплеск реакции
      const reactions = ['purr', 'mischief', 'glitch'];
      const alternate = reactions[Math.floor(Math.random() * reactions.length)];
      const headerImg = document.getElementById('cat-header-sprite');
      const headerChip = document.getElementById('cat-status-chip');
      if (headerImg && CAT_ANIMATIONS[alternate]) {
        headerImg.src = CAT_ANIMATIONS[alternate].src;
        if (headerChip) {
          headerChip.textContent = `[CAT181b // ${CAT_ANIMATIONS[alternate].label.replace(/[[\]]/g, '')}]`;
        }
        clearTimeout(headerTimer);
        headerTimer = setTimeout(() => {
          headerImg.src = CAT_ANIMATIONS[baseMode].src;
          if (headerChip) {
            headerChip.textContent = `[CAT181b // ${CAT_ANIMATIONS[baseMode].label.replace(/[[\]]/g, '')}]`;
          }
        }, 3500);
      }
    },

    getAnimation: function () {
      return currentMode;
    },

    setAnimation: function (rawKey, tempDuration = 0) {
      const modeKey = ALIASES[rawKey] || rawKey;
      if (!CAT_ANIMATIONS[modeKey]) return;
      lastInteraction = Date.now();

      if (tempDuration === 0) {
        baseMode = modeKey;
      }

      currentMode = modeKey;
      clearTimeout(tempTimer);

      const anim = CAT_ANIMATIONS[modeKey];

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

      const headerChip = document.getElementById('cat-status-chip');
      if (headerChip) {
        headerChip.textContent = `[CAT181b // ${anim.label.replace(/[[\]]/g, '')}]`;
      }

      const desc = document.getElementById('cat-state-desc');
      if (desc) desc.textContent = anim.desc;

      const stripState = document.getElementById('cat-strip-state');
      if (stripState) stripState.textContent = anim.status;

      // Подсветка кнопок режимов
      Object.keys(CAT_ANIMATIONS).forEach(k => {
        const btn = document.getElementById(CAT_ANIMATIONS[k].btnId);
        if (btn) {
          btn.classList.toggle('active-cat-state', k === baseMode);
        }
      });

      triggerHaptic('light');

      // Если временная анимация (реакция)
      if (tempDuration > 0) {
        tempTimer = setTimeout(() => {
          this.setAnimation(baseMode);
        }, tempDuration);
      }
    },

    // Псевдоним для сохранения совместимости с HTML
    setSteamAnimation: function (modeKey, tempDuration = 0) {
      this.setAnimation(modeKey, tempDuration);
    },

    // Действия взаимодействия (Тамагочи)
    petCat: function () {
      lastInteraction = Date.now();
      triggerHaptic('medium');
      if (window.SoundFX && window.SoundFX.playCatPurr) {
        window.SoundFX.playCatPurr();
      }
      this.setAnimation('purr', 4000);
      const desc = document.getElementById('cat-state-desc');
      if (desc) desc.textContent = 'Контакт с CAT181b установлен. Снижение энтропии контура и мурлыкание.';
    },

    feed: function () {
      lastInteraction = Date.now();
      triggerHaptic('success');
      if (window.SoundFX && window.SoundFX.playCatCrunch) {
        window.SoundFX.playCatCrunch();
      }
      this.setAnimation('purr', 4500);
      const desc = document.getElementById('cat-state-desc');
      if (desc) desc.textContent = 'Прием нутриентов. Био-ресурс CAT181b восполнен (+30%).';
    },

    play: function () {
      lastInteraction = Date.now();
      triggerHaptic('medium');
      if (window.SoundFX && window.SoundFX.playCatPlay) {
        window.SoundFX.playCatPlay();
      }
      this.setAnimation('mischief', 4500);
      const desc = document.getElementById('cat-state-desc');
      if (desc) desc.textContent = 'Тестирование кинематики лап CAT181b. Озорная игра с импульсами.';
    },

    clean: function () {
      lastInteraction = Date.now();
      triggerHaptic('light');
      if (window.SoundFX && window.SoundFX.playKeyClick) {
        window.SoundFX.playKeyClick(960);
      }
      this.setAnimation('idle', 3000);
      const desc = document.getElementById('cat-state-desc');
      if (desc) desc.textContent = 'Продувка оптических сенсоров CAT181b. Санитарный цикл завершен, сбои устранены.';
    },

    triggerAlert: function (duration = 4000) {
      triggerHaptic('warning');
      if (window.SoundFX && window.SoundFX.playAccessDenied) {
        window.SoundFX.playAccessDenied();
      }
      this.setAnimation('alert', duration);
      const desc = document.getElementById('cat-state-desc');
      if (desc) desc.textContent = 'ТРЕВОГА: Зафиксирована аномалия или отказ доступа.';
    },

    triggerGlitch: function (duration = 4000) {
      triggerHaptic('error');
      if (window.SoundFX && window.SoundFX.playKeyBackspace) {
        window.SoundFX.playKeyBackspace();
      }
      this.setAnimation('glitch', duration);
      const desc = document.getElementById('cat-state-desc');
      if (desc) desc.textContent = 'СБОЙ: Помехи шины данных. Запустите санитарию для калибровки.';
    },

    // Фоновые живые реакции и авто-гибернация
    startIdleBehavior: function () {
      setInterval(() => {
        const idleSec = (Date.now() - lastInteraction) / 1000;
        // Если бездействие > 50 секунд — кот плавно засыпает
        if (idleSec > 50 && baseMode === 'idle' && currentMode === 'idle') {
          this.setAnimation('sleep');
        }
      }, 10000);
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
