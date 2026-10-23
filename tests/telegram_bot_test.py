import importlib.util
import json
import os
from pathlib import Path
import sys
import threading
import types
import unittest
import urllib.error
import asyncio
import contextlib
import io
import runpy
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from unittest.mock import patch
from unittest.mock import AsyncMock

# No third-party Telegram import, polling, account or outbound transport in tests.
telegram = types.ModuleType("telegram")
telegram.InputFile = lambda *args, **kwargs: types.SimpleNamespace(args=args, kwargs=kwargs)
telegram.Update = object
ext = types.ModuleType("telegram.ext")
ext.Application = ext.CallbackQueryHandler = ext.CommandHandler = object
ext.ContextTypes = types.SimpleNamespace(DEFAULT_TYPE=object)
with patch.dict(sys.modules, {"telegram": telegram, "telegram.ext": ext}), patch.dict(os.environ, {
        "TELEGRAM_BOT_TOKEN": "fake-bot", "SPIDER_LOCAL_TOKEN": "fake-local"}):
    spec = importlib.util.spec_from_file_location("synthetic_telegram_bot", Path(__file__).resolve().parents[1] / "src/telegram_bot.py")
    bot = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(bot)


class Handler(BaseHTTPRequestHandler):
    received = []

    def log_message(self, *args):
        pass

    def do_GET(self):
        self.received.append((self.path, self.headers.get("X-Spider-Token"), None))
        if self.path == "/api/redirect":
            self.send_response(302)
            self.send_header("Location", "/api/should-never-run")
            self.end_headers()
            return
        self.send_response(200 if self.headers.get("X-Spider-Token") == "fake-local" else 401)
        self.end_headers()
        if self.path != "/api/empty":
            self.wfile.write(b'{"text":"synthetic debug"}')

    def do_POST(self):
        body = json.loads(self.rfile.read(int(self.headers["Content-Length"])))
        self.received.append((self.path, self.headers.get("X-Spider-Token"), body))
        self.send_response(200)
        self.end_headers()
        self.wfile.write(b'{"status":"resolved"}')


class LocalClientTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.server = ThreadingHTTPServer(("127.0.0.1", 0), Handler)
        cls.thread = threading.Thread(target=cls.server.serve_forever, daemon=True)
        cls.thread.start()
        bot.SERVER_URL = f"http://127.0.0.1:{cls.server.server_port}"

    @classmethod
    def tearDownClass(cls):
        cls.server.shutdown()
        cls.server.server_close()
        cls.thread.join()

    def test_debug_and_review_use_local_token(self):
        self.assertEqual(bot.request_json("/api/telegram/debug")["text"], "synthetic debug")
        self.assertEqual(bot.request_json("/api/empty"), {})
        self.assertEqual(bot.request_json("/api/reviews/1/decision", "POST", {"action": "approve"})["status"], "resolved")
        self.assertEqual(Handler.received[-1], ("/api/reviews/1/decision", "fake-local", {"action": "approve"}))
        with patch.object(bot, "LOCAL_TOKEN", "wrong"):
            with self.assertRaises(urllib.error.HTTPError) as error:
                bot.request_json("/api/telegram/debug")
            self.assertEqual(error.exception.code, 401)

    def test_redirect_does_not_forward_token(self):
        with self.assertRaises(urllib.error.HTTPError) as error:
            bot.request_json("/api/redirect")
        self.assertEqual(error.exception.code, 302)
        self.assertFalse(any(path == "/api/should-never-run" for path, _, _ in Handler.received))

    def test_rejects_nonlocal_base_and_missing_token(self):
        for base in ["https://127.0.0.1", "http://evil.test", "http://user@localhost", "http://:pass@localhost", "http://localhost/path", "http://localhost?q=x", "http://localhost#x"]:
            with self.subTest(base=base), patch.object(bot, "SERVER_URL", base):
                with self.assertRaises(ValueError):
                    bot.request_json("/api/debug")
        with patch.object(bot, "LOCAL_TOKEN", ""):
            with self.assertRaises(ValueError):
                bot.request_json("/api/debug")
        for path in ["https://evil.test", "/api/evil\\path"]:
            with self.assertRaises(ValueError):
                bot.request_json(path)


class CallbackTest(unittest.IsolatedAsyncioTestCase):
    def setUp(self):
        self.output = io.StringIO()
        self.capture = contextlib.redirect_stdout(self.output)
        self.capture.__enter__()
        self.user = types.SimpleNamespace(id=1, username="synthetic", first_name="Fake", last_name="User")
        self.message = types.SimpleNamespace(reply_text=AsyncMock(), reply_document=AsyncMock(), edit_text=AsyncMock())
        self.query = types.SimpleNamespace(from_user=self.user, data="review:1:approve", answer=AsyncMock(), message=self.message)
        self.update = types.SimpleNamespace(effective_user=self.user, effective_message=self.message, callback_query=self.query,
                                            to_dict=lambda: {"text": "synthetic"})

    def tearDown(self):
        self.capture.__exit__(None, None, None)
        self.assertNotIn("fake-local", self.output.getvalue())
        self.assertNotIn("fake-bot", self.output.getvalue())

    async def test_commands_authorization_debug_success_failure_and_help(self):
        self.assertEqual(bot.user_payload(None)["id"], "telegram")
        self.assertEqual(bot.user_payload(self.user)["username"], "synthetic")
        with patch.object(bot, "ALLOWED_USER_ID", "1"):
            self.assertTrue(bot.is_authorized(self.user))
            self.assertFalse(bot.is_authorized(None))
        with patch.object(bot, "ALLOWED_USER_ID", "2"):
            for action in [bot.debug_command, bot.log_command, bot.help_command]:
                await action(self.update, None)
        for payload in [{"text": "synthetic debug"}, {}]:
            with patch.object(bot, "fetch_local_json", AsyncMock(return_value=payload)):
                await bot.debug_command(self.update, None)
        with patch.object(bot, "fetch_local_json", AsyncMock(side_effect=ValueError("synthetic failure"))):
            await bot.debug_command(self.update, None)
        await bot.help_command(self.update, None)
        await bot.log_command(self.update, None)
        self.update.to_dict = lambda: {"text": "x" * 4000}
        await bot.log_command(self.update, None)
        self.message.reply_document.assert_awaited_once()

    async def test_callback_invalid_unauthorized_and_http_failures(self):
        self.update.callback_query = None
        await bot.review_callback(self.update, None)
        self.update.callback_query = self.query
        with patch.object(bot, "ALLOWED_USER_ID", "2"):
            await bot.review_callback(self.update, None)
        self.query.data = "unknown"
        await bot.review_callback(self.update, None)
        self.query.data = "review:1:approve"
        for code in [409, 404, 500]:
            error = urllib.error.HTTPError("http://127.0.0.1/synthetic", code, "fake", {}, None)
            with patch.object(bot, "fetch_local_json", AsyncMock(side_effect=error)):
                await bot.review_callback(self.update, None)
        with patch.object(bot, "fetch_local_json", AsyncMock(side_effect=ValueError("synthetic failure"))):
            await bot.review_callback(self.update, None)

    async def test_resolved_callbacks_and_edit_failure(self):
        for action in ["approve", "reject"]:
            self.query.data = f"review:1:{action}"
            for review in [{}, {"title": "synthetic", "volumeName": "Fake", "issueLabel": "1", "releaseDate": "1960-01-01", "matchSummary": ["Fake"], "fandomUrl": "https://example.test"}, {"issueLabel": ""}]:
                with patch.object(bot, "fetch_local_json", AsyncMock(return_value={"review": review})):
                    await bot.review_callback(self.update, None)
        self.user.username = ""
        self.user.first_name = ""
        with patch.object(bot, "fetch_local_json", AsyncMock(return_value={"review": {"title": "synthetic"}})):
            await bot.review_callback(self.update, None)
            self.message.edit_text.side_effect = ValueError("synthetic edit failure")
            await bot.review_callback(self.update, None)
            self.query.message = None
            await bot.review_callback(self.update, None)
        await bot.error_handler(None, types.SimpleNamespace(error=ValueError("fake-bot fake-local")))
        app = types.SimpleNamespace(bot=types.SimpleNamespace(get_me=AsyncMock(return_value=self.user)))
        await bot.post_init(app)

    async def test_async_local_fetch_adapter(self):
        with patch.object(bot, "request_json", return_value={"ok": True}) as local:
            self.assertEqual(await bot.fetch_local_json("/api/telegram/debug"), {"ok": True})
            local.assert_called_once_with("/api/telegram/debug", "GET", None)


class MainTest(unittest.TestCase):
    def test_entrypoint_never_polls_real_telegram(self):
        class FakeApplication:
            failure = False

            @classmethod
            def builder(cls): return cls()
            def token(self, value): return self
            def post_init(self, value): return self
            def build(self): return self
            def add_handler(self, value): pass
            def add_error_handler(self, value): pass
            def run_polling(self, **kwargs):
                if self.failure: raise KeyboardInterrupt()

        fake_ext = types.ModuleType("telegram.ext")
        fake_ext.Application = FakeApplication
        fake_ext.CallbackQueryHandler = fake_ext.CommandHandler = lambda *args: args
        fake_ext.ContextTypes = ext.ContextTypes
        with patch.dict(sys.modules, {"telegram": telegram, "telegram.ext": fake_ext}), contextlib.redirect_stdout(io.StringIO()):
            for token, expected in [("", 2), ("synthetic", 0)]:
                with patch.dict(os.environ, {"TELEGRAM_BOT_TOKEN": token, "SPIDER_LOCAL_TOKEN": "synthetic-local"}):
                    with self.assertRaises(SystemExit) as error:
                        runpy.run_path(str(Path(bot.__file__)), run_name="__main__")
                    self.assertEqual(error.exception.code, expected)
            FakeApplication.failure = True
            with patch.dict(os.environ, {"TELEGRAM_BOT_TOKEN": "synthetic"}):
                with self.assertRaises(KeyboardInterrupt):
                    runpy.run_path(str(Path(bot.__file__)), run_name="__main__")


if __name__ == "__main__":
    unittest.main()
