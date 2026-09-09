/**
 * =============================================================================
 * PROJECT S-A TERMINAL // SOVIET CYBERNETIC SOUND ENGINE (ZzFX Web Audio API)
 * ГОСТ-КБ-181-СПЕЦ // Автономный процедурный синтезатор звуков интерфейса
 * Ревизия: v0.4a
 * =============================================================================
 */

(function (window) {
  'use strict';

  let audioCtx = null;
  let masterGain = null;
  let isSoundEnabled = localStorage.getItem('sa_sound_enabled') !== 'false';

  // Ленивая инициализация AudioContext по первому взаимодействию
  function getAudioContext() {
    if (!audioCtx) {
      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      if (!AudioContextClass) return null;
      audioCtx = new AudioContextClass();
      masterGain = audioCtx.createGain();
      masterGain.gain.setValueAtTime(0.22, audioCtx.currentTime); // Комфортная громкость
      masterGain.connect(audioCtx.destination);
    }
    if (audioCtx.state === 'suspended') {
      audioCtx.resume().catch(() => {});
    }
    return audioCtx;
  }

  // Генератор короткого импульсного белого шума для транзиентов клавиш
  function createNoiseBuffer(ctx, duration = 0.02) {
    const bufferSize = Math.floor(ctx.sampleRate * duration);
    const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const output = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      output[i] = Math.random() * 2 - 1;
    }
    return buffer;
  }

  const SoundFX = {
    // Проверка статуса звука
    isEnabled: function () {
      return isSoundEnabled;
    },

    // Переключение тумблера звука
    toggle: function () {
      isSoundEnabled = !isSoundEnabled;
      localStorage.setItem('sa_sound_enabled', isSoundEnabled ? 'true' : 'false');
      this.updateUI();
      if (isSoundEnabled) {
        this.playKeyClick(1100);
      }
      return isSoundEnabled;
    },

    // Синхронизация текста и стилей всех кнопок звука в DOM
    updateUI: function () {
      const buttons = document.querySelectorAll('.btn-sound-toggle');
      buttons.forEach(btn => {
        if (isSoundEnabled) {
          btn.innerHTML = '<span class="sound-icon">🔊</span><span class="sound-label">ЗВУК: [ВКЛ]</span>';
          btn.classList.add('sound-active');
          btn.classList.remove('sound-muted');
          btn.setAttribute('title', 'Звук терминала включен (нажмите для отключения)');
        } else {
          btn.innerHTML = '<span class="sound-icon">🔇</span><span class="sound-label">ЗВУК: [ВЫКЛ]</span>';
          btn.classList.remove('sound-active');
          btn.classList.add('sound-muted');
          btn.setAttribute('title', 'Звук терминала выключен (нажмите для включения)');
        }
      });
    },

    /**
     * 1. ЩЕЛЧОК КЛАВИШИ (Герконовое реле клавиатуры 3×4)
     * Короткий механический импульс с резким спадом
     */
    playKeyClick: function (baseFreq = 860) {
      if (!isSoundEnabled) return;
      const ctx = getAudioContext();
      if (!ctx) return;

      const t = ctx.currentTime;

      // Основной тональный импульс
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(baseFreq, t);
      osc.frequency.exponentialRampToValueAtTime(140, t + 0.024);

      gain.gain.setValueAtTime(0.5, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.024);

      osc.connect(gain);
      gain.connect(masterGain);
      osc.start(t);
      osc.stop(t + 0.026);

      // Механический микро-шум щелчка (пластик + металл)
      try {
        const noise = ctx.createBufferSource();
        noise.buffer = createNoiseBuffer(ctx, 0.012);
        const noiseFilter = ctx.createBiquadFilter();
        noiseFilter.type = 'bandpass';
        noiseFilter.frequency.setValueAtTime(2800, t);
        noiseFilter.Q.setValueAtTime(3.0, t);

        const noiseGain = ctx.createGain();
        noiseGain.gain.setValueAtTime(0.2, t);
        noiseGain.gain.exponentialRampToValueAtTime(0.001, t + 0.012);

        noise.connect(noiseFilter);
        noiseFilter.connect(noiseGain);
        noiseGain.connect(masterGain);
        noise.start(t);
      } catch (e) {}
    },

    /**
     * 2. ЩЕЛЧОК СТИРАНИЯ СИМВОЛА (BACKSPACE / СБРОС)
     * Более низкий, глухой механический отбой
     */
    playKeyBackspace: function () {
      if (!isSoundEnabled) return;
      this.playKeyClick(520);
    },

    /**
     * 3. РАЗРЕШЕНИЕ ДОСТУПА // ГОСТ-КБ-181 (Гармонический институциональный гонг)
     * Тройной восходящий гармонический аккорд (659 Гц -> 880 Гц -> 1318 Гц)
     */
    playAccessGranted: function () {
      if (!isSoundEnabled) return;
      const ctx = getAudioContext();
      if (!ctx) return;

      const t = ctx.currentTime;
      const freqs = [659.25, 880.0, 1318.51]; // E5, A5, E6
      const offsets = [0, 0.07, 0.15];

      freqs.forEach((freq, idx) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        const noteTime = t + offsets[idx];

        osc.type = 'sine';
        osc.frequency.setValueAtTime(freq, noteTime);

        gain.gain.setValueAtTime(0.001, noteTime);
        gain.gain.linearRampToValueAtTime(0.45, noteTime + 0.015);
        gain.gain.exponentialRampToValueAtTime(0.001, noteTime + 0.35);

        osc.connect(gain);
        gain.connect(masterGain);
        osc.start(noteTime);
        osc.stop(noteTime + 0.36);
      });
    },

    /**
     * 4. ОТКАЗ В ДОСТУПЕ // СБОЙ (Тревожный скрежет и зуммер)
     * Диссонирующая пилообразная волна с модуляцией
     */
    playAccessDenied: function () {
      if (!isSoundEnabled) return;
      const ctx = getAudioContext();
      if (!ctx) return;

      const t = ctx.currentTime;
      // Две серии тревожного зуммера
      [0, 0.12].forEach((offset) => {
        const osc1 = ctx.createOscillator();
        const osc2 = ctx.createOscillator();
        const gain = ctx.createGain();
        const pulseTime = t + offset;

        osc1.type = 'sawtooth';
        osc2.type = 'square';
        osc1.frequency.setValueAtTime(148, pulseTime);
        osc2.frequency.setValueAtTime(155, pulseTime); // Биения для тревожного диссонанса

        gain.gain.setValueAtTime(0.4, pulseTime);
        gain.gain.exponentialRampToValueAtTime(0.001, pulseTime + 0.09);

        osc1.connect(gain);
        osc2.connect(gain);
        gain.connect(masterGain);

        osc1.start(pulseTime);
        osc2.start(pulseTime);
        osc1.stop(pulseTime + 0.1);
        osc2.stop(pulseTime + 0.1);
      });
    },

    /**
     * 5. ПЕРЕКЛЮЧЕНИЕ ТЕМЫ // ТУМБЛЕР ПИТАНИЯ (Массивный щелчок советского рубильника)
     */
    playThemeSwitch: function () {
      if (!isSoundEnabled) return;
      const ctx = getAudioContext();
      if (!ctx) return;

      const t = ctx.currentTime;
      // Тяжелый низкий глухой щелчок
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(160, t);
      osc.frequency.exponentialRampToValueAtTime(45, t + 0.04);

      gain.gain.setValueAtTime(0.7, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.04);

      osc.connect(gain);
      gain.connect(masterGain);
      osc.start(t);
      osc.stop(t + 0.05);

      // Металлический отскок
      this.playKeyClick(1400);
    },

    /**
     * 6. БИО-ОТКЛИК ТЕРРАРИУМА (Водяной резонансный пузырек аксолотля b181)
     */
    playBioPulse: function () {
      if (!isSoundEnabled) return;
      const ctx = getAudioContext();
      if (!ctx) return;

      const t = ctx.currentTime;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = 'sine';
      const startF = 380 + Math.random() * 80;
      osc.frequency.setValueAtTime(startF, t);
      osc.frequency.exponentialRampToValueAtTime(startF * 2.2, t + 0.06);

      gain.gain.setValueAtTime(0.3, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.07);

      osc.connect(gain);
      gain.connect(masterGain);
      osc.start(t);
      osc.stop(t + 0.08);
    },

    /**
     * 7. ЭКСТРЕННЫЙ СБРОС (Сирена аварийного прерывания)
     */
    playEmergencyAbort: function () {
      if (!isSoundEnabled) return;
      const ctx = getAudioContext();
      if (!ctx) return;

      const t = ctx.currentTime;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(980, t);
      osc.frequency.exponentialRampToValueAtTime(220, t + 0.28);

      gain.gain.setValueAtTime(0.5, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.28);

      osc.connect(gain);
      gain.connect(masterGain);
      osc.start(t);
      osc.stop(t + 0.3);
    }
  };

  // Автоматическая привязка к разблокировке аудио по первому тапу
  const unlockAudio = function () {
    getAudioContext();
    window.removeEventListener('click', unlockAudio);
    window.removeEventListener('touchstart', unlockAudio);
    window.removeEventListener('keydown', unlockAudio);
  };
  window.addEventListener('click', unlockAudio, { passive: true });
  window.addEventListener('touchstart', unlockAudio, { passive: true });
  window.addEventListener('keydown', unlockAudio, { passive: true });

  // Экспорт в глобальную область
  window.SoundFX = SoundFX;

  // Инициализация UI кнопок после загрузки DOM
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => SoundFX.updateUI());
  } else {
    SoundFX.updateUI();
  }
})(window);
