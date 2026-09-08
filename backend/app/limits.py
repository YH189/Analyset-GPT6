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


class DemoGuardMiddleware:
    """Bound expensive public-demo requests globally without trusting proxy headers."""

    def __init__(self, app, requests_per_minute: int = 0):
        from collections import deque

        self.app = app
        self.limit = requests_per_minute
        self.requests = deque()
        self.active = False

    async def __call__(self, scope, receive, send):
        import time

        from starlette.responses import JSONResponse

        if not self.limit or scope["type"] != "http" or scope["method"] != "POST":
            return await self.app(scope, receive, send)
        now = time.monotonic()
        while self.requests and self.requests[0] <= now - 60:
            self.requests.popleft()
        if self.active or len(self.requests) >= self.limit:
            response = JSONResponse(
                {
                    "error": {
                        "code": "DEMO_BUSY",
                        "message": "The public demo is busy. Please try again shortly.",
                    }
                },
                status_code=429,
                headers={"Retry-After": "60" if len(self.requests) >= self.limit else "3"},
            )
            return await response(scope, receive, send)
        self.requests.append(now)
        self.active = True
        try:
            await self.app(scope, receive, send)
        finally:
            self.active = False
