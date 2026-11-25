import { DurableObject } from "cloudflare:workers";

const MOODS = new Set(["grinding", "ghost", "pray", "coffee", "shipped"]);
const CHEERS = new Set(["👏", "🔥", "☕", "🚀", "💀"]);
const SEAT_COUNT = 50;
const MAX_SOCKETS = 500;
const MAX_SOCKETS_PER_IP = 6;
const MAX_SEATS_PER_IP = 2;

function cleanText(value, maxLen, fallback = "") {
  if (typeof value !== "string") return fallback;
  const cleaned = value.replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim();
  if (!cleaned) return fallback;
  return cleaned.slice(0, maxLen);
}

async function hashIp(ip) {
  const bytes = new TextEncoder().encode("cafe-v1:" + (ip || "local"));
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest).slice(0, 8)]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname === "/api/health") {
      return Response.json({
        ok: true,
        service: "founders-cafe",
        mode: "cloudflare-do",
      });
    }

    if (url.pathname === "/api/stats") {
      const stub = env.CAFE.get(env.CAFE.idFromName("main-cafe"));
      return stub.fetch(new Request("https://cafe.internal/stats"));
    }

    if (url.pathname === "/ws") {
      if (request.headers.get("Upgrade") !== "websocket") {
        return new Response("Expected WebSocket upgrade", { status: 426 });
      }
      const origin = request.headers.get("Origin");
      if (origin) {
        try {
          if (new URL(origin).host !== url.host) {
            return new Response("Forbidden origin", { status: 403 });
          }
        } catch {
          return new Response("Forbidden origin", { status: 403 });
        }
      }
      const ip =
        request.headers.get("CF-Connecting-IP") ||
        request.headers.get("X-Forwarded-For")?.split(",")[0]?.trim() ||
        "local";
      const ipHash = await hashIp(ip);
      const stub = env.CAFE.get(env.CAFE.idFromName("main-cafe"));
      const headers = new Headers(request.headers);
      headers.set("X-Cafe-Ip", ipHash);
      return stub.fetch(new Request(request.url, { headers }));
    }

    return env.ASSETS.fetch(request);
  },
};

export class CafeRoom extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    this.sql = ctx.storage.sql;
    this.sql.exec(`
      CREATE TABLE IF NOT EXISTS stats (
        key TEXT PRIMARY KEY,
        val INTEGER NOT NULL DEFAULT 0
      );
      CREATE TABLE IF NOT EXISTS moments (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        kind TEXT NOT NULL,
        who_id TEXT NOT NULL,
        name TEXT NOT NULL,
        text TEXT NOT NULL,
        at INTEGER NOT NULL
      );
    `);
    for (const key of ["prayers", "coffees", "celebrations", "visitors"]) {
      this.sql.exec(
        "INSERT OR IGNORE INTO stats (key, val) VALUES (?, 0)",
        key,
      );
    }
    this.ctx.setWebSocketAutoResponse(
      new WebSocketRequestResponsePair("ping", "pong"),
    );
  }

  getStats() {
    const out = { prayers: 0, coffees: 0, celebrations: 0, visitors: 0 };
    for (const row of this.sql.exec("SELECT key, val FROM stats")) {
      if (row.key in out) out[row.key] = Number(row.val);
    }
    return out;
  }

  incStat(key, delta = 1) {
    this.sql.exec(
      "UPDATE stats SET val = val + ? WHERE key = ?",
      delta,
      key,
    );
    const row = this.sql
      .exec("SELECT val FROM stats WHERE key = ?", key)
      .one();
    return Number(row.val);
  }

  getMoments() {
    return [
      ...this.sql.exec(
        "SELECT id, kind, who_id AS whoId, name, text, at FROM moments ORDER BY id DESC LIMIT 24",
      ),
    ];
  }

  addMoment(kind, whoId, name, text, at) {
    this.sql.exec(
      "INSERT INTO moments (kind, who_id, name, text, at) VALUES (?, ?, ?, ?, ?)",
      kind,
      whoId,
      name,
      text,
      at,
    );
    this.sql.exec(
      "DELETE FROM moments WHERE id NOT IN (SELECT id FROM moments ORDER BY id DESC LIMIT 30)",
    );
    return this.sql
      .exec(
        "SELECT id, kind, who_id AS whoId, name, text, at FROM moments ORDER BY id DESC LIMIT 1",
      )
      .one();
  }

  listGuests() {
    const guests = [];
    for (const ws of this.ctx.getWebSockets()) {
      const att = ws.deserializeAttachment();
      if (!att) continue;
      guests.push(this.publicGuest(att));
    }
    return guests;
  }

  publicGuest(att) {
    return {
      id: att.id,
      name: att.name,
      mood: att.mood,
      note: att.note,
      seat: att.seat,
      cups: att.cups || 0,
      sosUntil: att.sosUntil || 0,
      celebrateUntil: att.celebrateUntil || 0,
    };
  }

  occupiedSeats(excludeWs = null) {
    const taken = new Set();
    for (const ws of this.ctx.getWebSockets()) {
      if (ws === excludeWs) continue;
      const att = ws.deserializeAttachment();
      if (att && Number.isInteger(att.seat)) taken.add(att.seat);
    }
    return taken;
  }

  pickSeat(ipHash) {
    let ipSeats = 0;
    const taken = new Set();
    for (const ws of this.ctx.getWebSockets()) {
      const att = ws.deserializeAttachment();
      if (!att) continue;
      if (Number.isInteger(att.seat)) {
        taken.add(att.seat);
        if (att.ipHash === ipHash) ipSeats++;
      }
    }
    if (ipSeats >= MAX_SEATS_PER_IP) return null;
    // Prefer center tables first so small crowds feel cozy instead of scattered.
    const free = [];
    for (let i = 0; i < SEAT_COUNT; i++) {
      if (!taken.has(i)) free.push(i);
    }
    if (!free.length) return null;
    // Slight preference for middle 3 tables (tables 1, 2, 3, 6, 7, 8)
    const cozy = free.filter((s) => {
      const col = Math.floor(s / 5) % 5;
      return col >= 1 && col <= 3;
    });
    const pool = cozy.length ? cozy : free;
    return pool[Math.floor(Math.random() * pool.length)];
  }

  broadcast(payload, except = null) {
    const text = JSON.stringify(payload);
    for (const ws of this.ctx.getWebSockets()) {
      if (ws === except) continue;
      try {
        ws.send(text);
      } catch {
        // Closed socket will be cleaned up on close/error.
      }
    }
  }

  async fetch(request) {
    const url = new URL(request.url);
    if (url.pathname === "/stats") {
      return Response.json({
        online: this.ctx.getWebSockets().length,
        stats: this.getStats(),
      });
    }

    const active = this.ctx.getWebSockets();
    if (active.length >= MAX_SOCKETS) {
      return new Response("Café is packed right now", { status: 503 });
    }

    const ipHash = request.headers.get("X-Cafe-Ip") || "local";
    let ipCount = 0;
    for (const ws of active) {
      const att = ws.deserializeAttachment();
      if (att?.ipHash === ipHash) ipCount++;
    }
    if (ipCount >= MAX_SOCKETS_PER_IP) {
      return new Response("Too many tabs open", { status: 429 });
    }

    const rawId = cleanText(url.searchParams.get("id") || "", 24);
    const id = /^[a-f0-9-]{8,24}$/i.test(rawId)
      ? rawId.toLowerCase()
      : crypto.randomUUID().replace(/-/g, "").slice(0, 12);

    // Ensure unique active connection id per tab
    const idTaken = active.some((w) => w.deserializeAttachment()?.id === id);
    const connId = idTaken
      ? crypto.randomUUID().replace(/-/g, "").slice(0, 12)
      : id;

    const name = cleanText(
      url.searchParams.get("name") || "",
      20,
      "Builder " + connId.slice(0, 4),
    );
    const reqMood = url.searchParams.get("mood");
    const mood = MOODS.has(reqMood) ? reqMood : "grinding";
    const note = cleanText(url.searchParams.get("note") || "", 60, "");
    const seat = this.pickSeat(ipHash);

    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);
    this.ctx.acceptWebSocket(server);

    const att = {
      id: connId,
      name,
      mood,
      note,
      seat,
      ipHash,
      cups: 0,
      joinedAt: Date.now(),
      lastBell: 0,
      lastSos: 0,
      lastChat: 0,
      sosUntil: 0,
      celebrateUntil: 0,
      rateWindow: 0,
      rateCount: 0,
    };
    server.serializeAttachment(att);

    const visitors = this.incStat("visitors", 1);
    const stats = this.getStats();
    stats.visitors = visitors;

    const guests = this.listGuests();
    server.send(
      JSON.stringify({
        type: "snapshot",
        me: connId,
        guests,
        online: guests.length,
        stats,
        moments: this.getMoments(),
        now: Date.now(),
      }),
    );

    this.broadcast(
      {
        type: "join",
        guest: this.publicGuest(att),
        online: guests.length,
        visitors,
      },
      server,
    );

    return new Response(null, { status: 101, webSocket: client });
  }

  allowBurst(att, now, maxPerSec) {
    if (now - (att.rateWindow || 0) >= 1000) {
      att.rateWindow = now;
      att.rateCount = 1;
      return true;
    }
    att.rateCount = (att.rateCount || 0) + 1;
    return att.rateCount <= maxPerSec;
  }

  async webSocketMessage(ws, raw) {
    if (typeof raw !== "string" || raw.length > 2048) return;
    let msg;
    try {
      msg = JSON.parse(raw);
    } catch {
      return;
    }
    if (!msg || typeof msg !== "object") return;

    const att = ws.deserializeAttachment();
    if (!att) return;
    const now = Date.now();

    if (msg.type === "mood") {
      if (!MOODS.has(msg.mood)) return;
      att.mood = msg.mood;
      ws.serializeAttachment(att);
      this.broadcast({ type: "mood", id: att.id, mood: att.mood });
      return;
    }

    if (msg.type === "profile") {
      att.name = cleanText(msg.name, 20, att.name);
      att.note = cleanText(msg.note, 60, "");
      ws.serializeAttachment(att);
      this.broadcast({
        type: "profile",
        id: att.id,
        name: att.name,
        note: att.note,
      });
      return;
    }

    if (msg.type === "seat") {
      if (msg.seat === null) {
        att.seat = null;
        ws.serializeAttachment(att);
        this.broadcast({ type: "seat", id: att.id, seat: null });
        return;
      }
      if (
        !Number.isInteger(msg.seat) ||
        msg.seat < 0 ||
        msg.seat >= SEAT_COUNT
      ) {
        return;
      }
      if (att.seat === msg.seat) return;
      const taken = this.occupiedSeats(ws);
      if (taken.has(msg.seat)) {
        ws.send(JSON.stringify({ type: "error", code: "taken" }));
        return;
      }
      // Enforce per-IP seat limit when moving from standing to seated
      if (att.seat === null) {
        let ipSeats = 0;
        for (const other of this.ctx.getWebSockets()) {
          if (other === ws) continue;
          const o = other.deserializeAttachment();
          if (o?.ipHash === att.ipHash && Number.isInteger(o.seat)) ipSeats++;
        }
        if (ipSeats >= MAX_SEATS_PER_IP) {
          ws.send(JSON.stringify({ type: "error", code: "ipLimit" }));
          return;
        }
      }
      att.seat = msg.seat;
      ws.serializeAttachment(att);
      this.broadcast({ type: "seat", id: att.id, seat: att.seat });
      return;
    }

    if (msg.type === "pray") {
      if (!this.allowBurst(att, now, 12)) return;
      if (att.mood !== "pray") {
        att.mood = "pray";
      }
      ws.serializeAttachment(att);
      const prayers = this.incStat("prayers", 1);
      this.broadcast({
        type: "pray",
        id: att.id,
        name: att.name,
        mood: att.mood,
        prayers,
      });
      return;
    }

    if (msg.type === "toss") {
      if (!this.allowBurst(att, now, 5)) return;
      const sockets = this.ctx.getWebSockets();
      let targetWs = null;
      if (typeof msg.to === "string" && msg.to) {
        targetWs = sockets.find(
          (w) => w.deserializeAttachment()?.id === msg.to,
        );
      }
      if (!targetWs) {
        // Fallback: pick another seated builder, or self if alone in the café
        const others = sockets.filter(
          (w) => w !== ws && Number.isInteger(w.deserializeAttachment()?.seat),
        );
        targetWs = others.length
          ? others[Math.floor(Math.random() * others.length)]
          : ws;
      }
      const targetAtt = targetWs.deserializeAttachment();
      if (!targetAtt) return;
      targetAtt.cups = Math.min(20, (targetAtt.cups || 0) + 1);
      targetWs.serializeAttachment(targetAtt);
      ws.serializeAttachment(att);
      const coffees = this.incStat("coffees", 1);
      this.broadcast({
        type: "toss",
        from: att.id,
        fromName: att.name,
        to: targetAtt.id,
        toName: targetAtt.name,
        cups: targetAtt.cups,
        coffees,
      });
      return;
    }

    if (msg.type === "celebrate") {
      if (now - (att.lastBell || 0) < 12000) {
        ws.send(JSON.stringify({ type: "error", code: "cooldown" }));
        return;
      }
      const text = cleanText(msg.text, 70, "Just shipped / made $1!");
      att.lastBell = now;
      att.mood = "shipped";
      att.celebrateUntil = now + 6500;
      ws.serializeAttachment(att);
      const celebrations = this.incStat("celebrations", 1);
      const moment = this.addMoment("celebrate", att.id, att.name, text, now);
      this.broadcast({
        type: "celebrate",
        id: att.id,
        name: att.name,
        text,
        until: att.celebrateUntil,
        celebrations,
        moment,
      });
      return;
    }

    if (msg.type === "sos") {
      if (now - (att.lastSos || 0) < 12000) {
        ws.send(JSON.stringify({ type: "error", code: "cooldown" }));
        return;
      }
      const text = cleanText(msg.text, 70, "Prod is down! Send coffee!");
      att.lastSos = now;
      att.mood = "ghost";
      att.sosUntil = now + 20000;
      ws.serializeAttachment(att);
      const moment = this.addMoment("sos", att.id, att.name, text, now);
      this.broadcast({
        type: "sos",
        id: att.id,
        name: att.name,
        text,
        until: att.sosUntil,
        moment,
      });
      return;
    }

    if (msg.type === "chat") {
      if (now - (att.lastChat || 0) < 1200) {
        ws.send(JSON.stringify({ type: "error", code: "slow" }));
        return;
      }
      const text = cleanText(msg.text, 120);
      if (!text) return;
      att.lastChat = now;
      ws.serializeAttachment(att);
      this.broadcast({
        type: "bubble",
        id: att.id,
        name: att.name,
        text,
        at: now,
      });
      return;
    }

    if (msg.type === "cheer") {
      if (!this.allowBurst(att, now, 6)) return;
      if (!CHEERS.has(msg.emoji)) return;
      ws.serializeAttachment(att);
      this.broadcast({
        type: "cheer",
        id: att.id,
        emoji: msg.emoji,
      });
    }
  }

  async webSocketClose(ws) {
    const att = ws.deserializeAttachment();
    if (!att) return;
    const remaining = this.ctx
      .getWebSockets()
      .filter((other) => other !== ws).length;
    this.broadcast({ type: "leave", id: att.id, online: remaining }, ws);
  }

  async webSocketError(ws) {
    await this.webSocketClose(ws);
  }
}
