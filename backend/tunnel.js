// ============================================================
//  tunnel.js — Стабильный туннель через @ngrok/ngrok SDK
//  Пробрасывает Fastify (порт 3000), где крутятся и API, и Frontend
// ============================================================
import ngrok from '@ngrok/ngrok';
import { writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname   = dirname(fileURLToPath(import.meta.url));
const NGROK_TOKEN = process.env.NGROK_TOKEN || '';
const PORT        = process.env.PORT || 3000;

async function startTunnel() {
  console.log('[TUNNEL] Инициализация туннеля ngrok на порт 3000...');

  try {
    const listener = await ngrok.forward({
      addr:      PORT,
      authtoken: NGROK_TOKEN,
    });

    const publicUrl = listener.url();

    console.log('\n════════════════════════════════════════');
    console.log('  PROJECT S-A TERMINAL — ТУННЕЛЬ ACTIVE');
    console.log('════════════════════════════════════════');
    console.log(`  PUBLIC URL: ${publicUrl}`);
    console.log('════════════════════════════════════════\n');

    // Обновляем bot/.env при наличии BOT_TOKEN
    const envPath = join(__dirname, '..', 'bot', '.env');
    const existingToken = process.env.BOT_TOKEN || '';
    if (existingToken) {
      const adminIds = process.env.ADMIN_TELEGRAM_IDS || '';
      const envContent = `BOT_TOKEN=${existingToken}\nWEBAPP_URL=${publicUrl}\nADMIN_TELEGRAM_IDS=${adminIds}\n`;
      writeFileSync(envPath, envContent);
      console.log(`[TUNNEL] bot/.env успешно обновлён: ${publicUrl}`);
    }

    // Heartbeat каждые 30 секунд чтобы процесс не завершался
    const keepAlive = setInterval(() => {
      process.stdout.write('.');
    }, 30000);

    process.on('SIGINT', async () => {
      clearInterval(keepAlive);
      console.log('\n[TUNNEL] Отключение туннеля...');
      await ngrok.disconnect();
      process.exit(0);
    });

  } catch (err) {
    console.error('[TUNNEL][b181] Ошибка подключения:', err.message);
    console.log('[TUNNEL] Повтор через 5 секунд...');
    setTimeout(startTunnel, 5000);
  }
}

startTunnel();
