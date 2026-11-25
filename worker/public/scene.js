// 16-bit Pixel-Art Café Renderer (960x540) — Cohesive Outlined Sprites, Warm Lighting & Animations.

export const W = 960;
export const H = 540;

const OUT = "#261811"; // Matches the dark espresso pixel outline of cafe-bg.jpg

// 10 spacious tables (5 cols x 2 rows) cleanly positioned on the wooden floor (y: 318..490)
export const TABLES = Array.from({ length: 10 }, (_, t) => [
  136 + 172 * (t % 5),
  368 + 88 * Math.floor(t / 5),
]);

const CHAIR_OFFSETS = [
  [-26, -21], // 0: back-left
  [26, -21],  // 1: back-right
  [44, 2],    // 2: right
  [0, 22],    // 3: front
  [-44, 2],   // 4: left
];

export const SEATS = Array.from({ length: 50 }, (_, i) => {
  const [tx, ty] = TABLES[Math.floor(i / 5)];
  const [dx, dy] = CHAIR_OFFSETS[i % 5];
  return [tx + dx, ty + dy];
});

export function getStandingSpot(index, total) {
  const gap = Math.min(64, 680 / Math.max(1, total));
  const x = 480 + (index % 2 ? 1 : -1) * Math.ceil(index / 2) * gap;
  return [Math.max(88, Math.min(W - 88, x)), 514];
}

// Cozy Stardew/Eastward palettes for builders
const OUTFITS = [
  { main: "#467a73", dark: "#2e544f", light: "#6ba39b" }, // sage teal hoodie
  { main: "#b85a40", dark: "#843c29", light: "#d97d63" }, // terracotta sweater
  { main: "#5e6f99", dark: "#3f4d70", light: "#8597c2" }, // slate denim
  { main: "#6f8752", dark: "#4c6135", light: "#95ad76" }, // olive cardigan
  { main: "#c28b42", dark: "#8c6026", light: "#e0ad67" }, // mustard crew
  { main: "#8a5a7a", dark: "#5e3b52", light: "#b07c9e" }, // plum knit
  { main: "#d4c3a3", dark: "#9e8e70", light: "#ede0c7" }, // cream fleece
  { main: "#495867", dark: "#2e3945", light: "#6c7e91" }, // charcoal jacket
];

const SKINS = [
  { main: "#f2c6a0", shade: "#d49f77" },
  { main: "#e0aa7e", shade: "#bd8459" },
  { main: "#c48b63", shade: "#9c6844" },
  { main: "#8f5f42", shade: "#6b432b" },
];

const HAIRS = [
  { main: "#382820", light: "#574035" },
  { main: "#6b4229", light: "#8f5d3e" },
  { main: "#2c2f3b", light: "#4b5063" },
  { main: "#9c5633", light: "#bf744d" },
  { main: "#c99a53", light: "#e3b874" },
  { main: "#5c3333", light: "#824c4c" },
];

export class CafeScene {
  constructor(canvas) {
    this.canvas = canvas;
    this.g = canvas.getContext("2d");

    // Load high-craft 16-bit generated background
    this.bgImg = new Image();
    this.bgReady = false;
    this.bgImg.onload = () => {
      this.bgReady = true;
    };
    this.bgImg.src = "/cafe-bg.jpg";

    this.fireworks = [];
    this.flyingCups = [];
    this.floaters = [];
    this.sparks = [];
    this.rings = []; // expanding golden rings on bell / wooden fish tap
    this.tapTimes = new Map();
    this.arrivals = new Map();
    this.knownIds = new Set();
    this.hoverSeat = -1;
    this.hoverGuestId = null;
    this.celebration = null;
    this.shakeUntil = 0;
  }

  getGuestCoords(guest, standingList) {
    if (Number.isInteger(guest.seat) && guest.seat >= 0 && guest.seat < 50) {
      return SEATS[guest.seat];
    }
    const idx = standingList.findIndex((g) => g.id === guest.id);
    return getStandingSpot(Math.max(0, idx), standingList.length);
  }

  triggerTap(id, x, y, zh) {
    const now = performance.now();
    this.tapTimes.set(id, now);
    this.rings.push({ x: x + 15, y: y - 3, born: now, life: 420, maxR: 18, color: "#ffe17d" });
    this.floaters.push({
      x: x + (Math.random() - 0.5) * 18,
      y: y - 36,
      vy: -0.65,
      text: zh ? "功德 +1" : "+1 NO BUGS",
      color: "#ffe47a",
      stroke: "#3b2313",
      born: now,
      life: 1050,
    });
    for (let i = 0; i < 6; i++) {
      const a = -Math.PI * 0.15 - Math.random() * Math.PI * 0.7;
      const spd = 0.9 + Math.random() * 1.1;
      this.sparks.push({
        x: x + 14,
        y: y - 6,
        vx: Math.cos(a) * spd,
        vy: Math.sin(a) * spd,
        color: i % 2 ? "#ffd466" : "#fff7d6",
        born: now,
        life: 480,
      });
    }
  }

  triggerCheer(x, y, emoji) {
    const now = performance.now();
    this.floaters.push({
      x: x + (Math.random() - 0.5) * 24,
      y: y - 40,
      vy: -0.75,
      text: emoji,
      big: true,
      born: now,
      life: 1250,
    });
  }

  triggerToss(fromX, fromY, toX, toY) {
    const now = performance.now();
    this.flyingCups.push({
      sx: fromX,
      sy: fromY - 18,
      tx: toX,
      ty: toY - 10,
      born: now,
      dur: 560,
      splashed: false,
    });
  }

  triggerCelebration(name, text, durationMs = 6400) {
    const now = performance.now();
    this.celebration = {
      name,
      text,
      born: now,
      until: now + durationMs,
      nextBurst: now,
    };
    // Golden soundwave rings radiating from the brass bell on stage (566, 266)
    this.rings.push({ x: 566, y: 268, born: now, life: 700, maxR: 54, color: "#ffe57f" });
    this.rings.push({ x: 566, y: 268, born: now + 180, life: 700, maxR: 68, color: "#fff7cc" });
    this.spawnFirework(220, 96);
    this.spawnFirework(480, 74);
    this.spawnFirework(740, 96);
  }

  triggerSosShake() {
    this.shakeUntil = performance.now() + 420;
  }

  spawnFirework(x, y) {
    const now = performance.now();
    const palette = [
      "#ffd95a",
      "#ff7b54",
      "#8be0b8",
      "#fff4d2",
      "#ff9ec4",
      "#7cc6fe",
    ];
    const baseColor = palette[Math.floor(Math.random() * palette.length)];
    const count = 24;
    for (let i = 0; i < count; i++) {
      const angle = (Math.PI * 2 * i) / count + (Math.random() - 0.5) * 0.2;
      const spd = 1.2 + Math.random() * 2.1;
      this.fireworks.push({
        x,
        y,
        vx: Math.cos(angle) * spd,
        vy: Math.sin(angle) * spd,
        color: i % 3 === 0 ? "#fffbe6" : baseColor,
        born: now,
        life: 900 + Math.random() * 500,
      });
    }
  }

  hitTest(cx, cy, guests, standingList) {
    for (const guest of guests) {
      const [gx, gy] = this.getGuestCoords(guest, standingList);
      if (Math.abs(cx - gx) <= 20 && cy >= gy - 38 && cy <= gy + 14) {
        return { kind: "guest", guest };
      }
    }
    for (let i = 0; i < SEATS.length; i++) {
      const [sx, sy] = SEATS[i];
      if (Math.abs(cx - sx) <= 17 && Math.abs(cy - (sy - 4)) <= 16) {
        return { kind: "seat", seat: i };
      }
    }
    return null;
  }

  render(state) {
    const {
      guests = [],
      me = null,
      stats = { prayers: 0, coffees: 0, celebrations: 0 },
      zh = false,
      rainOn = false,
      bubbles = new Map(),
      now = Date.now(),
    } = state;

    const perfNow = performance.now();
    const motion = !window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    // Track arrivals for bounce-in animation
    const currentIds = new Set();
    for (const guest of guests) {
      currentIds.add(guest.id);
      if (!this.knownIds.has(guest.id)) {
        this.arrivals.set(guest.id, perfNow);
      }
    }
    this.knownIds = currentIds;

    const g = this.g;
    g.save();
    g.imageSmoothingEnabled = false;

    // Micro screen-shake on SOS
    if (motion && perfNow < this.shakeUntil) {
      const mag = 3.5 * ((this.shakeUntil - perfNow) / 420);
      g.translate((Math.random() - 0.5) * mag * 2, (Math.random() - 0.5) * mag * 2);
    }

    // 1. Background image (or warm placeholder while loading)
    if (this.bgReady) {
      g.drawImage(this.bgImg, 0, 0, W, H);
    } else {
      g.fillStyle = "#c98b55";
      g.fillRect(0, 0, W, H);
    }

    // Pixel-snapped helpers
    const px = (x, y, w, h, c) => {
      g.fillStyle = c;
      g.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h));
    };
    const oval = (x, y, rx, ry, c) => {
      g.fillStyle = c;
      g.beginPath();
      g.ellipse(Math.round(x), Math.round(y), rx, ry, 0, 0, Math.PI * 2);
      g.fill();
    };

    // Outlined pixel coffee mug helper (2x crisp)
    const drawMug = (x, y, body = "#fff5df") => {
      px(x - 1, y - 1, 10, 9, OUT);
      px(x + 8, y + 1, 3, 5, OUT);
      px(x + 8, y + 2, 2, 3, body);
      px(x, y, 8, 7, body);
      px(x + 1, y + 1, 6, 2, "#6e4226"); // coffee surface
      px(x, y + 5, 8, 2, "#d9c8a9"); // cup shading
    };

    // 2. Animated rain outside left & right twilight windows when rain ambience is active
    if (rainOn && motion) {
      g.fillStyle = "rgba(218, 238, 250, 0.55)";
      const phase = (perfNow * 0.14) % 118;
      for (const [wx, wy, ww, wh] of [
        [72, 82, 150, 118],
        [732, 84, 130, 116],
      ]) {
        for (let r = 0; r < 18; r++) {
          const rx = wx + ((r * 29 + Math.floor(phase * 0.35)) % (ww - 4));
          const ry = wy + ((r * 23 + phase * 1.6) % (wh - 10));
          g.fillRect(Math.round(rx), Math.round(ry), 2, 8);
        }
      }
    }

    // 3. Subtle rising steam from the espresso machine on the left counter (150, 188)
    if (motion) {
      const sPhase = (perfNow * 0.02) % 24;
      for (let k = 0; k < 3; k++) {
        const p = (sPhase + k * 8) % 24;
        const alpha = Math.sin((p / 24) * Math.PI) * 0.5;
        g.fillStyle = `rgba(255, 248, 232, ${alpha.toFixed(2)})`;
        const sx = 148 + k * 14 + Math.sin(perfNow * 0.004 + k) * 3;
        const sy = 192 - p;
        g.fillRect(Math.round(sx), Math.round(sy), 3, 3);
      }
    }

    // 4. Dynamic Chalkboard Content (exact green interior: x 384..576, y 78..184)
    const celebrating = this.celebration && perfNow < this.celebration.until;
    if (celebrating && motion && perfNow >= this.celebration.nextBurst) {
      this.spawnFirework(110 + Math.random() * 740, 36 + Math.random() * 115);
      this.celebration.nextBurst = perfNow + 340 + Math.random() * 240;
    }

    const activeSos = guests.find((u) => (u.sosUntil || 0) > now);
    g.save();
    g.textAlign = "center";
    if (celebrating) {
      g.fillStyle = "#ffe57f";
      g.font = "bold 14px monospace";
      g.fillText(
        zh ? "🎉 全店欢呼 · 有人上线！" : "🎉 BELL RUNG · SHIPPED!",
        480,
        106,
        182,
      );
      g.fillStyle = "#fffaf0";
      g.font = "bold 13px sans-serif";
      g.fillText(
        `${this.celebration.name}: ${this.celebration.text}`,
        480,
        136,
        182,
      );
      g.fillStyle = "#9ef0be";
      g.font = "bold 11px monospace";
      g.fillText(
        zh ? "✨ 全店烟花庆祝中 ✨" : "✨ FIREWORKS LIVE ✨",
        480,
        164,
        182,
      );
    } else if (activeSos) {
      const blink = Math.floor(perfNow / 260) % 2 === 0;
      g.fillStyle = blink ? "#ff8a75" : "#ffd6a5";
      g.font = "bold 14px monospace";
      g.fillText(
        zh ? "🚨 紧急求援 · 线上崩了" : "🚨 PROD DOWN · SEND ☕",
        480,
        108,
        182,
      );
      g.fillStyle = "#fff6e5";
      g.font = "bold 13px sans-serif";
      g.fillText(
        zh ? `${activeSos.name} 需要咖啡救场！` : `${activeSos.name} needs coffee!`,
        480,
        138,
        182,
      );
      g.fillStyle = "#ffe29a";
      g.font = "bold 11px monospace";
      g.fillText(
        zh ? "点击 TA 头像扔咖啡 ☕" : "CLICK AVATAR TO TOSS ☕",
        480,
        164,
        182,
      );
    } else {
      g.fillStyle = "#ece7c9";
      g.font = "bold 17px monospace";
      g.fillText(zh ? "创业咖啡馆" : "FOUNDERS’ CAFÉ", 480, 108, 182);
      g.fillStyle = "#d3e6cb";
      g.font = "bold 12px monospace";
      g.fillText(
        `🐟 ${stats.prayers}  ☕ ${stats.coffees}  🎉 ${stats.celebrations}`,
        480,
        138,
        182,
      );
      g.fillStyle = "#b7d1b0";
      g.font = "bold 11px monospace";
      g.fillText(
        zh
          ? `● ${guests.length} 位创业者在线`
          : `● ${guests.length} BUILDER${guests.length === 1 ? "" : "S"} LIVE`,
        480,
        165,
        182,
      );
    }
    g.restore();

    // 5. Index guests by seat & standing
    const bySeat = new Map();
    const standing = [];
    for (const guest of guests) {
      if (Number.isInteger(guest.seat) && guest.seat >= 0 && guest.seat < 50) {
        bySeat.set(guest.seat, guest);
      } else {
        standing.push(guest);
      }
    }

    // High-craft 16-bit Q-version Pixel Avatar (matches cafe-bg.jpg outline & shading!)
    const drawAvatar = (x, y, guest) => {
      const id = guest.id;
      const arrivedAt = this.arrivals.get(id);
      let dy = 0;
      if (motion && arrivedAt && perfNow - arrivedAt < 360) {
        dy -= Math.sin(((perfNow - arrivedAt) / 360) * Math.PI) * 11;
      }
      if (motion && celebrating) {
        const seed = parseInt(id.slice(0, 2), 16) || 0;
        dy -= Math.abs(Math.sin(perfNow * 0.011 + seed)) * 9;
      }

      const v = parseInt(id.slice(0, 4), 16) || 0;
      const outfit = OUTFITS[v % OUTFITS.length];
      const skin = SKINS[(v >> 2) % SKINS.length];
      const hair = HAIRS[(v >> 4) % HAIRS.length];
      const hairStyle = (v >> 6) % 4; // 0: bob, 1: spiky, 2: beanie, 3: headphones
      const hasGlasses = (v >> 8) % 3 === 0;
      const mood = guest.mood || "grinding";
      const isSos = (guest.sosUntil || 0) > now;

      // Subtle breathing bob
      const breath = motion && mood !== "ghost" && !celebrating
        ? Math.round(Math.sin(perfNow * 0.004 + (v % 7)) * 0.8)
        : 0;
      const ay = Math.round(y + dy + breath);
      const slump = mood === "ghost" && !celebrating ? 4 : 0;

      // Ground hover / self highlight ring
      if (this.hoverGuestId === id) {
        oval(x, y + 6, 17, 7, "rgba(255, 224, 118, 0.55)");
      } else if (id === me) {
        oval(x, y + 6, 16, 6, "rgba(126, 214, 146, 0.45)");
      }

      // Soft contact shadow
      oval(x, y + 6, 13, 5, "rgba(38, 22, 12, 0.34)");

      // Torso (outlined 16-bit hoodie/sweater)
      const ty = ay - 15 + Math.round(slump * 0.4);
      px(x - 12, ty + 1, 24, 15, OUT);
      px(x - 10, ty - 1, 20, 17, OUT);
      px(x - 10, ty + 2, 20, 12, outfit.main);
      px(x - 8, ty + 1, 16, 4, outfit.light); // shoulder highlight
      px(x - 10, ty + 10, 20, 4, outfit.dark); // bottom fold shadow
      // Hoodie collar / V-neck detail
      px(x - 3, ty + 1, 6, 3, "#f7efe0");

      // Head (chibi 16-bit proportioned head with crisp dark outline!)
      const hy = ay - 30 + slump;
      px(x - 10, hy + 2, 20, 14, OUT);
      px(x - 8, hy, 16, 18, OUT);
      // Face fill + warm cheek shadow
      px(x - 8, hy + 2, 16, 14, skin.main);
      px(x - 8, hy + 13, 16, 3, skin.shade);
      // Cute rosy cheeks
      px(x - 6, hy + 11, 3, 2, "rgba(224, 108, 92, 0.42)");
      px(x + 3, hy + 11, 3, 2, "rgba(224, 108, 92, 0.42)");

      // Eyes
      const blink = motion && Math.floor(perfNow / 180 + v * 3) % 27 === 0;
      if (mood === "ghost" && !celebrating) {
        // Tired X_X eyes
        px(x - 5, hy + 8, 3, 2, OUT);
        px(x + 2, hy + 8, 3, 2, OUT);
      } else if (blink) {
        px(x - 5, hy + 9, 3, 1, OUT);
        px(x + 2, hy + 9, 3, 1, OUT);
      } else {
        px(x - 5, hy + 7, 3, 4, OUT);
        px(x + 2, hy + 7, 3, 4, OUT);
        // Tiny white eye catchlight
        px(x - 5, hy + 7, 1, 1, "#ffffff");
        px(x + 2, hy + 7, 1, 1, "#ffffff");
      }

      // Optional stylish glasses
      if (hasGlasses) {
        px(x - 7, hy + 6, 6, 1, "#3b2c22");
        px(x + 1, hy + 6, 6, 1, "#3b2c22");
        px(x - 1, hy + 8, 2, 1, "#3b2c22");
      }

      // Hair / Headgear (4 distinct outlined styles!)
      if (hairStyle === 2) {
        // Cozy knitted beanie
        px(x - 10, hy - 4, 20, 8, OUT);
        px(x - 8, hy - 6, 16, 4, OUT);
        px(x - 8, hy - 4, 16, 6, outfit.main);
        px(x - 6, hy - 5, 12, 2, outfit.light);
        px(x - 9, hy + 1, 18, 3, outfit.dark); // beanie cuff
        px(x - 2, hy - 8, 4, 3, outfit.light); // pom-pom
      } else {
        // Hair crown + side locks
        px(x - 10, hy - 3, 20, 8, OUT);
        px(x - 8, hy - 5, 16, 4, OUT);
        px(x - 8, hy - 3, 16, 6, hair.main);
        px(x - 6, hy - 3, 10, 2, hair.light); // hair shine
        // Sideburns / bob locks
        px(x - 10, hy + 3, 3, hairStyle === 0 ? 11 : 6, OUT);
        px(x - 9, hy + 3, 2, hairStyle === 0 ? 9 : 5, hair.main);
        px(x + 7, hy + 3, 3, hairStyle === 0 ? 11 : 6, OUT);
        px(x + 7, hy + 3, 2, hairStyle === 0 ? 9 : 5, hair.main);
        if (hairStyle === 1) {
          // Spiky cowlick
          px(x - 3, hy - 7, 3, 3, OUT);
          px(x - 2, hy - 6, 2, 3, hair.main);
          px(x + 2, hy - 6, 3, 2, hair.light);
        }
        if (hairStyle === 3) {
          // Over-ear developer headphones!
          px(x - 12, hy + 4, 3, 7, OUT);
          px(x - 11, hy + 5, 2, 5, "#d9a441");
          px(x + 9, hy + 4, 3, 7, OUT);
          px(x + 9, hy + 5, 2, 5, "#d9a441");
        }
      }

      // MOOD-SPECIFIC PIXEL PERFORMANCES!
      const fastTick = motion ? Math.floor(perfNow / 95) % 2 : 0;
      const slowWave = motion ? Math.sin(perfNow * 0.0055 + (v % 7)) : 0;

      if (celebrating || mood === "shipped") {
        // Raised cheering arms
        const armLift = fastTick ? -2 : 0;
        px(x - 15, ty - 7 + armLift, 6, 10, OUT);
        px(x - 14, ty - 4 + armLift, 4, 6, outfit.main);
        px(x - 14, ty - 7 + armLift, 4, 3, skin.main);

        px(x + 9, ty - 7 + armLift, 6, 10, OUT);
        px(x + 10, ty - 4 + armLift, 4, 6, outfit.main);
        px(x + 10, ty - 7 + armLift, 4, 3, skin.main);

        // Orbiting pixel sparkles
        if (motion) {
          const a = perfNow * 0.005 + v;
          const sx1 = x + Math.cos(a) * 16;
          const sy1 = hy - 2 + Math.sin(a) * 5;
          px(sx1 - 1, sy1 - 1, 3, 3, "#ffe46b");
          px(sx1, sy1 - 3, 1, 7, "#fff9d6");
          px(sx1 - 3, sy1, 7, 1, "#fff9d6");
        }
      } else if (mood === "grinding") {
        // Glowing pixel laptop + frantic typing hands + dancing multi-layer flames!
        px(x - 9, ty + 6, 18, 10, OUT);
        px(x - 8, ty + 7, 16, 8, "#5d6875");
        px(x - 6, ty + 8, 12, 5, fastTick ? "#a8e6ff" : "#8ad4f5"); // glowing screen
        // Typing hands
        px(x - 7, ty + 5 - fastTick * 2, 4, 4, OUT);
        px(x - 6, ty + 6 - fastTick * 2, 2, 2, skin.main);
        px(x + 3, ty + 3 + fastTick * 2, 4, 4, OUT);
        px(x + 4, ty + 4 + fastTick * 2, 2, 2, skin.main);
        // Pixel flames on both sides of keyboard!
        const fh1 = fastTick ? 11 : 7;
        const fh2 = fastTick ? 7 : 11;
        // Left flame
        px(x - 16, ty + 11 - fh1, 7, fh1 + 2, OUT);
        px(x - 15, ty + 12 - fh1, 5, fh1, "#e84a27");
        px(x - 14, ty + 14 - fh1, 3, Math.max(2, fh1 - 3), "#ff9f1c");
        px(x - 13, ty + 15 - fh1, 1, Math.max(1, fh1 - 5), "#fff275");
        // Right flame
        px(x + 9, ty + 11 - fh2, 7, fh2 + 2, OUT);
        px(x + 10, ty + 12 - fh2, 5, fh2, "#e84a27");
        px(x + 11, ty + 14 - fh2, 3, Math.max(2, fh2 - 3), "#ff9f1c");
        px(x + 12, ty + 15 - fh2, 1, Math.max(1, fh2 - 5), "#fff275");
      } else if (mood === "ghost") {
        // Outlined floating translucent pixel ghost rising out of head!
        const gy = hy - 22 + slowWave * 5;
        g.save();
        g.globalAlpha = 0.88;
        px(x - 8, gy - 6, 16, 14, "#5c6d82");
        px(x - 6, gy - 8, 12, 16, "#5c6d82");
        px(x - 6, gy - 6, 12, 13, "#f2f8ff");
        px(x - 7, gy - 4, 14, 10, "#f2f8ff");
        // Wavy bottom tail
        const tw = fastTick ? 1 : 0;
        px(x - 7, gy + 6, 4, 3 + tw, "#e1eefc");
        px(x - 2, gy + 6, 4, 4 - tw, "#e1eefc");
        px(x + 3, gy + 6, 4, 3 + tw, "#e1eefc");
        // Cute ghost eyes & tiny 'o' mouth
        px(x - 4, gy - 2, 2, 3, "#3b4c63");
        px(x + 2, gy - 2, 2, 3, "#3b4c63");
        px(x - 1, gy + 2, 2, 2, "#7c91ab");
        g.restore();
      } else if (mood === "pray") {
        // Outlined carved pixel wooden fish (木鱼) on red cushion + striking mallet!
        const lastTap = this.tapTimes.get(id) || 0;
        const justTapped = perfNow - lastTap < 150;
        const autoTap = motion && Math.floor(perfNow / 460 + v) % 4 === 0;
        const hit = justTapped || autoTap;
        // Little red cushion
        px(x + 7, ty + 11, 14, 5, OUT);
        px(x + 8, ty + 12, 12, 3, "#b5362c");
        // Carved wooden fish body
        px(x + 8, ty + 5, 12, 8, OUT);
        px(x + 9, ty + 6, 10, 6, "#c77d42");
        px(x + 10, ty + 6, 7, 2, "#e8a86b"); // wood shine
        px(x + 13, ty + 9, 6, 2, "#4a2511"); // mouth slit
        // Animated wooden mallet
        const my = hit ? ty + 2 : ty - 5;
        px(x + 3, my, 10, 3, OUT);
        px(x + 4, my + 1, 8, 1, "#8c5730");
        px(x + 11, my - 2, 5, 5, OUT);
        px(x + 12, my - 1, 3, 3, "#f7d58b");
      } else if (mood === "coffee") {
        drawMug(x + 9, ty + 4, "#fff7e3");
        if (motion) {
          const st = (perfNow * 0.018 + v) % 14;
          const a = Math.sin((st / 14) * Math.PI) * 0.75;
          g.fillStyle = `rgba(255, 252, 240, ${a.toFixed(2)})`;
          g.fillRect(Math.round(x + 11), Math.round(ty + 1 - st), 2, 3);
          g.fillRect(Math.round(x + 15), Math.round(ty - ((st + 7) % 14)), 2, 3);
        }
      }

      // SOS flashing red/amber pixel beacon
      if (isSos) {
        const flash = Math.floor(perfNow / 180) % 2 === 0;
        px(x - 6, hy - 18, 12, 11, OUT);
        px(x - 5, hy - 17, 10, 9, flash ? "#e63946" : "#ff9f1c");
        px(x - 1, hy - 15, 2, 4, "#ffffff");
        px(x - 1, hy - 10, 2, 2, "#ffffff");
      }

      // Stacked tossed coffee cups beside builder
      const extraCups = Math.min(6, guest.cups || 0);
      for (let c = 0; c < extraCups; c++) {
        const cx = x - 21 + (c % 2) * 7;
        const cy = ty + 8 - Math.floor(c / 2) * 6;
        drawMug(cx, cy, "#fff6de");
      }
    };

    // High-craft outlined wooden chair with cozy seat cushion
    const drawChair = (x, y, seatIdx) => {
      const hovered = this.hoverSeat === seatIdx && !bySeat.has(seatIdx);
      if (hovered) {
        oval(x, y + 4, 18, 9, "rgba(255, 214, 92, 0.65)");
      }
      // Chair shadow
      oval(x, y + 7, 13, 5, "rgba(38, 22, 12, 0.28)");
      // Legs
      px(x - 11, y + 1, 5, 11, OUT);
      px(x - 10, y + 2, 3, 9, "#7d4f2d");
      px(x + 6, y + 1, 5, 11, OUT);
      px(x + 7, y + 2, 3, 9, "#7d4f2d");
      // Backrest + wood highlight
      px(x - 13, y - 14, 26, 13, OUT);
      px(x - 11, y - 12, 22, 9, hovered ? "#f0c27b" : "#b87a46");
      px(x - 11, y - 12, 22, 3, hovered ? "#ffe0a3" : "#d99f66");
      // Seat cushion
      px(x - 13, y - 3, 26, 9, OUT);
      px(x - 11, y - 2, 22, 6, "#8c5733");
      px(x - 9, y - 1, 18, 4, seatIdx % 2 ? "#657d5e" : "#a8563f"); // sage / terracotta cushion

      const guest = bySeat.get(seatIdx);
      if (guest) drawAvatar(x, y + 1, guest);
    };

    // High-craft outlined round café table with props
    const drawTable = (tx, ty, t) => {
      // Soft floor shadow
      oval(tx + 3, ty + 16, 42, 16, "rgba(42, 24, 12, 0.3)");
      // Central wooden pedestal base
      px(tx - 10, ty + 5, 20, 17, OUT);
      px(tx - 8, ty + 6, 16, 14, "#7a4a2a");
      px(tx - 5, ty + 6, 4, 13, "#9c623b");
      // Round tabletop with crisp dark pixel outline & wood rim
      oval(tx, ty + 2, 37, 17, OUT);
      oval(tx, ty + 2, 35, 15, "#7d4a29"); // thick wood edge
      oval(tx, ty - 2, 35, 14, "#c4864b"); // main wood top
      oval(tx, ty - 4, 31, 11, "#dba165"); // warm tabletop highlight
      // Subtle wood grain line
      px(tx - 16, ty - 4, 14, 1, "#b87a42");
      px(tx + 4, ty - 1, 12, 1, "#b87a42");

      // Cozy table centerpiece props
      if (t % 3 === 0) {
        // Mini potted succulent
        px(tx - 5, ty - 8, 10, 7, OUT);
        px(tx - 4, ty - 7, 8, 5, "#b8613d");
        oval(tx, ty - 10, 6, 4, OUT);
        oval(tx, ty - 10, 5, 3, "#5d8754");
        px(tx - 2, ty - 12, 4, 2, "#87b579");
      } else if (t % 3 === 1) {
        drawMug(tx - 14, ty - 10, "#fff5df");
        drawMug(tx + 6, ty - 6, "#e8efe2");
      } else {
        // Pixel notebook + warm candle
        px(tx - 13, ty - 9, 14, 9, OUT);
        px(tx - 12, ty - 8, 12, 7, "#f5ecd7");
        px(tx - 6, ty - 8, 1, 7, "#c7b899");
        // Tiny glowing candle
        px(tx + 7, ty - 9, 6, 8, OUT);
        px(tx + 8, ty - 8, 4, 6, "#fff5db");
        const flicker = motion && Math.floor(perfNow / 140 + t) % 2;
        px(tx + 9, ty - 12 - flicker, 2, 3 + flicker, "#ffbe3b");
      }
    };

    // 6. Draw all 10 tables & 50 chairs with proper Y-depth sorting
    for (let t = 0; t < 10; t++) {
      const [tx, ty] = TABLES[t];
      // Back row chairs behind the table
      for (const j of [0, 1]) {
        const idx = t * 5 + j;
        drawChair(SEATS[idx][0], SEATS[idx][1], idx);
      }
      drawTable(tx, ty, t);
      // Side & front chairs in front of the table
      for (const j of [4, 2, 3]) {
        const idx = t * 5 + j;
        drawChair(SEATS[idx][0], SEATS[idx][1], idx);
      }
    }

    // 7. Standing visitors near entrance
    standing.forEach((guest, idx) => {
      const [sx, sy] = getStandingSpot(idx, standing.length);
      drawAvatar(sx, sy, guest);
    });

    // 8. Warm ambient pendant-lamp glow pools (gives that cozy Coffee Talk atmosphere!)
    g.save();
    g.globalCompositeOperation = "screen";
    const lampPulse = motion ? 0.92 + Math.sin(perfNow * 0.002) * 0.08 : 1;
    for (const [lx, ly] of [
      [113, 68],
      [285, 68],
      [413, 68],
      [548, 68],
      [842, 68],
    ]) {
      const grad = g.createRadialGradient(lx, ly, 4, lx, ly + 22, 86);
      grad.addColorStop(0, `rgba(255, 214, 128, ${(0.22 * lampPulse).toFixed(3)})`);
      grad.addColorStop(1, "rgba(255, 190, 90, 0)");
      g.fillStyle = grad;
      g.fillRect(lx - 90, ly - 10, 180, 120);
    }
    g.restore();

    // 9. Crisp Nameplates cleanly positioned above every builder
    const drawNameplate = (x, y, guest) => {
      const moodIcon =
        {
          grinding: "🔥",
          ghost: "👻",
          pray: "🐟",
          coffee: "☕",
          shipped: "🚀",
        }[guest.mood] || "";
      const nm = guest.name.slice(0, 12);
      const note = guest.note ? " · " + guest.note.slice(0, 14) : "";
      const label = `${moodIcon} ${nm}${note}`;
      g.font = "bold 10px sans-serif";
      const w = Math.min(168, Math.ceil(g.measureText(label).width) + 12);
      const lx = Math.min(W - w / 2 - 4, Math.max(w / 2 + 4, x));
      const bg =
        guest.id === me
          ? "#2f5d3e"
          : (guest.sosUntil || 0) > now
            ? "#9c2824"
            : "rgba(42, 31, 24, 0.88)";
      px(lx - w / 2 - 1, y - 12, w + 2, 16, OUT);
      px(lx - w / 2, y - 11, w, 14, bg);
      g.fillStyle = "#fff6e0";
      g.textAlign = "center";
      g.fillText(label, lx, y - 1, w - 6);
    };

    for (const [seatIdx, guest] of bySeat.entries()) {
      const [sx, sy] = SEATS[seatIdx];
      const offsetY = guest.mood === "ghost" && !celebrating ? 64 : 42;
      drawNameplate(sx, sy - offsetY, guest);
    }
    standing.forEach((guest, idx) => {
      const [sx, sy] = getStandingSpot(idx, standing.length);
      drawNameplate(sx, sy - 42, guest);
    });

    // 10. Expanding golden rings (bell & wooden fish taps)
    this.rings = this.rings.filter((r) => {
      const age = perfNow - r.born;
      if (age < 0) return true;
      if (age >= r.life) return false;
      const t = age / r.life;
      g.save();
      g.globalAlpha = 1 - t;
      g.strokeStyle = r.color;
      g.lineWidth = 2.5;
      g.beginPath();
      g.arc(r.x, r.y, 4 + t * r.maxR, 0, Math.PI * 2);
      g.stroke();
      g.restore();
      return true;
    });

    // 11. Parabolic flying pixel coffee cups!
    this.flyingCups = this.flyingCups.filter((fc) => {
      const t = Math.min(1, (perfNow - fc.born) / fc.dur);
      const x = fc.sx + (fc.tx - fc.sx) * t;
      const arc = Math.sin(t * Math.PI) * 92;
      const y = fc.sy + (fc.ty - fc.sy) * t - arc;
      // Trail steam dots
      g.fillStyle = "rgba(255, 245, 215, 0.72)";
      for (let k = 1; k <= 4; k++) {
        const pt = Math.max(0, t - k * 0.048);
        const px2 = fc.sx + (fc.tx - fc.sx) * pt;
        const py2 = fc.sy + (fc.ty - fc.sy) * pt - Math.sin(pt * Math.PI) * 92;
        g.fillRect(Math.round(px2), Math.round(py2), 3, 3);
      }
      drawMug(x - 4, y - 4, "#fffaf0");
      if (t >= 1 && !fc.splashed) {
        fc.splashed = true;
        for (let i = 0; i < 8; i++) {
          const a = -Math.PI * Math.random();
          this.sparks.push({
            x: fc.tx,
            y: fc.ty,
            vx: Math.cos(a) * (1.0 + Math.random() * 1.4),
            vy: Math.sin(a) * (1.0 + Math.random() * 1.5),
            color: i % 2 ? "#fff4d2" : "#b87443",
            born: perfNow,
            life: 460,
          });
        }
        this.floaters.push({
          x: fc.tx,
          y: fc.ty - 24,
          vy: -0.6,
          text: "+1 ☕",
          color: "#fff5d6",
          stroke: "#3b2313",
          born: perfNow,
          life: 920,
        });
      }
      return t < 1;
    });

    // 12. Celebration cozy twilight spotlight + pixel fireworks!
    if (celebrating) {
      g.fillStyle = "rgba(24, 15, 10, 0.28)";
      g.fillRect(0, 0, W, H);
    }

    this.fireworks = this.fireworks.filter((p) => {
      const age = perfNow - p.born;
      if (age >= p.life) return false;
      p.x += p.vx;
      p.y += p.vy;
      p.vy += 0.038;
      p.vx *= 0.985;
      g.globalAlpha = Math.max(0, 1 - age / p.life);
      g.fillStyle = p.color;
      g.fillRect(Math.round(p.x), Math.round(p.y), 4, 4);
      return true;
    });
    g.globalAlpha = 1;

    this.sparks = this.sparks.filter((p) => {
      const age = perfNow - p.born;
      if (age >= p.life) return false;
      p.x += p.vx;
      p.y += p.vy;
      p.vy += 0.04;
      g.globalAlpha = Math.max(0, 1 - age / p.life);
      g.fillStyle = p.color;
      g.fillRect(Math.round(p.x), Math.round(p.y), 3, 3);
      return true;
    });
    g.globalAlpha = 1;

    // Floating pixel labels (+1 NO BUGS, +1 ☕, cheers)
    this.floaters = this.floaters.filter((f) => {
      const age = perfNow - f.born;
      if (age >= f.life) return false;
      f.y += f.vy;
      const alpha = Math.min(1, (1 - age / f.life) * 1.45);
      g.save();
      g.globalAlpha = alpha;
      g.textAlign = "center";
      if (f.big) {
        g.font = "20px sans-serif";
        g.fillText(f.text, Math.round(f.x), Math.round(f.y));
      } else {
        g.font = "bold 12px monospace";
        if (f.stroke) {
          g.lineWidth = 3;
          g.strokeStyle = f.stroke;
          g.strokeText(f.text, Math.round(f.x), Math.round(f.y));
        }
        g.fillStyle = f.color || "#ffe37a";
        g.fillText(f.text, Math.round(f.x), Math.round(f.y));
      }
      g.restore();
      return true;
    });

    // 13. Speech bubbles rendered cleanly above nameplates
    for (const [whoId, bubble] of bubbles.entries()) {
      if (now - bubble.at > 9500) continue;
      const guest = guests.find((u) => u.id === whoId);
      if (!guest) continue;
      const [bx, by] = this.getGuestCoords(guest, standing);
      const text = bubble.text.slice(0, 48);
      g.font = "bold 12px sans-serif";
      const tw = Math.min(250, Math.ceil(g.measureText(text).width) + 18);
      const th = 24;
      const left = Math.max(6, Math.min(W - tw - 6, Math.round(bx - tw / 2)));
      const top = Math.max(
        6,
        Math.round(by - (guest.mood === "ghost" ? 96 : 76)),
      );

      g.fillStyle = whoId === me ? "#e9f7da" : "#fffaf0";
      g.strokeStyle = OUT;
      g.lineWidth = 2;
      g.beginPath();
      g.roundRect(left, top, tw, th, 6);
      g.fill();
      g.stroke();

      // Tail
      const tailX = Math.max(left + 10, Math.min(left + tw - 10, bx));
      g.fillStyle = whoId === me ? "#e9f7da" : "#fffaf0";
      g.fillRect(Math.round(tailX - 3), top + th - 2, 6, 5);

      g.fillStyle = "#261811";
      g.textAlign = "center";
      g.fillText(text, left + tw / 2, top + 16, tw - 12);
    }

    g.restore();
  }

  // Export an X / Threads ready 1200x675 framed pixel postcard PNG
  exportPostcard(state) {
    const out = document.createElement("canvas");
    out.width = 1200;
    out.height = 675;
    const g = out.getContext("2d");

    g.fillStyle = "#f8f5eb";
    g.fillRect(0, 0, 1200, 675);
    g.strokeStyle = "#d8d5c7";
    g.lineWidth = 3;
    g.strokeRect(24, 24, 1152, 627);

    g.fillStyle = "#2e352e";
    g.font = "bold 28px Georgia, serif";
    g.fillText("☕ Founders’ Café", 52, 68);

    g.fillStyle = "#53674d";
    g.font = "bold 16px sans-serif";
    g.textAlign = "right";
    const online = state.guests?.length || 1;
    g.fillText(
      `● ${online} builder${online === 1 ? "" : "s"} live right now`,
      1148,
      65,
    );
    g.textAlign = "left";

    // Draw crisp 960x540 canvas scaled nicely to 940x529
    const cw = 940;
    const ch = Math.round((cw * H) / W);
    const cx = Math.round((1200 - cw) / 2);
    const cy = 84;
    g.imageSmoothingEnabled = false;
    g.drawImage(this.canvas, cx, cy, cw, ch);
    g.strokeStyle = OUT;
    g.lineWidth = 3;
    g.strokeRect(cx, cy, cw, ch);

    const s = state.stats || { prayers: 0, coffees: 0, celebrations: 0 };
    g.fillStyle = "#4c3d32";
    g.font = "bold 17px monospace";
    g.fillText(
      `🐟 ${s.prayers} prod prayers   ·   ☕ ${s.coffees} coffees tossed   ·   🎉 ${s.celebrations} ships celebrated`,
      52,
      642,
    );
    g.fillStyle = "#a44327";
    g.textAlign = "right";
    g.font = "bold 16px monospace";
    g.fillText(location.host, 1148, 642);

    return out.toDataURL("image/png");
  }
}
