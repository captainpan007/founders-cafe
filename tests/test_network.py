"""51 isolated cookie jars and sockets exercise the running HTTP/room entry points."""

import asyncio
import tempfile
import unittest
from pathlib import Path

from aiohttp import ClientSession, CookieJar
from aiohttp.test_utils import TestServer

from room import ROUND, WINDOW
from server import Cafe


class NetworkTrial(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        self.folder = tempfile.TemporaryDirectory()
        self.now = 10000
        self.app = Cafe(Path(self.folder.name), clock=lambda: self.now)
        self.endpoint = TestServer(self.app.app())
        await self.endpoint.start_server()
        self.base = str(self.endpoint.make_url("/")).rstrip("/")
        self.users = []

    async def asyncTearDown(self):
        await asyncio.gather(*(c.close() for c, ws, who in self.users))
        await self.endpoint.close()
        self.folder.cleanup()

    async def new(self):
        client = ClientSession(
            cookie_jar=CookieJar(unsafe=True), headers={"Origin": self.base}
        )
        async with client.post(
            self.base + "/api/enter",
            json={},
        ) as response:
            self.assertEqual(response.status, 200)
        ws = await client.ws_connect(self.base + "/room")
        snapshot = (await ws.receive_json())["data"]
        self.assertEqual(snapshot["role"], "guest")
        user = (client, ws, snapshot["me"])
        self.users.append(user)
        return user

    async def act(self, user, kind, **kw):
        async with user[0].post(
            self.base + "/api/action", json={"action": kind, **kw}
        ) as r:
            return r.status, await r.json()

    async def test_live_room_at_capacity(self):
        users = [await self.new() for i in range(51)]

        # Read all notifications continuously, as the frontend does.
        async def drain(ws):
            async for _ in ws:
                pass

        drains = [asyncio.create_task(drain(u[1])) for u in users]
        try:
            for i in range(49):
                self.assertEqual((await self.act(users[i], "seat", seat=i))[0], 200)
            results = await asyncio.gather(
                self.act(users[49], "seat", seat=49),
                self.act(users[50], "seat", seat=49),
            )
            self.assertEqual(sorted(r[0] for r in results), [200, 409])
            outside = users[50 if results[0][0] == 200 else 49]
            self.assertEqual((await self.act(outside, "wait"))[0], 200)
            self.assertEqual(
                (
                    await self.act(
                        users[0], "apply", title="Hello", goal="Introduce the project"
                    )
                )[0],
                200,
            )
            self.assertEqual((await self.act(outside, "claimSeat"))[0], 200)
            self.assertEqual(len(set(self.app.room.seats)), 50)
            stage = self.app.room.stage["id"]
            for idx, total in enumerate([11, 11, 10], 1):
                self.now += ROUND - WINDOW
                self.app.room.tick()
                votes = await asyncio.gather(
                    *(
                        self.act(u, "vote", stage=stage, round=idx)
                        for u in users[1 : total + 1]
                    )
                )
                self.assertTrue(all(r[0] == 200 for r in votes))
                self.now += WINDOW
                self.app.room.tick()
                self.assertEqual(
                    self.app.room.stage["round"] if self.app.room.stage else None,
                    idx + 1 if total == 11 else None,
                )
        finally:
            for t in drains:
                t.cancel()
            await asyncio.gather(*drains, return_exceptions=True)
