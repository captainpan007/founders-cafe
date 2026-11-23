import tempfile
import unittest
from pathlib import Path

from room import DAY, ROUND, WINDOW, Room, Rule
from server import Cafe


class RoomCases(unittest.TestCase):
    def setUp(self):
        self.ts = 10000
        self.r = Room(clock=lambda: self.ts)

    def add(self, k, idx=None, role="member"):
        self.r.person(k, role)
        self.r.join(k)
        if idx is not None:
            self.act(k, "seat", seat=idx)

    def act(self, k, action, **kw):
        return self.r.action(k, action, kw)

    def start(self):
        self.add("speaker", 0)
        self.act("speaker", "apply", title="Local founders", goal="One useful lesson")
        self.act("speaker", "confirm")
        return self.r.stage

    def audience(self, n):
        for i in range(n):
            self.add(f"a{i}", i)

    def test_capacity_race_and_fifo(self):
        self.audience(50)
        self.add("later")
        self.add("next")
        with self.assertRaises(Rule):
            self.act("later", "seat", seat=49)
        self.act("later", "wait")
        self.act("next", "wait")
        self.act("a0", "leave")
        with self.assertRaises(Rule):
            self.act("next", "claimSeat")
        self.ts += 30
        self.r.tick()
        self.act("next", "claimSeat")
        self.assertEqual(self.r.seats[0], "next")

    def test_grace(self):
        self.add("a", 0)
        self.r.disconnect("a")
        self.ts += 59
        self.r.join("a")
        self.assertEqual(self.r.seats[0], "a")
        self.r.disconnect("a")
        self.ts += 60
        self.r.tick()
        self.assertIsNone(self.r.seats[0])

    def vote(self, s, k):
        self.act(k, "vote", stage=s["id"], round=s["round"])

    def test_exactly_ten_and_late(self):
        s = self.start()
        self.audience(11)
        self.ts += ROUND - WINDOW
        self.r.tick()
        for i in range(10):
            self.vote(s, f"a{i}")
        self.ts += WINDOW
        with self.assertRaises(Rule):
            self.vote(s, "a10")
        self.assertIsNone(self.r.stage)

    def test_two_extensions_and_duplicate(self):
        s = self.start()
        self.audience(11)
        for round_num in (1, 2):
            self.ts += ROUND - WINDOW
            self.r.tick()
            for i in range(11):
                self.vote(s, f"a{i}")
                self.vote(s, f"a{i}")
            self.assertEqual(len(s["votes"]), 11)
            self.ts += WINDOW
            self.r.tick()
            self.assertEqual((s["round"], len(s["votes"])), (round_num + 1, 0))

    def test_eligible_snapshot(self):
        s = self.start()
        self.add("guest", 2, "guest")
        self.ts += ROUND - WINDOW
        self.r.tick()
        self.add("late", 3)
        for who in ("speaker", "guest", "late"):
            with self.assertRaises(Rule):
                self.vote(s, who)

    def test_queue_timeout_and_handoff(self):
        s = self.start()
        self.audience(2)
        for who in ("a0", "a1"):
            self.act(who, "apply", title="topic", goal="lesson")
        self.act("speaker", "end", stage=s["id"])
        self.assertEqual(self.r.call["who"], "a0")
        self.ts += 30
        self.r.tick()
        self.act("a1", "confirm")
        self.assertEqual(self.r.stage["who"], "a1")

    def test_fully_occupied_handoff(self):
        s = self.start()
        self.audience(50)
        self.act("a0", "apply", title="t", goal="g")
        self.act("speaker", "end", stage=s["id"])
        self.act("a0", "confirm")
        self.assertEqual(self.r.seats[0], "speaker")
        self.assertEqual(len(set(self.r.seats)), 50)

    def test_drop_speaker(self):
        s = self.start()
        self.r.disconnect("speaker")
        self.ts += 60
        self.r.tick()
        self.r.join("speaker")
        with self.assertRaises(Rule):
            self.act("speaker", "say", stage=s["id"], text="late")

    def test_public_discussion_permissions_and_retention(self):
        s = self.start()
        self.audience(2)
        self.act(
            "speaker",
            "openCard",
            stage=s["id"],
            title="Design",
            task="New page",
            skills="CSS",
            hours="2h",
            pay="paid",
        )
        self.add("visitor", role="guest")
        self.r.db["offers"]["old"] = dict(
            id="old",
            card=s["id"],
            owner="speaker",
            **{"from": "a0"},
            status="accepted",
            text="legacy private proposal",
            updated=self.ts,
            messages=[
                dict(
                    who="a0", text="legacy private conversation", lang="en", at=self.ts
                )
            ],
        )
        for action, target in (
            ("propose", s["id"]),
            ("message", "old"),
            ("replyPublic", "old"),
            ("nextStep", "old"),
        ):
            with self.subTest(action=action), self.assertRaises(Rule):
                self.act("a0", action, id=target, text="must stay unpublished")
        self.act("a0", "proposePublic", id=s["id"], text="I can help")
        key = self.r.view("visitor")["discussions"][0]["id"]
        self.act("visitor", "replyPublic", id=key, text="Can everyone join?")
        for who in ("a0", "speaker", "visitor", "a1"):
            view = self.r.view(who)
            self.assertEqual(view["offers"], [])
            self.assertEqual(len(view["discussions"]), 1)
            self.assertNotIn("legacy private", str(view))
            reply = view["discussions"][0]["messages"][0]
            self.assertEqual(reply["text"], "Can everyone join?")
            self.assertIn(reply["who"], view["people"])
        for op in ("accept", "decline", "withdraw"):
            with self.subTest(op=op), self.assertRaises(Rule):
                self.act("a1", op, id=key)
        self.act("speaker", "accept", id=key)
        self.act("a1", "replyPublic", id=key, text="Happy to review")
        with self.assertRaises(Rule):
            self.act("a1", "nextStep", id=key)
        self.r.person("visitor")["muted"] = True
        with self.assertRaises(Rule):
            self.act("visitor", "replyPublic", id=key, text="muted")
        for k in ("speaker", "a0"):
            self.act(k, "nextStep", id=key)
        self.assertEqual(len(self.r.view("visitor")["discussions"][0]["confirmed"]), 2)
        self.act("speaker", "end", stage=s["id"])
        self.ts += 8 * DAY
        self.r.prune()
        self.assertFalse(self.r.db["cards"])
        self.assertTrue(self.r.db["offers"])
        self.ts += 23 * DAY
        self.r.prune()
        self.assertFalse(self.r.db["offers"])

    def test_moderation(self):
        s = self.start()
        self.add("host", role="host")
        self.add("a")
        self.act("a", "report", who="speaker", text="Report")
        key = self.r.db["reports"][0]["id"]
        with self.assertRaises(Rule):
            self.act("a", "moderate", id=key, op="mute")
        self.act("host", "moderate", id=key, op="mute")
        with self.assertRaises(Rule):
            self.act("speaker", "say", stage=s["id"], text="Hi")
        self.assertFalse(self.r.view("a")["reports"])

    def test_schedule_owner_and_local_time(self):
        self.add("host", role="host")
        self.add("listener", 0)
        with self.assertRaises(Rule):
            self.act("listener", "schedule", title="New talk", at=self.ts + 45)
        self.act("host", "schedule", title="New talk", at=self.ts + 45)
        self.assertEqual(self.r.view("listener")["nextTalk"]["at"], self.ts + 45)
        self.ts += 46
        self.assertIsNone(self.r.view("listener")["nextTalk"])

    def test_budget_field_and_caption_correction(self):
        s = self.start()
        with self.assertRaises(Rule):
            self.act(
                "speaker",
                "openCard",
                stage=s["id"],
                title="Role",
                task="Review",
                skills="UX",
                hours="2",
                pay="paid",
                amount="50.000",
                currency="USD",
            )
        self.act(
            "speaker",
            "openCard",
            stage=s["id"],
            title="Role",
            task="Review",
            skills="UX",
            hours="2",
            pay="paid",
            amount="50.00",
            currency="USD",
        )
        self.assertEqual(self.r.view("speaker")["cards"][0]["amount"], "50.00")
        self.r.line("speaker", "Pason", "caption", "en")
        self.act(
            "speaker",
            "editLine",
            stage=s["id"],
            line=s["lines"][0]["id"],
            text="Python",
        )
        self.assertEqual(s["lines"][0]["text"], "Python")

    def test_chat_is_open_without_a_seat_and_separate_from_stage(self):
        self.add("visitor", role="guest")
        self.act("visitor", "speakLang", lang="zh")
        self.act("visitor", "chat", text="你好")
        self.assertEqual(self.r.view("visitor")["chat"][0]["lang"], "zh")
        stage = self.start()
        self.act("visitor", "chat", text="Hello again")
        self.assertFalse(stage["lines"])
        with self.assertRaises(Rule):
            self.act("visitor", "say", stage=stage["id"], text="Question")
        self.r.person("visitor")["muted"] = True
        with self.assertRaises(Rule):
            self.act("visitor", "chat", text="Muted")
        self.assertNotIn("chat", self.r.db)

    def test_chat_history_limit_and_block(self):
        self.add("a")
        self.add("b")
        for i in range(81):
            self.act("a", "chat", text=str(i))
        self.assertEqual(len(self.r.view("b")["chat"]), 80)
        self.assertEqual(self.r.view("b")["chat"][0]["text"], "1")
        self.r.db["blocks"].append(["b", "a"])
        self.r.chat[0].pop(
            "visibility"
        )  # Existing lines retain their original audience.
        self.assertEqual(len(self.r.view("b")["chat"]), 79)
        self.assertEqual(self.r.view("b")["chat"][-1]["text"], "80")

    def test_idle_update_keeps_seats_for_reconnecting_guests(self):
        self.add("guest", 4, "guest")
        saved = self.r.seats.copy()
        restarted = Room(self.r.db, clock=lambda: self.ts)
        restarted.resume_listeners(saved, self.ts)
        self.ts += 10
        restarted.join("guest")
        self.ts += 60
        restarted.tick()
        self.assertEqual(restarted.seats[4], "guest")
        fresh = Room(self.r.db, clock=lambda: self.ts)
        fresh.resume_listeners(saved, self.ts - 61)
        self.assertNotIn("guest", fresh.seats)

    def test_idle_update_preserves_old_lobby_visibility_without_replaying_bubbles(self):
        self.add("guest", 4, "guest")
        self.add("reader")
        self.r.db["blocks"].append(["reader", "guest"])
        self.act("guest", "chat", text="new public line")
        history = [dict(who="guest", text="older line", lang="en"), *self.r.chat]
        restarted = Room(self.r.db, clock=lambda: self.ts)
        restarted.resume_listeners(self.r.seats.copy(), self.ts, history)
        self.assertEqual(
            [m["text"] for m in restarted.view("reader")["chat"]], ["new public line"]
        )
        self.assertEqual(restarted.view("guest")["chat"][0]["at"], 0)
        self.assertEqual(restarted.view("guest")["chat"][-1], self.r.chat[-1])

    def test_single_writer_and_restart(self):
        with tempfile.TemporaryDirectory() as d:
            p = Path(d)
            a = Cafe(p)
            a.room.person("x", "member")["name"] = "Alex"
            a.save()
            with self.assertRaises(BlockingIOError):
                Cafe(p)
            a.lock.close()
            b = Cafe(p)
            self.assertEqual(b.room.person("x")["name"], "Alex")
            b.lock.close()
