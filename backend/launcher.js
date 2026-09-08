// ============================================================
//  PROJECT S-A TERMINAL — ЕДИНЫЙ ЛАУНЧЕР ВСЕХ СИСТЕМ
//  Запускает: Backend (Node.js) + Ngrok (HTTPS) + Telegram Bot (Python)
// ============================================================
import ngrok from '@ngrok/ngrok';
import { spawn, execSync } from 'child_process';
import { writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const NGROK_TOKEN = process.env.NGROK_TOKEN || '';
const PORT = process.env.PORT || 3000;

let serverProcess = null;
let botProcess = null;

function killTree(proc) {
  if (!proc || !proc.pid) return;
  try {
    execSync(`taskkill /F /T /PID ${proc.pid} >nul 2>&1`);
  } catch (_) {}
}

function freePort(port) {
  try {
    const out = execSync(`netstat -ano | findstr :${port}`, { encoding: 'utf8' });
    const lines = out.trim().split('\n');
    for (const line of lines) {
      if (!line.includes('LISTENING')) continue;
      const parts = line.trim().split(/\s+/);
      const pid = parts[parts.length - 1];
      if (pid && pid !== '0' && pid !== String(process.pid)) {
        try { execSync(`taskkill /F /PID ${pid} >nul 2>&1`); } catch (_) {}
      }
    }
  } catch (_) {}
}

async function launchAll() {
  console.log('════════════════════════════════════════════════════════════');
  console.log('         PROJECT S-A TERMINAL // ЕДИНЫЙ ЗАПУСК СИСТЕМЫ       ');
  console.log('════════════════════════════════════════════════════════════\n');

  // Предварительная очистка порта и процессов
  freePort(PORT);
  try {
    execSync('taskkill /F /IM python.exe >nul 2>&1');
  } catch (_) {}

  // 0. Автоматическая синхронизация карточек из папки cards/*.txt
  console.log('[0/3] Синхронизация карточек из папки cards/...');
  try {
    execSync('node src/db/syncCards.js', { cwd: __dirname, stdio: 'inherit' });
  } catch (err) {
    console.warn('[SYNC] Предупреждение:', err.message);
  }

  // 1. Запуск Backend сервера
  console.log('[1/3] Запуск Backend сервера (Fastify + SQLite)...');
  serverProcess = spawn('node', ['src/index.js'], {
    cwd: __dirname,
    stdio: 'inherit',
    shell: true,
  });

  // Ждём 2.5 секунды, пока Fastify поднимется на порту 3000
  await new Promise(r => setTimeout(r, 2500));

  // 2. Запуск Ngrok туннеля
  console.log('[2/3] Подключение HTTPS туннеля ngrok...');
  let publicUrl = '';
  try {
    const ngrokOpts = {
      addr: PORT,
      authtoken: NGROK_TOKEN || '3Ix640F1op6BN3O9irk5hg2gozo_FQVKguMUdHwGCjWjgL6M',
    };
    // Используем закрепленный домен
    ngrokOpts.domain = 'require-cursive-gone.ngrok-free.dev';

    const listener = await ngrok.forward(ngrokOpts);
    publicUrl = listener.url();
    console.log(`[TUNNEL] Публичный URL: ${publicUrl}`);

    // Обновляем bot/.env при наличии BOT_TOKEN
    const envPath = join(__dirname, '..', 'bot', '.env');
    const existingToken = process.env.BOT_TOKEN || '8648994778:AAFxosr_wXinyYZ4zIyrWOVyQmMM6fHCHAQ';
    const adminIds = process.env.ADMIN_TELEGRAM_IDS || '228844325';
    const envContent = `BOT_TOKEN=${existingToken}\nWEBAPP_URL=${publicUrl}\nADMIN_TELEGRAM_IDS=${adminIds}\n`;
    writeFileSync(envPath, envContent);
    console.log(`[TUNNEL] bot/.env успешно обновлён с новым URL.`);

    // Обновляем кнопку меню в Telegram
    try {
      await fetch(`https://api.telegram.org/bot${existingToken}/setChatMenuButton`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          menu_button: {
            type: 'web_app',
            text: '>> ТЕРМИНАЛ S-A',
            web_app: { url: publicUrl }
          }
        })
      });
      console.log(`[TELEGRAM] Кнопка меню обновлена на ${publicUrl}`);
    } catch (err) {
      console.warn('[TELEGRAM] Ошибка обновления кнопки меню:', err.message);
    }
  } catch (err) {
    console.error(`\n[b181] Ошибка запуска туннеля ngrok: ${err.message}`);
    killTree(serverProcess);
    process.exit(1);
  }

  // 3. Запуск Telegram бота
  console.log('[3/3] Запуск Telegram-бота (@Project_Terminal_bot)...');
  botProcess = spawn('python', ['main.py'], {
    cwd: join(__dirname, '..', 'bot'),
    stdio: 'inherit',
    shell: true,
  });

  console.log('\n════════════════════════════════════════════════════════════');
  console.log('  ВСЕ СИСТЕМЫ УСПЕШНО ЗАПУЩЕНЫ И РАБОТАЮТ!');
  console.log('════════════════════════════════════════════════════════════');
  console.log(`  • Сервер (API + Frontend):  http://localhost:${PORT}`);
  console.log(`  • Публичный HTTPS туннель:  ${publicUrl}`);
  console.log(`  • Реестр для браузера:      ${publicUrl}/registry.html`);
  console.log(`  • Telegram-бот:             https://t.me/Project_Terminal_bot`);
  console.log('════════════════════════════════════════════════════════════');
  console.log('  -> Заходи в Telegram и нажимай /start');
  console.log('  -> Для остановки нажми Ctrl+C в этом окне\n');

  // Корректное завершение при закрытии окна или Ctrl+C
  const cleanup = async () => {
    console.log('\n[ЗАВЕРШЕНИЕ] Остановка всех сервисов...');
    killTree(botProcess);
    killTree(serverProcess);
    try {
      await ngrok.disconnect();
    } catch (_) {}
    process.exit(0);
  };

  process.on('SIGINT', cleanup);
  process.on('SIGTERM', cleanup);
}

launchAll();
