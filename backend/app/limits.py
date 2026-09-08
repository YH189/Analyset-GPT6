"""Enforce request byte limits while multipart bytes are still arriving."""

from starlette.exceptions import HTTPException

from .parsing import MAX_BYTES


class BodyLimitMiddleware:
    def __init__(self, app):
        self.app = app

    async def __call__(self, scope, receive, send):
        if scope["type"] != "http":
            return await self.app(scope, receive, send)
        consumed = 0

        async def limited_receive():
            nonlocal consumed
            message = await receive()
            if message["type"] == "http.request":
                consumed += len(message.get("body", b""))
                if consumed > MAX_BYTES + 1024 * 1024:
                    raise HTTPException(413, "Request exceeds the upload limit.")
            return message

        await self.app(scope, limited_receive, send)
