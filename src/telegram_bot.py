import json
import os
import re
import sys
import urllib.error
import urllib.request
from datetime import datetime, timezone

from telegram import Update
from telegram.ext import Application, CallbackQueryHandler, CommandHandler, ContextTypes


TOKEN = os.environ.get("TELEGRAM_BOT_TOKEN", "").strip()
ALLOWED_USER_ID = os.environ.get("TELEGRAM_ALLOWED_USER_ID", "").strip()
SERVER_URL = os.environ.get("TELEGRAM_SERVER_URL", "http://127.0.0.1:8787").rstrip("/")


def utc_now():
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


def emit(event_type, **payload):
    print(json.dumps({"type": event_type, **payload}, ensure_ascii=False), flush=True)


def user_payload(user):
    if not user:
        return {"id": "telegram", "username": "telegram", "source": "telegram-python"}
    return {
        "id": str(user.id),
        "username": user.username or "",
        "first_name": user.first_name or "",
        "last_name": user.last_name or "",
        "source": "telegram-python",
    }


def is_authorized(user):
    return not ALLOWED_USER_ID or (user and str(user.id) == ALLOWED_USER_ID)


def request_json(path, method="GET", body=None):
    data = None
    headers = {"Accept": "application/json"}
    if body is not None:
        data = json.dumps(body).encode("utf-8")
        headers["Content-Type"] = "application/json"

    request = urllib.request.Request(f"{SERVER_URL}{path}", data=data, headers=headers, method=method)
    with urllib.request.urlopen(request, timeout=20) as response:
        raw = response.read().decode("utf-8")
        return json.loads(raw) if raw else {}


async def fetch_local_json(path, method="GET", body=None):
    import asyncio

    return await asyncio.to_thread(request_json, path, method, body)


async def debug_command(update: Update, context: ContextTypes.DEFAULT_TYPE):
    emit("status", event="command", command="/debug", lastPollAt=utc_now())
    if not is_authorized(update.effective_user):
        await update.effective_message.reply_text("No autorizado para usar este bot.")
        return

    try:
        payload = await fetch_local_json("/api/telegram/debug")
        text = payload.get("text") or "No se pudo generar el debug."
    except Exception as error:
        emit("error", message=f"/debug falló: {error}")
        text = f"No pude consultar el servidor local: {error}"

    await update.effective_message.reply_text(text, disable_web_page_preview=True)


async def help_command(update: Update, context: ContextTypes.DEFAULT_TYPE):
    emit("status", event="command", command="/help", lastPollAt=utc_now())
    if not is_authorized(update.effective_user):
        await update.effective_message.reply_text("No autorizado para usar este bot.")
        return

    await update.effective_message.reply_text("Spider Tracker activo. Comandos disponibles: /debug")


async def review_callback(update: Update, context: ContextTypes.DEFAULT_TYPE):
    query = update.callback_query
    emit("status", event="callback_query", lastPollAt=utc_now())

    if not query:
        return

    if not is_authorized(query.from_user):
        await query.answer("No autorizado para esta acción.", show_alert=True)
        return

    match = re.match(r"^review:(\d+):(approve|reject)$", query.data or "")
    if not match:
        await query.answer("Acción desconocida.", show_alert=True)
        return

    review_id = int(match.group(1))
    action = match.group(2)

    try:
        result = await fetch_local_json(
            f"/api/reviews/{review_id}/decision",
            "POST",
            {"action": action, "user": user_payload(query.from_user)},
        )
    except urllib.error.HTTPError as error:
        if error.code == 409:
            await query.answer("Esa revisión ya fue resuelta.")
            return
        if error.code == 404:
            await query.answer("Revisión inexistente.", show_alert=True)
            return
        emit("error", message=f"callback review {review_id} devolvió HTTP {error.code}")
        await query.answer(f"Error local HTTP {error.code}.", show_alert=True)
        return
    except Exception as error:
        emit("error", message=f"callback review {review_id} falló: {error}")
        await query.answer(f"No pude resolver la revisión: {error}", show_alert=True)
        return

    await query.answer("Cómic agregado." if action == "approve" else "Cómic rechazado.")

    review = result.get("review") or {}
    if query.message and review:
        verb = "AGREGADO" if action == "approve" else "RECHAZADO"
        username = query.from_user.username or query.from_user.first_name or str(query.from_user.id)
        matches = ", ".join(review.get("matchSummary") or []) or "Sin coincidencias fuertes"
        text = "\n".join([
            f"Revisión {verb}",
            "",
            f"Título: {review.get('title') or 'Sin título'}",
            f"Volumen: {review.get('volumeName') or 'Sin detectar'}{f' / {review.get('issueLabel')}' if review.get('issueLabel') else ''}",
            f"Fecha: {review.get('releaseDate') or 'Sin fecha'}",
            f"Coincidencias: {matches}",
            f"Resuelto por: @{username}" if query.from_user.username else f"Resuelto por: {username}",
            "",
            review.get("fandomUrl") or "",
        ]).strip()
        try:
            await query.message.edit_text(text, disable_web_page_preview=True, reply_markup=None)
        except Exception as error:
            emit("error", message=f"No pude editar mensaje resuelto: {error}")


async def error_handler(update: object, context: ContextTypes.DEFAULT_TYPE):
    emit("error", message=str(context.error))


async def post_init(application: Application):
    bot = await application.bot.get_me()
    emit("ready", username=bot.username or "", firstName=bot.first_name or "", lastPollAt=utc_now())


def main():
    if not TOKEN:
        emit("error", message="TELEGRAM_BOT_TOKEN vacío.")
        return 2

    application = Application.builder().token(TOKEN).post_init(post_init).build()
    application.add_handler(CommandHandler("debug", debug_command))
    application.add_handler(CommandHandler("start", help_command))
    application.add_handler(CommandHandler("help", help_command))
    application.add_handler(CallbackQueryHandler(review_callback))
    application.add_error_handler(error_handler)

    emit("starting", runtime="python-telegram-bot")
    application.run_polling(allowed_updates=["message", "callback_query"])
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except KeyboardInterrupt:
        emit("stopped", reason="keyboard_interrupt")
        raise
