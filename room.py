"""The single room authority. All calls run on the server's event loop without awaiting."""

from time import time
from uuid import uuid4

DAY = 86400
ROUND, WINDOW, GRACE, OFFER = 900, 120, 60, 30


class Rule(ValueError):
    pass


def check(ok, code):
    if not ok:
        raise Rule(code)


def field(data, key, limit, required=True):
    value = data.get(key, "")
    check(isinstance(value, str) and len(value.strip()) <= limit, "invalid")
    value = value.strip()
    check(value or not required, "required")
    return value


def uid():
    return uuid4().hex


class Room:
    def __init__(self, saved=None, clock=time):
        self.clock = clock
        self.db = saved or {
            "people": {},
            "cards": {},
            "offers": {},
            "blocks": [],
            "reports": [],
        }
        self.seats = [None] * 50
        self.wait, self.queue = [], []
        self.held, self.call, self.stage = None, None, None
        self.online, self.gone, self.effects = set(), {}, {}
        self.rev = 0

    def person(self, who, role="guest"):
        if who not in self.db["people"]:
            self.db["people"][who] = dict(
                name="Guest " + who[:4],
                tag="",
                bio="",
                lang="en",
                role=role,
                muted=False,
            )
        return self.db["people"][who]

    def join(self, who):
        self.tick()
        self.online.add(who)
        self.gone.pop(who, None)

    def disconnect(self, who):
        self.online.discard(who)
        self.gone[who] = self.clock()

    def seats_for(self, who):
        return self.seats.index(who) if who in self.seats else None

    def available(self):
        return [
            i
            for i, p in enumerate(self.seats)
            if p is None and not (self.held and self.held["seat"] == i)
        ]

    def schedule(self):
        if not self.held and self.wait and self.available():
            self.held = dict(
                who=self.wait.pop(0),
                seat=self.available()[0],
                until=self.clock() + OFFER,
            )
        if not self.stage and not self.call and self.queue:
            self.call = dict(**self.queue.pop(0), until=self.clock() + OFFER)

    def unschedule(self, who):
        self.wait = [p for p in self.wait if p != who]
        self.queue = [q for q in self.queue if q["who"] != who]
        if self.held and self.held["who"] == who:
            self.held = None
        if self.call and self.call["who"] == who:
            returning = self.call.get("returning")
            if returning and returning in self.online:
                self.wait.insert(0, returning)
            self.call = None

    def leave(self, who):
        self.unschedule(who)
        if self.call and self.call.get("returning") == who:
            self.call.pop("returning")
        seat = self.seats_for(who)
        if seat is not None:
            self.seats[seat] = None
        if self.stage and self.stage["who"] == who:
            self.finish(False)
        self.schedule()

    def finish(self, come_back):
        s, self.stage = self.stage, None
        if s["id"] in self.db["cards"]:
            self.db["cards"][s["id"]]["expires"] = self.clock() + 7 * DAY
        self.schedule()
        if come_back and s["who"] in self.online:
            free = self.available()
            if free:
                self.seats[free[0]] = s["who"]
            elif self.call:
                self.call["returning"] = s["who"]
            else:
                self.wait.append(s["who"])

    def tick(self):
        now, changed = self.clock(), False
        for who, t in list(self.gone.items()):
            if now - t >= GRACE:
                self.leave(who)
                self.gone.pop(who, None)
                changed = True
        if self.held and self.held["until"] <= now:
            self.held = None
            changed = True
        if self.call and self.call["until"] <= now:
            returning = self.call.get("returning")
            if returning and returning in self.online:
                self.wait.insert(0, returning)
            self.call = None
            changed = True
        s = self.stage
        if s and now >= s["end"]:
            if len(s["votes"]) >= 11:
                s.update(
                    round=s["round"] + 1,
                    end=s["end"] + ROUND,
                    votes=set(),
                    eligible=None,
                )
                if s["end"] <= now:
                    self.finish(True)
            else:
                self.finish(True)
            changed = True
        s = self.stage
        if s and s["eligible"] is None and now >= s["end"] - WINDOW:
            s["eligible"] = {
                p
                for p in self.seats
                if p in self.online and self.person(p)["role"] != "guest"
            }
            changed = True
        for key, val in list(self.effects.items()):
            if val["until"] <= now:
                del self.effects[key]
                changed = True
        self.schedule()
        return changed

    def blocked(self, a, b):
        return [a, b] in self.db["blocks"] or [b, a] in self.db["blocks"]

    def action(self, who, kind, d):
        self.tick()
        p = self.person(who)
        ishost = p["role"] == "host"
        if kind not in (
            "profile",
            "speakLang",
            "seat",
            "leave",
            "wait",
            "claimSeat",
            "gesture",
            "report",
        ):
            check(p["role"] != "guest", "pass")
        if kind in ("apply", "confirm", "say", "propose", "message", "openCard"):
            check(not p["muted"], "muted")
        s = self.stage
        if kind in ("end", "say", "vote", "mic", "openCard", "editLine", "answer"):
            check(s and s["id"] == d.get("stage"), "stale")
        if kind in ("end", "mic", "openCard", "editLine", "answer"):
            check(s["who"] == who, "speaker")
        if kind == "profile":
            name = field(d, "name", 24)
            tag = field(d, "tag", 32, False)
            bio = field(d, "bio", 160, False)
            check(d.get("lang") in ("en", "zh"), "invalid")
            p.update(name=name, tag=tag, bio=bio, lang=d["lang"])
        elif kind == "schedule":
            check(ishost, "private")
            if d.get("clear") is True:
                self.db.pop("nextTalk", None)
            else:
                at = d.get("at")
                check(
                    type(at) in (int, float)
                    and self.clock() < at < self.clock() + 366 * DAY,
                    "invalid",
                )
                self.db["nextTalk"] = {
                    "title": field(d, "title", 90),
                    "at": at,
                    "lang": p["lang"],
                }
        elif kind == "speakLang":
            check(d.get("lang") in ("en", "zh"), "invalid")
            p["lang"] = d["lang"]
        elif kind == "seat":
            idx = d.get("seat")
            check(
                type(idx) is int and 0 <= idx < 50 and not (s and s["who"] == who),
                "invalid",
            )
            if self.seats[idx] == who:
                return
            check(
                idx in self.available()
                and not (who in self.wait or self.held and self.held["who"] == who),
                "taken",
            )
            old = self.seats_for(who)
            if old is not None:
                self.seats[old] = None
            self.seats[idx] = who
        elif kind == "leave":
            self.leave(who)
        elif kind == "wait":
            check(who not in self.seats and not (s and s["who"] == who), "invalid")
            if who not in self.wait and not (self.held and self.held["who"] == who):
                self.wait.append(who)
        elif kind == "claimSeat":
            check(self.held and self.held["who"] == who, "stale")
            self.seats[self.held["seat"]] = who
            self.held = None
        elif kind == "apply":
            check(who in self.seats, "seat")
            check(
                not any(q["who"] == who for q in self.queue)
                and not (self.call and self.call["who"] == who),
                "queued",
            )
            self.queue.append(
                dict(
                    who=who,
                    title=field(d, "title", 90),
                    goal=field(d, "goal", 180),
                    terms=field(d, "terms", 100, False),
                    lang=p["lang"],
                )
            )
        elif kind == "cancel":
            if self.call and self.call["who"] == who and self.call.get("returning"):
                self.wait.insert(0, self.call.pop("returning"))
            self.unschedule(who)
        elif kind == "confirm":
            check(self.call and self.call["who"] == who and who in self.seats, "stale")
            q, self.call = self.call, None
            idx = self.seats.index(who)
            returning = q.get("returning")
            self.seats[idx] = (
                returning
                if returning in self.online and returning not in self.seats
                else None
            )
            self.stage = dict(
                id=uid(),
                who=who,
                title=q["title"],
                goal=q["goal"],
                terms=q["terms"],
                lang=q["lang"],
                round=1,
                end=self.clock() + ROUND,
                votes=set(),
                eligible=None,
                lines=[],
                mic=False,
            )
        elif kind == "end":
            self.finish(True)
        elif kind == "vote":
            check(
                d.get("round") == s["round"]
                and s["eligible"] is not None
                and who in s["eligible"]
                and who in self.seats,
                "vote",
            )
            s["votes"].add(who)
        elif kind == "mic":
            s["mic"] = d.get("on") is True
        elif kind == "say":
            check(who == s["who"] or who in self.seats, "seat")
            self.line(
                who,
                field(d, "text", 600),
                "talk" if who == s["who"] else "question",
                p["lang"],
            )
        elif kind == "editLine":
            item = next(
                (x for x in s["lines"] if x["id"] == d.get("line") and x["who"] == who),
                None,
            )
            check(item, "stale")
            item["text"] = field(d, "text", 600)
        elif kind == "answer":
            item = next(
                (
                    x
                    for x in s["lines"]
                    if x["id"] == d.get("line") and x["kind"] == "question"
                ),
                None,
            )
            check(item, "stale")
            item["answered"] = True
        elif kind == "gesture":
            check(who in self.seats or s and s["who"] == who, "seat")
            check(d.get("emoji") in ("👋", "👏"), "invalid")
            self.effects[who] = dict(emoji=d["emoji"], until=self.clock() + 3)
        elif kind == "openCard":
            check(s["id"] not in self.db["cards"], "exists")
            pay = field(d, "pay", 12)
            check(pay in ("paid", "mutual", "discuss"), "invalid")
            amount = field(d, "amount", 16, False)
            currency = field(d, "currency", 4, False)
            import re

            check(
                not amount
                or (
                    re.fullmatch(r"[0-9]{1,9}(?:[.][0-9]{1,2})?", amount)
                    and currency in ("USD", "CNY", "EUR", "GBP", "JPY")
                ),
                "invalid",
            )
            self.db["cards"][s["id"]] = dict(
                id=s["id"],
                amount=amount,
                currency=currency if amount else "",
                owner=who,
                title=field(d, "title", 90),
                task=field(d, "task", 240),
                skills=field(d, "skills", 100),
                hours=field(d, "hours", 50),
                pay=pay,
                lang=p["lang"],
                open=True,
                expires=None,
            )
        elif kind == "closeCard":
            c = self.db["cards"].get(d.get("id"))
            check(c and (c["owner"] == who or ishost), "private")
            c["open"] = False
        elif kind == "propose":
            c = self.db["cards"].get(d.get("id"))
            check(
                c
                and c["open"]
                and c["owner"] != who
                and not self.blocked(who, c["owner"])
                and (not c["expires"] or c["expires"] > self.clock()),
                "closed",
            )
            check(
                not any(
                    o["card"] == c["id"]
                    and o["from"] == who
                    and o["status"] in ("pending", "accepted")
                    for o in self.db["offers"].values()
                ),
                "exists",
            )
            key = uid()
            self.db["offers"][key] = dict(
                id=key,
                card=c["id"],
                name=c["title"],
                owner=c["owner"],
                **{"from": who},
                text=field(d, "text", 240),
                lang=p["lang"],
                status="pending",
                updated=self.clock(),
                messages=[],
            )
        elif kind in ("accept", "decline", "withdraw", "message", "block", "nextStep"):
            o = self.db["offers"].get(d.get("id"))
            check(o and who in (o["owner"], o["from"]), "private")
            other = o["from"] if o["owner"] == who else o["owner"]
            if kind == "block":
                if not self.blocked(who, other):
                    self.db["blocks"].append([who, other])
            else:
                check(not self.blocked(who, other), "blocked")
                if kind == "nextStep":
                    check(o["status"] == "accepted", "private")
                    o.setdefault("confirmed", {})[who] = self.clock()
                elif kind == "message":
                    check(o["status"] == "accepted", "private")
                    o["messages"].append(
                        dict(
                            who=who,
                            text=field(d, "text", 600),
                            lang=p["lang"],
                            at=self.clock(),
                        )
                    )
                else:
                    check(o["status"] == "pending", "closed")
                    check(
                        who == (o["from"] if kind == "withdraw" else o["owner"]),
                        "private",
                    )
                    o["status"] = {
                        "accept": "accepted",
                        "decline": "declined",
                        "withdraw": "withdrawn",
                    }[kind]
            o["updated"] = self.clock()
        elif kind == "report":
            target = d.get("who")
            check(target in self.db["people"] and target != who, "invalid")
            self.db["reports"].append(
                dict(
                    id=uid(),
                    who=target,
                    by=who,
                    reason=field(d, "text", 240),
                    at=self.clock(),
                    closed=False,
                )
            )
        elif kind == "moderate":
            check(ishost, "private")
            r = next(
                (
                    r
                    for r in self.db["reports"]
                    if r["id"] == d.get("id") and not r["closed"]
                ),
                None,
            )
            op = d.get("op")
            check(r and op in ("dismiss", "mute", "end", "closeCard"), "invalid")
            if op == "mute":
                self.person(r["who"])["muted"] = True
                if s and s["who"] == r["who"]:
                    s["mic"] = False
            if op == "end":
                check(s and s["who"] == r["who"], "stale")
                self.finish(True)
            if op == "closeCard":
                c = self.db["cards"].get(d.get("card"))
                check(c and c["owner"] == r["who"], "stale")
                c["open"] = False
            r.update(closed=True, decision=op)
        else:
            raise Rule("invalid")
        self.schedule()
        self.rev += 1

    def line(self, who, text, kind, lang):
        self.stage["lines"].append(
            dict(id=uid(), who=who, text=text, lang=lang, kind=kind, at=self.clock())
        )
        self.stage["lines"] = self.stage["lines"][-500:]

    def prune(self):
        now = self.clock()
        before = (
            len(self.db["offers"]),
            len(self.db["cards"]),
            len(self.db["reports"]),
        )
        self.db["offers"] = {
            k: o
            for k, o in self.db["offers"].items()
            if o["updated"] + (30 if o["status"] == "accepted" else 7) * DAY > now
        }
        self.db["cards"] = {
            k: c
            for k, c in self.db["cards"].items()
            if not c["expires"] or c["expires"] > now
        }
        self.db["reports"] = [r for r in self.db["reports"] if r["at"] + 30 * DAY > now]
        return before != (
            len(self.db["offers"]),
            len(self.db["cards"]),
            len(self.db["reports"]),
        )

    def view(self, who):
        s = self.stage
        p = self.person(who)
        cards = list(self.db["cards"].values())
        offers = [
            dict(o, blocked=self.blocked(o["owner"], o["from"]))
            for o in self.db["offers"].values()
            if who in (o["from"], o["owner"])
        ]
        people = {who, *[x for x in self.seats if x]}
        if s:
            people.update([s["who"], *[x["who"] for x in s["lines"]]])
        people.update(c["owner"] for c in cards)
        for o in offers:
            people.update((o["from"], o["owner"]))
        reports = self.db["reports"] if p["role"] == "host" else []
        people.update(r["who"] for r in reports)
        public = {
            k: {f: self.db["people"][k][f] for f in ("name", "tag", "bio", "lang")}
            for k in people
        }
        stage = None
        if s:
            stage = {k: v for k, v in s.items() if k not in ("eligible", "votes")}
            stage.update(
                votes=len(s["votes"]),
                canVote=s["eligible"] is not None
                and who in s["eligible"]
                and who in self.seats,
                voted=who in s["votes"],
                reconnecting=s["who"] not in self.online,
            )
        return dict(
            rev=self.rev,
            now=self.clock(),
            nextTalk=self.db.get("nextTalk")
            if self.db.get("nextTalk", {}).get("at", 0) > self.clock()
            else None,
            me=who,
            role=p["role"],
            seats=self.seats,
            people=public,
            stage=stage,
            reserved=self.held["seat"] if self.held else None,
            seatOffer=self.held if self.held and self.held["who"] == who else None,
            wait=self.wait.index(who) + 1 if who in self.wait else None,
            waiting=len(self.wait) + int(bool(self.held)),
            called=bool(self.call and self.call["who"] == who),
            position=next(
                (i + 1 for i, q in enumerate(self.queue) if q["who"] == who), None
            ),
            queued=len(self.queue) + int(bool(self.call)),
            cards=cards,
            offers=offers,
            reports=reports,
            effects=self.effects,
        )
