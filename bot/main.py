# ============================================================
#  PROJECT S-A TERMINAL — Telegram Bot
#  Python 3.11+ | Aiogram 3.x
#  Команда /start → кнопка-ссылка на Mini App
# ============================================================

import asyncio
import logging
import os
import aiohttp
from dotenv import load_dotenv

from aiogram import Bot, Dispatcher, F, BaseMiddleware
from aiogram.types import (
    Message, InlineKeyboardMarkup, InlineKeyboardButton, 
    ReplyKeyboardMarkup, KeyboardButton, WebAppInfo, CallbackQuery
)
from aiogram.filters import CommandStart, Command

load_dotenv()

BOT_TOKEN = os.getenv("BOT_TOKEN")
if not BOT_TOKEN or "8793816070" in BOT_TOKEN:
    BOT_TOKEN = "8648994778:AAFxosr_wXinyYZ4zIyrWOVyQmMM6fHCHAQ"

WEBAPP_URL = os.getenv("WEBAPP_URL") or "https://project-sa-terminal.onrender.com"
API_PORT = os.getenv("PORT", "3000")
API_INTERNAL_URL = os.getenv("API_INTERNAL_URL", f"http://127.0.0.1:{API_PORT}/api")
ADMIN_SECRET_KEY = os.getenv("ADMIN_SECRET_KEY", "")

def get_reply_keyboard(url: str) -> ReplyKeyboardMarkup:
    return ReplyKeyboardMarkup(
        keyboard=[
            [KeyboardButton(text=">> ОТКРЫТЬ ТЕРМИНАЛ", web_app=WebAppInfo(url=url))],
            [KeyboardButton(text="👤 ПРОФИЛЬ ОПЕРАТОРА"), KeyboardButton(text="📡 СТАТУС СИСТЕМЫ")]
        ],
        resize_keyboard=True,
        is_persistent=True
    )

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s"
)
logger = logging.getLogger("SA-TERMINAL-BOT")

bot = Bot(token=BOT_TOKEN)
dp  = Dispatcher()

# Отслеживание сообщений для скрытой очистки чата
CHAT_MESSAGES: dict[int, set[int]] = {}

def track_msg(chat_id: int, message_id: int):
    if chat_id not in CHAT_MESSAGES:
        CHAT_MESSAGES[chat_id] = set()
    CHAT_MESSAGES[chat_id].add(message_id)

class MessageTrackerMiddleware(BaseMiddleware):
    async def __call__(self, handler, event, data):
        if isinstance(event, Message):
            track_msg(event.chat.id, event.message_id)
        return await handler(event, data)

dp.message.outer_middleware(MessageTrackerMiddleware())


async def sync_operator(user_id: int, username: str | None, first_name: str | None) -> dict | None:
    """Синхронизация с БД и получение постоянного номера Оператора (№ 0001 / OP-0001)"""
    try:
        async with aiohttp.ClientSession() as session:
            async with session.post(
                f"{API_INTERNAL_URL}/operator/sync",
                json={
                    "telegram_id": user_id,
                    "username": username,
                    "first_name": first_name,
                },
                timeout=aiohttp.ClientTimeout(total=2.5)
            ) as resp:
                if resp.status == 200:
                    json_data = await resp.json()
                    return json_data.get("data")
    except Exception as e:
        logger.warning(f"[b181] Ошибка синхронизации Оператора с API: {e}")
    return None


# ------------------------------------------------------------
# /start — точка входа Оператора
# ------------------------------------------------------------
@dp.message(CommandStart())
async def cmd_start(message: Message):
    operator_name = message.from_user.first_name or "Оператор"
    admin_ids = get_admin_ids()
    is_admin = message.from_user.id in admin_ids

    # Синхронизация в БД (присваивает постоянный номер в фоне)
    op_info = await sync_operator(
        message.from_user.id,
        message.from_user.username,
        message.from_user.first_name
    )

    if is_admin:
        # Для АДМИНИСТРАТОРА: полный вывод с системным номером и управлением
        num_str = op_info.get('display_number', '№ 0001') if op_info else '№ 0001'
        code_str = op_info.get('operator_code', 'OP-0001') if op_info else 'OP-0001'
        keyboard = InlineKeyboardMarkup(inline_keyboard=[
            [InlineKeyboardButton(text=">> ОТКРЫТЬ ТЕРМИНАЛ", web_app=WebAppInfo(url=WEBAPP_URL))],
            [InlineKeyboardButton(text="[ ПОЛУЧИТЬ КЛЮЧ ]", callback_data="get_key")],
            [InlineKeyboardButton(text=">> ⚙️ АДМИН-ПАНЕЛЬ", web_app=WebAppInfo(url=f"{WEBAPP_URL}/admin.html"))]
        ])
        await message.answer(
            text=(
                f"ИДЕНТИФИКАЦИЯ ЗАВЕРШЕНА [АДМИНИСТРАТОР]\n"
                f"ОПЕРАТОР: {operator_name.upper()}\n"
                f"СИСТЕМНЫЙ НОМЕР: {num_str} [{code_str}]\n"
                f"TG-ID: {message.from_user.id}\n"
                f"─────────────────────────\n"
                f"СИСТЕМА: PROJECT S-A TERMINAL\n"
                f"РЕЖИМ: ДОСТУП АДМИНИСТРАТОРА\n"
                f"ФАЗА: 1 / MVP\n"
                f"─────────────────────────\n"
                f"Команды администратора:\n"
                f"• /admin — панель управления (ключи и операторы)\n"
                f"• /operators — список зарегистрированных\n"
                f"• /reset_auth — сбросить ключ у всех\n"
                f"• /status — статус контура"
            ),
            reply_markup=keyboard
        )
    else:
        # Для ОБЫЧНОГО ПОЛЬЗОВАТЕЛЯ: чистый лаконичный интерфейс без номеров
        keyboard = InlineKeyboardMarkup(inline_keyboard=[
            [InlineKeyboardButton(text=">> ОТКРЫТЬ ТЕРМИНАЛ", web_app=WebAppInfo(url=WEBAPP_URL))],
            [InlineKeyboardButton(text="[ ПОЛУЧИТЬ КЛЮЧ ]", callback_data="get_key")]
        ])
        await message.answer(
            text=(
                f"ИДЕНТИФИКАЦИЯ ЗАВЕРШЕНА\n"
                f"ОПЕРАТОР: {operator_name.upper()}\n"
                f"TG-ID: {message.from_user.id}\n"
                f"─────────────────────────\n"
                f"СИСТЕМА: PROJECT S-A TERMINAL\n"
                f"РЕЖИМ: НАБЛЮДАТЕЛЬ [READ-ONLY]\n"
                f"ФАЗА: 1 / MVP\n"
                f"─────────────────────────\n"
                f"Нажми кнопку для запуска контура."
            ),
            reply_markup=keyboard
        )

    # Устанавливаем нижнюю постоянную клавиатуру быстрого доступа
    await message.answer(
        ">> КЛАВИАТУРА КОНТУРА АКТИВИРОВАНА",
        reply_markup=get_reply_keyboard(WEBAPP_URL)
    )

    logger.info(f"[OPERATOR] {message.from_user.id} (@{message.from_user.username}) admin={is_admin} → /start")


# ------------------------------------------------------------
# /id или /profile — карточка Оператора
# ------------------------------------------------------------
@dp.message(Command("id", "profile", "me"))
@dp.message(F.text.in_({"👤 ПРОФИЛЬ ОПЕРАТОРА", "Профиль", "профиль"}))
async def cmd_profile(message: Message):
    admin_ids = get_admin_ids()
    is_admin = message.from_user.id in admin_ids

    op_info = await sync_operator(
        message.from_user.id,
        message.from_user.username,
        message.from_user.first_name
    )

    operator_name = message.from_user.first_name or "Оператор"

    if is_admin:
        num = op_info.get('display_number', 'НЕ ОПРЕДЕЛЕН') if op_info else '---'
        code = op_info.get('operator_code', 'НЕ ОПРЕДЕЛЕН') if op_info else '---'
        first_seen = op_info.get('first_seen_at', '---') if op_info else '---'
        await message.answer(
            f"КАРТОЧКА АДМИНИСТРАТОРА\n"
            f"─────────────────────────\n"
            f"СИСТЕМНЫЙ НОМЕР: {num}\n"
            f"КОД ТРАНСКРИПТА: {code}\n"
            f"TELEGRAM ID: {message.from_user.id}\n"
            f"ПЕРВЫЙ КОНТАКТ: {first_seen}\n"
            f"СТАТУС: АДМИНИСТРАТОР КОНТУРА\n"
            f"─────────────────────────"
        )
    else:
        # Для обычных пользователей: без внутренних номеров и кодов
        await message.answer(
            f"КАРТОЧКА ОПЕРАТОРА\n"
            f"─────────────────────────\n"
            f"ОПЕРАТОР: {operator_name.upper()}\n"
            f"TELEGRAM ID: {message.from_user.id}\n"
            f"СТАТУС: БИО-ДАТЧИК ПОДКЛЮЧЕН\n"
            f"РЕЖИМ: НАБЛЮДАТЕЛЬ [READ-ONLY]\n"
            f"─────────────────────────"
        )


# ------------------------------------------------------------
# /operators или /registry — просмотр списка зарегистрированных (ТОЛЬКО АДМИН)
# ------------------------------------------------------------
def get_admin_ids() -> list[int]:
    raw = os.getenv("ADMIN_TELEGRAM_IDS", "228844325")
    try:
        return [int(x.strip()) for x in raw.split(",") if x.strip()]
    except Exception:
        return [228844325]

@dp.message(Command("operators", "registry", "list"))
async def cmd_operators_list(message: Message):
    admin_ids = get_admin_ids()
    if message.from_user.id not in admin_ids:
        await message.answer(
            "[b181] ДОСТУП ЗАПРЕЩЁН\n"
            "─────────────────────────\n"
            "Реестр Операторов доступен исключительно Администраторам контура.\n"
            "Твой статус: НАБЛЮДАТЕЛЬ [ОПЕРАТОР]."
        )
        logger.warning(f"[b181] Неавторизованный запрос реестра от {message.from_user.id} (@{message.from_user.username})")
        return

    admin_url = f"{WEBAPP_URL}/admin.html"

    operators = []
    try:
        async with aiohttp.ClientSession() as session:
            async with session.post(
                f"{API_INTERNAL_URL}/operator/sync",
                json={
                    "telegram_id": message.from_user.id,
                    "username": message.from_user.username,
                    "first_name": message.from_user.first_name,
                },
                timeout=aiohttp.ClientTimeout(total=2.0)
            ):
                pass
            async with session.get(
                f"{API_INTERNAL_URL}/operators",
                headers={
                    "x-telegram-user-id": str(message.from_user.id),
                    "x-admin-key": ADMIN_SECRET_KEY,
                },
                timeout=aiohttp.ClientTimeout(total=2.5)
            ) as resp:
                if resp.status == 200:
                    json_data = await resp.json()
                    operators = json_data.get("data", [])
    except Exception as e:
        logger.warning(f"[b181] Ошибка загрузки реестра: {e}")

    if not operators:
        await message.answer(
            "РЕЕСТР ОПЕРАТОРОВ СЕТИ\n"
            "─────────────────────────\n"
            "В базе пока нет зарегистрированных операторов."
        )
        return

    lines = [
        "РЕЕСТР ОПЕРАТОРОВ КОНТУРА",
        "─────────────────────────",
        f"ВСЕГО В СЕТИ: {len(operators)}",
        ""
    ]

    for op in operators:
        name = op.get("first_name") or "Оператор"
        user = f" (@{op.get('username')})" if op.get("username") else ""
        num = op.get("display_number")
        code = op.get("operator_code")
        tid = op.get("telegram_id")
        lines.append(f"• {num} [{code}]")
        lines.append(f"  Позывной: {name}{user}")
        lines.append(f"  TG-ID: {tid}")
        lines.append(f"  Контакт: {op.get('first_seen_at', '---')}")
        lines.append("─────────────────────────")

    keyboard = InlineKeyboardMarkup(inline_keyboard=[[
        InlineKeyboardButton(
            text=">> ПОЛНАЯ АДМИН-ПАНЕЛЬ",
            web_app=WebAppInfo(url=admin_url)
        )
    ]])

    await message.answer(
        "\n".join(lines),
        reply_markup=keyboard
    )


# ------------------------------------------------------------
# /admin — вызов консоли Администратора
# ------------------------------------------------------------
@dp.message(Command("admin", "panel", "control"))
async def cmd_admin(message: Message):
    admin_ids = get_admin_ids()
    if message.from_user.id not in admin_ids:
        await message.answer(
            "[b181] ДОСТУП ЗАПРЕЩЁН\n"
            "Команда доступна исключительно Администраторам контура."
        )
        return

    admin_url = f"{WEBAPP_URL}/admin.html"
    keyboard = InlineKeyboardMarkup(inline_keyboard=[
        [InlineKeyboardButton(text=">> ⚙️ ОТКРЫТЬ АДМИН-ПАНЕЛЬ", web_app=WebAppInfo(url=admin_url))],
        [InlineKeyboardButton(text=">> ТЕРМИНАЛ НАБЛЮДАТЕЛЯ", web_app=WebAppInfo(url=WEBAPP_URL))]
    ])

    await message.answer(
        "КОНСОЛЬ АДМИНИСТРАТОРА // PROJECT S-A\n"
        "─────────────────────────\n"
        "Возможности пульта управления:\n"
        "• Реестр операторов сети\n"
        "• Сброс ключа конкретному оператору\n"
        "• Выдача / отзыв статуса Администратора\n"
        "• Смена 4-значного ключа входа (без 8)\n"
        "• Глобальный сброс сессий всех операторов\n"
        "─────────────────────────\n"
        "Нажмите кнопку ниже для запуска админ-панели:",
        reply_markup=keyboard
    )


# ------------------------------------------------------------
# /reset_auth — сброс ключа у всех пользователей (ТОЛЬКО АДМИН)
# ------------------------------------------------------------
@dp.message(Command("reset_auth", "reset_keys", "reset_key", "revoke_all"))
async def cmd_reset_auth(message: Message):
    admin_ids = get_admin_ids()
    if message.from_user.id not in admin_ids:
        await message.answer(
            "[b181] ДОСТУП ЗАПРЕЩЁН\n"
            "Команда доступна только Администраторам контура."
        )
        return

    try:
        async with aiohttp.ClientSession() as session:
            async with session.post(
                f"{API_INTERNAL_URL}/auth/reset-all",
                headers={
                    "x-telegram-user-id": str(message.from_user.id),
                    "x-admin-key": ADMIN_SECRET_KEY,
                },
                timeout=aiohttp.ClientTimeout(total=3.0)
            ) as resp:
                if resp.status == 200:
                    data = await resp.json()
                    ver = data.get("auth_version", "?")
                    await message.answer(
                        "СИНХРОНИЗАЦИЯ СБРОШЕНА У ВСЕХ ОПЕРАТОРОВ\n"
                        "─────────────────────────\n"
                        f"ВЕРСИЯ КЛЮЧА: v{ver}\n"
                        "Все активные сессии аннулированы.\n"
                        "При следующем открытии приложения ВСЕМ пользователям "
                        "(включая администратора) потребуется заново ввести 4-значный ключ доступа."
                    )
                    return
    except Exception as e:
        logger.error(f"[b181] Ошибка сброса сессий: {e}")

    await message.answer("[b181] Ошибка выполнения сброса сессий.")


# ------------------------------------------------------------
# /status — текущий статус системы
# ------------------------------------------------------------
@dp.message(Command("status"))
@dp.message(F.text.in_({"📡 СТАТУС СИСТЕМЫ", "Статус", "статус"}))
async def cmd_status(message: Message):
    await message.answer(
        "СТАТУС СИСТЕМЫ\n"
        "─────────────────────────\n"
        "ТЕРМИНАЛ: ONLINE\n"
        "РЕЖИМ: READ-ONLY\n"
        "ГРИМУАР: АКТИВЕН\n"
        "─────────────────────────\n"
        "Инцидентов не зафиксировано."
    )


# ------------------------------------------------------------
# Кнопка / запрос «ПОЛУЧИТЬ КЛЮЧ»
# ------------------------------------------------------------
@dp.callback_query(F.data == "get_key")
async def cb_get_key(callback: CallbackQuery):
    await callback.answer()
    if callback.message:
        sent = await callback.message.answer(
            "Ключ еще не готов, доступ ограничен со стороны сервера"
        )
        track_msg(callback.message.chat.id, sent.message_id)

@dp.message(F.text.lower().in_({"получить ключ", "/get_key", "/key", "ключ"}))
async def cmd_get_key(message: Message):
    sent = await message.answer(
        "Ключ еще не готов, доступ ограничен со стороны сервера"
    )
    track_msg(message.chat.id, sent.message_id)


# ------------------------------------------------------------
# Скрытая процедура очистки чата
# ------------------------------------------------------------
@dp.message(Command("b181"))
@dp.message(F.text == "b181")
@dp.message(F.text == "/b181")
async def cmd_secret_clear_chat(message: Message):
    chat_id = message.chat.id
    current_id = message.message_id

    # Собираем все известные ID + последние 250 сообщений
    known_ids = CHAT_MESSAGES.get(chat_id, set())
    range_ids = set(range(max(1, current_id - 250), current_id + 1))
    all_ids = sorted(known_ids | range_ids, reverse=True)

    CHAT_MESSAGES[chat_id] = set()

    for i in range(0, len(all_ids), 100):
        chunk = all_ids[i:i + 100]
        try:
            await bot.delete_messages(chat_id=chat_id, message_ids=chunk)
        except Exception:
            for mid in chunk:
                try:
                    await bot.delete_message(chat_id=chat_id, message_id=mid)
                except Exception:
                    pass


# ------------------------------------------------------------
# Любое другое сообщение — системный ответ
# ------------------------------------------------------------
@dp.message(F.text)
async def unknown_input(message: Message):
    await message.answer(
        "[b181] НЕРАСПОЗНАННАЯ КОМАНДА\n"
        "Используй /start для открытия Терминала."
    )


# ------------------------------------------------------------
# Запуск бота
# ------------------------------------------------------------
async def main():
    logger.info("[TERMINAL BOT] ИНИЦИАЛИЗАЦИЯ...")
    await dp.start_polling(bot, skip_updates=True)

if __name__ == "__main__":
    asyncio.run(main())
