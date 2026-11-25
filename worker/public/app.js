import { CafeScene, W, H } from "./scene.js";
import * as sfx from "./sfx.js";

const $ = (id) => document.getElementById(id);

const I18N = {
  en: {
    connecting: "Connecting…",
    live: (n) => `${n} builder${n === 1 ? "" : "s"} live`,
    rain: "Rain",
    sound: "Sound",
    muted: "Muted",
    postcard: "Postcard",
    me: "Me",
    canvasHint: "Click any empty chair to move · Click any builder to toss them a ☕",
    seated: (n) => `${n} / 50 seated`,
    moodTitle: "Pick your chaos",
    mood_grinding: "Grinding",
    mood_ghost: "Soul Left Body",
    mood_pray: "Praying to Prod",
    mood_coffee: "Caffeinated",
    mood_shipped: "Just Shipped",
    prayTitle: "Tap Wooden Fish",
    praySub: "+1 No Bugs · ",
    shipTitle: "Ring Bell: Shipped / $1",
    shipSub: "Café-wide pixel fireworks!",
    sosTitle: "Prod is Down! Send ☕",
    sosSub: "Flash beacon & catch coffees",
    tossTitle: "Toss a Coffee",
    tossSub: "Fling a cup across the room",
    bubblePlaceholder: "Pop a quick thought above your pixel head…",
    say: "Say",
    statsHeading: "Café Counter · All Time",
    lblPrayers: "🐟 Prod Prayers",
    lblCoffees: "☕ Coffees Tossed",
    lblCelebrations: "🎉 Ships Celebrated",
    lblVisitors: "🚪 Café Visits",
    momentsHeading: "Recent Bells & Prod SOS",
    emptyMoments: "No bells rung yet — be the first to ship or crash prod!",
    footHint: "Tap · Toss · Ship together",
    profileModalTitle: "Your Café Nameplate",
    nameLabel: "Nickname",
    noteLabel: "What are you building / breaking? (optional)",
    save: "Save",
    bellModalTitle: "🎉 Ring the Café Bell!",
    bellFieldLabel: "What did you just ship or earn?",
    bellPlaceholder: "e.g. Launched v1 / Made my first $9!",
    bellSubmit: "Launch Fireworks 🎉",
    sosModalTitle: "💥 Prod SOS — Call for Coffee",
    sosFieldLabel: "What broke?",
    sosPlaceholder: "e.g. Stripe webhook down / Infinite loop in prod",
    sosSubmit: "Flash Beacon 🚨",
    bannerClap: "👏 Clap!",
    bannerToss: "☕ Toss Coffee!",
    hoverEmpty: "Click to sit here",
    hoverSelf: "You · Click to edit nameplate",
    hoverOther: (name) => `Click to toss ☕ to ${name}`,
    toastToss: (to) => `☕ Tossed a coffee to ${to}!`,
    toastPostcard: "📸 Postcard saved! Drop it on X or Threads.",
    toastCooldown: "Give the bell a few seconds to cool down!",
    toastTaken: "That chair was just taken.",
    toastIpLimit: "Max 2 chairs per device.",
    toastSlow: "Easy there — wait a second before chatting again.",
    justNow: "just now",
    minsAgo: (m) => `${m}m ago`,
    hrsAgo: (h) => `${h}h ago`,
    daysAgo: (d) => `${d}d ago`,
  },
  zh: {
    connecting: "正在连接…",
    live: (n) => `${n} 位创业者在线`,
    rain: "雨声",
    sound: "音效",
    muted: "静音",
    postcard: "截明信片",
    me: "名片",
    canvasHint: "点空椅子换座 · 点任意人物给 TA 扔一杯 ☕",
    seated: (n) => `${n} / 50 已入座`,
    moodTitle: "选一个此刻的精神状态",
    mood_grinding: "狂敲冒火",
    mood_ghost: "灵魂出窍",
    mood_pray: "敲木鱼祈祷",
    mood_coffee: "续命中",
    mood_shipped: "刚上线！",
    prayTitle: "敲电子木鱼",
    praySub: "功德 +1 不出 Bug · ",
    shipTitle: "摇铃：刚上线 / 赚到首单",
    shipSub: "全店起立放像素烟花！",
    sosTitle: "线上崩了！速递 ☕",
    sosSub: "拉响警报接满屏咖啡",
    tossTitle: "随机扔一杯咖啡",
    tossSub: "跨桌投喂在线创业者",
    bubblePlaceholder: "在头顶冒一句气泡…",
    say: "冒泡",
    statsHeading: "咖啡馆累计奇观",
    lblPrayers: "🐟 祈祷不出 Bug",
    lblCoffees: "☕ 投喂咖啡杯",
    lblCelebrations: "🎉 全店烟花次数",
    lblVisitors: "🚪 推门人次",
    momentsHeading: "最近响铃与线上求救",
    emptyMoments: "还没有人摇铃——来当今天第一位上线或炸服的人吧！",
    footHint: "敲木鱼 · 扔咖啡 · 一起上线",
    profileModalTitle: "修改我的咖啡馆名片",
    nameLabel: "昵称",
    noteLabel: "正在做什么 / 正在修什么？（选填）",
    save: "保存",
    bellModalTitle: "🎉 拉响全店上线铃！",
    bellFieldLabel: "刚刚上线了什么 / 赚到了多少？",
    bellPlaceholder: "比如：发了第一版 / 拿到人生第一笔 $5！",
    bellSubmit: "全店放烟花 🎉",
    sosModalTitle: "💥 线上崩了 · 呼叫咖啡支援",
    sosFieldLabel: "哪儿炸了？",
    sosPlaceholder: "比如：支付回调挂了 / 改了一行全白屏",
    sosSubmit: "拉响警报 🚨",
    bannerClap: "👏 鼓掌祝贺！",
    bannerToss: "☕ 扔杯咖啡救场！",
    hoverEmpty: "点击坐这里",
    hoverSelf: "你 · 点击改名片",
    hoverOther: (name) => `点击给 ${name} 扔一杯 ☕`,
    toastToss: (to) => `☕ 给 ${to} 扔了一杯热咖啡！`,
    toastPostcard: "📸 像素明信片已保存，发到 X / Threads 吧！",
    toastCooldown: "摇铃冷却中，稍等几秒再拉～",
    toastTaken: "这个座位刚被抢啦。",
    toastIpLimit: "同一设备最多占 2 个座位哦。",
    toastSlow: "慢一点，隔一秒再冒泡～",
    justNow: "刚刚",
    minsAgo: (m) => `${m}分钟前`,
    hrsAgo: (h) => `${h}小时前`,
    daysAgo: (d) => `${d}天前`,
  },
};

let lang = localStorage.getItem("cafe-lang") === "zh" ? "zh" : "en";
const tr = (key, ...args) => {
  const v = I18N[lang][key];
  return typeof v === "function" ? v(...args) : v;
};

// Persistent guest identity on fixed origin
let savedId = localStorage.getItem("cafe-uid");
if (!savedId) {
  savedId = (crypto.randomUUID?.() || String(Math.random())).replace(/-/g, "").slice(0, 12);
  localStorage.setItem("cafe-uid", savedId);
}
let savedName = localStorage.getItem("cafe-name") || "";
let savedNote = localStorage.getItem("cafe-note") || "";
let savedMood = localStorage.getItem("cafe-mood") || "grinding";

const state = {
  me: null,
  connected: false,
  guests: [],
  stats: { prayers: 0, coffees: 0, celebrations: 0, visitors: 0 },
  moments: [],
  bubbles: new Map(),
  banner: null, // { kind, id, name, text, until }
};

const canvas = $("cafeCanvas");
const scene = new CafeScene(canvas);

let ws = null;
let retryMs = 900;
let pingTimer = null;
let toastTimer = null;
let modalAction = null;

function toast(msg) {
  const el = $("toast");
  el.textContent = msg;
  el.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (el.hidden = true), 3200);
}

function send(obj) {
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(obj));
    return true;
  }
  return false;
}

function findGuest(id) {
  return state.guests.find((g) => g.id === id);
}

function getStanding() {
  return state.guests.filter((g) => !Number.isInteger(g.seat));
}

function formatAgo(ts) {
  const sec = Math.max(0, Math.floor((Date.now() - ts) / 1000));
  if (sec < 45) return tr("justNow");
  const min = Math.floor(sec / 60);
  if (min < 60) return tr("minsAgo", min);
  const hr = Math.floor(min / 60);
  if (hr < 24) return tr("hrsAgo", hr);
  return tr("daysAgo", Math.floor(hr / 24));
}

function updateLanguageUI() {
  document.documentElement.lang = lang;
  $("langSelect").value = lang;
  $("rainLabel").textContent = tr("rain");
  $("sfxLabel").textContent = sfx.isSoundEnabled() ? tr("sound") : tr("muted");
  $("postcardLabel").textContent = tr("postcard");
  $("profileLabel").textContent = tr("me");
  $("canvasHint").textContent = tr("canvasHint");
  $("moodTitle").textContent = tr("moodTitle");
  for (const el of document.querySelectorAll("[data-i18n]")) {
    el.textContent = tr(el.dataset.i18n);
  }
  $("prayTitle").textContent = tr("prayTitle");
  $("shipTitle").textContent = tr("shipTitle");
  $("shipSub").textContent = tr("shipSub");
  $("sosTitle").textContent = tr("sosTitle");
  $("sosSub").textContent = tr("sosSub");
  $("tossTitle").textContent = tr("tossTitle");
  $("tossSub").textContent = tr("tossSub");
  $("bubbleInput").placeholder = tr("bubblePlaceholder");
  $("bubbleSend").textContent = tr("say");
  $("statsHeading").textContent = tr("statsHeading");
  $("lblPrayers").textContent = tr("lblPrayers");
  $("lblCoffees").textContent = tr("lblCoffees");
  $("lblCelebrations").textContent = tr("lblCelebrations");
  $("lblVisitors").textContent = tr("lblVisitors");
  $("momentsHeading").textContent = tr("momentsHeading");
  $("footHint").textContent = tr("footHint");
  updateStatsUI();
  updatePresenceUI();
  renderMoments();
  updateBannerUI();
}

function updatePresenceUI() {
  const badge = $("liveBadge");
  badge.classList.toggle("offline", !state.connected);
  $("liveText").textContent = state.connected
    ? tr("live", state.guests.length)
    : tr("connecting");
  const seated = state.guests.filter((g) => Number.isInteger(g.seat)).length;
  $("seatCounter").textContent = tr("seated", seated);

  const meGuest = findGuest(state.me);
  const activeMood = meGuest?.mood || savedMood;
  for (const b of document.querySelectorAll(".mood-btn")) {
    b.classList.toggle("active", b.dataset.mood === activeMood);
  }
}

function updateStatsUI() {
  const s = state.stats;
  $("statPrayers").textContent = s.prayers.toLocaleString();
  $("statCoffees").textContent = s.coffees.toLocaleString();
  $("statCelebrations").textContent = s.celebrations.toLocaleString();
  $("statVisitors").textContent = s.visitors.toLocaleString();
  $("praySub").innerHTML = `${tr("praySub")}<span id="statPrayersInline">${s.prayers.toLocaleString()}</span>`;
}

function renderMoments() {
  const list = $("momentsList");
  list.replaceChildren();
  if (!state.moments.length) {
    const li = document.createElement("li");
    li.className = "empty-moments";
    li.textContent = tr("emptyMoments");
    list.append(li);
    return;
  }
  for (const m of state.moments.slice(0, 20)) {
    const li = document.createElement("li");
    li.className = `moment-item ${m.kind}`;
    const span = document.createElement("span");
    span.className = "moment-text";
    const icon = m.kind === "celebrate" ? "🎉" : "🚨";
    span.textContent = `${icon} ${m.name}: ${m.text}`;
    const time = document.createElement("span");
    time.className = "moment-time";
    time.textContent = formatAgo(m.at);
    li.append(span, time);
    list.append(li);
  }
}

function updateBannerUI() {
  const box = $("eventBanner");
  if (!state.banner || Date.now() >= state.banner.until) {
    state.banner = null;
    box.hidden = true;
    return;
  }
  box.hidden = false;
  box.classList.toggle("sos", state.banner.kind === "sos");
  const icon = state.banner.kind === "celebrate" ? "🎉" : "🚨";
  $("eventBannerText").textContent = `${icon} ${state.banner.name}: ${state.banner.text}`;
  const btn = $("eventBannerAction");
  btn.textContent =
    state.banner.kind === "celebrate" ? tr("bannerClap") : tr("bannerToss");
  btn.onclick = () => {
    if (state.banner?.kind === "celebrate") {
      sendCheer("👏");
    } else if (state.banner?.kind === "sos") {
      tossCoffee(state.banner.id);
    }
  };
}

// Modal helper
function openModal(title, fields, submitLabel, onSubmit) {
  $("modalTitle").textContent = title;
  const body = $("modalBody");
  body.replaceChildren();
  for (const f of fields) {
    const lbl = document.createElement("label");
    lbl.className = "field-label";
    lbl.textContent = f.label;
    const inp = document.createElement("input");
    inp.name = f.name;
    inp.maxLength = f.max || 60;
    inp.value = f.value || "";
    if (f.placeholder) inp.placeholder = f.placeholder;
    if (f.required) inp.required = true;
    lbl.append(inp);
    body.append(lbl);
  }
  $("modalSubmit").textContent = submitLabel;
  modalAction = onSubmit;
  const dialog = $("modal");
  if (!dialog.open) dialog.showModal();
  body.querySelector("input")?.focus();
}

$("modalClose").onclick = () => $("modal").close();
$("modalForm").onsubmit = (e) => {
  e.preventDefault();
  const data = Object.fromEntries(new FormData(e.target));
  modalAction?.(data);
  $("modal").close();
};

// Actions
function setMood(mood) {
  savedMood = mood;
  localStorage.setItem("cafe-mood", mood);
  const meGuest = findGuest(state.me);
  if (meGuest) meGuest.mood = mood;
  sfx.playSoftClick();
  updatePresenceUI();
  send({ type: "mood", mood });
}

function tapWoodenFish() {
  sfx.playWoodblock();
  const meGuest = findGuest(state.me);
  if (meGuest) {
    meGuest.mood = "pray";
    savedMood = "pray";
    localStorage.setItem("cafe-mood", "pray");
    const [x, y] = scene.getGuestCoords(meGuest, getStanding());
    scene.triggerTap(meGuest.id, x, y, lang === "zh");
    updatePresenceUI();
  }
  send({ type: "pray" });
}

function tossCoffee(targetId = null) {
  sfx.playCoffeeToss();
  send({ type: "toss", to: targetId });
}

function sendCheer(emoji) {
  sfx.playSoftClick();
  send({ type: "cheer", emoji });
}

// Wire up buttons
for (const btn of document.querySelectorAll(".mood-btn")) {
  btn.onclick = () => setMood(btn.dataset.mood);
}

$("prayBtn").onclick = tapWoodenFish;

$("celebrateBtn").onclick = () => {
  openModal(
    tr("bellModalTitle"),
    [
      {
        name: "text",
        label: tr("bellFieldLabel"),
        placeholder: tr("bellPlaceholder"),
        max: 70,
      },
    ],
    tr("bellSubmit"),
    (d) => {
      send({ type: "celebrate", text: d.text });
    },
  );
};

$("sosBtn").onclick = () => {
  openModal(
    tr("sosModalTitle"),
    [
      {
        name: "text",
        label: tr("sosFieldLabel"),
        placeholder: tr("sosPlaceholder"),
        max: 70,
      },
    ],
    tr("sosSubmit"),
    (d) => {
      send({ type: "sos", text: d.text });
    },
  );
};

$("tossBtn").onclick = () => tossCoffee(null);

$("bubbleForm").onsubmit = (e) => {
  e.preventDefault();
  const inp = $("bubbleInput");
  const text = inp.value.trim();
  if (!text) return;
  if (send({ type: "chat", text })) {
    sfx.playSoftClick();
    inp.value = "";
  }
};

for (const btn of document.querySelectorAll(".cheer-btn")) {
  btn.onclick = () => sendCheer(btn.dataset.emoji);
}

$("profileBtn").onclick = () => {
  const meGuest = findGuest(state.me);
  openModal(
    tr("profileModalTitle"),
    [
      {
        name: "name",
        label: tr("nameLabel"),
        value: meGuest?.name || savedName,
        max: 20,
        required: true,
      },
      {
        name: "note",
        label: tr("noteLabel"),
        value: meGuest?.note || savedNote,
        max: 60,
      },
    ],
    tr("save"),
    (d) => {
      savedName = d.name.trim().slice(0, 20);
      savedNote = d.note.trim().slice(0, 60);
      localStorage.setItem("cafe-name", savedName);
      localStorage.setItem("cafe-note", savedNote);
      send({ type: "profile", name: savedName, note: savedNote });
      sfx.playSoftClick();
    },
  );
};

$("sfxBtn").onclick = () => {
  const next = !sfx.isSoundEnabled();
  sfx.setSoundEnabled(next);
  $("sfxBtn").classList.toggle("active", next);
  $("sfxLabel").textContent = next ? tr("sound") : tr("muted");
  if (!next) $("rainBtn").classList.remove("active");
  if (next) sfx.playSoftClick();
};

$("rainBtn").onclick = () => {
  const next = !sfx.isRainEnabled();
  if (next && !sfx.isSoundEnabled()) {
    sfx.setSoundEnabled(true);
    $("sfxBtn").classList.add("active");
    $("sfxLabel").textContent = tr("sound");
  }
  sfx.setRainEnabled(next);
  $("rainBtn").classList.toggle("active", next);
};

$("postcardBtn").onclick = () => {
  sfx.playSoftClick();
  const url = scene.exportPostcard(state);
  const a = document.createElement("a");
  a.href = url;
  a.download = `founders-cafe-${Date.now()}.png`;
  a.click();
  toast(tr("toastPostcard"));
};

$("langSelect").onchange = (e) => {
  lang = e.target.value;
  localStorage.setItem("cafe-lang", lang);
  updateLanguageUI();
};

// Direct Canvas Interaction: click empty chair to move, click builder to toss coffee!
function canvasCoords(e) {
  const rect = canvas.getBoundingClientRect();
  return [
    ((e.clientX - rect.left) / rect.width) * W,
    ((e.clientY - rect.top) / rect.height) * H,
    e.clientX - rect.left,
    e.clientY - rect.top,
  ];
}

canvas.addEventListener("mousemove", (e) => {
  const [cx, cy, px, py] = canvasCoords(e);
  const hit = scene.hitTest(cx, cy, state.guests, getStanding());
  const tip = $("canvasTooltip");
  if (!hit) {
    scene.hoverSeat = -1;
    scene.hoverGuestId = null;
    tip.hidden = true;
    return;
  }
  if (hit.kind === "guest") {
    scene.hoverGuestId = hit.guest.id;
    scene.hoverSeat = -1;
    tip.textContent =
      hit.guest.id === state.me
        ? tr("hoverSelf")
        : tr("hoverOther", hit.guest.name);
  } else {
    scene.hoverSeat = hit.seat;
    scene.hoverGuestId = null;
    tip.textContent = tr("hoverEmpty");
  }
  tip.style.left = px + "px";
  tip.style.top = py + "px";
  tip.hidden = false;
});

canvas.addEventListener("mouseleave", () => {
  scene.hoverSeat = -1;
  scene.hoverGuestId = null;
  $("canvasTooltip").hidden = true;
});

canvas.addEventListener("click", (e) => {
  const [cx, cy] = canvasCoords(e);
  const hit = scene.hitTest(cx, cy, state.guests, getStanding());
  if (!hit) return;
  if (hit.kind === "guest") {
    if (hit.guest.id === state.me) {
      $("profileBtn").click();
    } else {
      tossCoffee(hit.guest.id);
    }
  } else if (hit.kind === "seat") {
    sfx.playSoftClick();
    send({ type: "seat", seat: hit.seat });
  }
});

// WebSocket Connection & Delta Handling
function connect() {
  const proto = location.protocol === "https:" ? "wss:" : "ws:";
  const qs = new URLSearchParams({
    id: savedId,
    mood: savedMood,
  });
  if (savedName) qs.set("name", savedName);
  if (savedNote) qs.set("note", savedNote);

  ws = new WebSocket(`${proto}//${location.host}/ws?${qs}`);

  ws.onopen = () => {
    state.connected = true;
    retryMs = 900;
    updatePresenceUI();
    clearInterval(pingTimer);
    pingTimer = setInterval(() => {
      if (ws?.readyState === WebSocket.OPEN) ws.send("ping");
    }, 25000);
  };

  ws.onmessage = (event) => {
    if (event.data === "pong") return;
    let msg;
    try {
      msg = JSON.parse(event.data);
    } catch {
      return;
    }

    if (msg.type === "snapshot") {
      state.me = msg.me;
      state.guests = msg.guests || [];
      state.stats = msg.stats || state.stats;
      state.moments = msg.moments || [];
      updatePresenceUI();
      updateStatsUI();
      renderMoments();
      return;
    }

    if (msg.type === "join") {
      if (!findGuest(msg.guest.id)) state.guests.push(msg.guest);
      if (msg.visitors) state.stats.visitors = msg.visitors;
      updatePresenceUI();
      updateStatsUI();
      return;
    }

    if (msg.type === "leave") {
      state.guests = state.guests.filter((g) => g.id !== msg.id);
      state.bubbles.delete(msg.id);
      updatePresenceUI();
      return;
    }

    if (msg.type === "mood") {
      const g = findGuest(msg.id);
      if (g) g.mood = msg.mood;
      updatePresenceUI();
      return;
    }

    if (msg.type === "profile") {
      const g = findGuest(msg.id);
      if (g) {
        g.name = msg.name;
        g.note = msg.note;
      }
      return;
    }

    if (msg.type === "seat") {
      const g = findGuest(msg.id);
      if (g) g.seat = msg.seat;
      updatePresenceUI();
      return;
    }

    if (msg.type === "pray") {
      state.stats.prayers = msg.prayers;
      updateStatsUI();
      const g = findGuest(msg.id);
      if (g) g.mood = "pray";
      // Avoid double-triggering local tap animation/sound
      if (msg.id !== state.me && g) {
        const [x, y] = scene.getGuestCoords(g, getStanding());
        scene.triggerTap(g.id, x, y, lang === "zh");
        sfx.playWoodblock(0.11);
      }
      return;
    }

    if (msg.type === "toss") {
      state.stats.coffees = msg.coffees;
      updateStatsUI();
      const fromG = findGuest(msg.from);
      const toG = findGuest(msg.to);
      if (toG) toG.cups = msg.cups;
      const standing = getStanding();
      const [fx, fy] = fromG ? scene.getGuestCoords(fromG, standing) : [300, 320];
      const [tx, ty] = toG ? scene.getGuestCoords(toG, standing) : [300, 180];
      scene.triggerToss(fx, fy, tx, ty);
      if (msg.from !== state.me) sfx.playCoffeeToss();
      if (msg.from === state.me) {
        toast(tr("toastToss", msg.toName));
      }
      return;
    }

    if (msg.type === "celebrate") {
      state.stats.celebrations = msg.celebrations;
      updateStatsUI();
      const g = findGuest(msg.id);
      if (g) {
        g.mood = "shipped";
        g.celebrateUntil = msg.until;
      }
      if (msg.moment) {
        state.moments.unshift(msg.moment);
        state.moments = state.moments.slice(0, 24);
        renderMoments();
      }
      scene.triggerCelebration(msg.name, msg.text, 6200);
      sfx.playBell();
      setTimeout(() => sfx.playPop(), 450);
      setTimeout(() => sfx.playPop(), 1100);
      setTimeout(() => sfx.playPop(), 1900);
      state.banner = {
        kind: "celebrate",
        id: msg.id,
        name: msg.name,
        text: msg.text,
        until: Date.now() + 6500,
      };
      updateBannerUI();
      updatePresenceUI();
      return;
    }

    if (msg.type === "sos") {
      const g = findGuest(msg.id);
      if (g) {
        g.mood = "ghost";
        g.sosUntil = msg.until;
      }
      if (msg.moment) {
        state.moments.unshift(msg.moment);
        state.moments = state.moments.slice(0, 24);
        renderMoments();
      }
      scene.triggerSosShake();
      sfx.playSos();
      state.banner = {
        kind: "sos",
        id: msg.id,
        name: msg.name,
        text: msg.text,
        until: Date.now() + 18000,
      };
      updateBannerUI();
      updatePresenceUI();
      return;
    }

    if (msg.type === "bubble") {
      state.bubbles.set(msg.id, { text: msg.text, at: Date.now() });
      return;
    }

    if (msg.type === "cheer") {
      const g = findGuest(msg.id);
      if (g) {
        const [x, y] = scene.getGuestCoords(g, getStanding());
        scene.triggerCheer(x, y, msg.emoji);
      }
      return;
    }

    if (msg.type === "error") {
      const map = {
        cooldown: tr("toastCooldown"),
        taken: tr("toastTaken"),
        ipLimit: tr("toastIpLimit"),
        slow: tr("toastSlow"),
      };
      if (map[msg.code]) toast(map[msg.code]);
    }
  };

  ws.onclose = () => {
    state.connected = false;
    clearInterval(pingTimer);
    updatePresenceUI();
    setTimeout(connect, retryMs);
    retryMs = Math.min(10000, Math.round(retryMs * 1.5));
  };
}

// 60fps animation loop (pauses cleanly when tab hidden)
function loop() {
  if (!document.hidden) {
    const now = Date.now();
    if (state.banner && now >= state.banner.until) {
      updateBannerUI();
    }
    scene.render({
      guests: state.guests,
      me: state.me,
      stats: state.stats,
      zh: lang === "zh",
      rainOn: sfx.isRainEnabled(),
      bubbles: state.bubbles,
      now,
    });
  }
  requestAnimationFrame(loop);
}

// Init
$("sfxBtn").classList.toggle("active", sfx.isSoundEnabled());
updateLanguageUI();
connect();
requestAnimationFrame(loop);
