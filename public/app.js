import { seats, stageSpot, draw } from "./scene.js";
import * as audio from "./audio.js";
const $ = (id) => document.getElementById(id),
  t = (en, zh) => (language === "zh" ? zh : en);
let language = localStorage.getItem("cafe-language") === "zh" ? "zh" : "en",
  room = null,
  socket,
  page = "room",
  list = false,
  offset = 0,
  online = false,
  submitting = false,
  dialogWork,
  toastTimer,
  retryTimer;
const errors = {
  seat: ["Take a seat first.", "请先入座。"],
  taken: ["That seat has just been taken.", "这个座位刚被占用。"],
  invalid: ["Check the fields and try again.", "请检查填写内容。"],
  required: ["Fill in the required fields.", "请填好必填项。"],
  pass: ["This action needs a participant pass.", "这个操作需要参与凭证。"],
  private: [
    "You do not have permission for this action.",
    "你没有此项操作权限。",
  ],
  stale: [
    "The room has changed. Check the current stage.",
    "房间状态已更新，请查看当前讲台。",
  ],
  queued: ["You are already in the queue.", "你已在队列中。"],
  vote: [
    "Voting is closed or you were not seated when it opened.",
    "投票尚未开放，或开放时你还未入座。",
  ],
  closed: ["This request is closed.", "这项请求已关闭。"],
  exists: ["You have already done that.", "这项操作已经完成。"],
  badPass: ["That pass is invalid.", "凭证无效。"],
  refresh: ["Refresh to use public discussions.", "请刷新页面进入公开讨论。"],
  muted: ["The host has muted this account.", "主持人已将此账户静音。"],
  offline: ["Reconnecting to the café…", "正在重新连接咖啡馆…"],
  speaker: ["Only the current speaker can do that.", "只有当前讲者可以操作。"],
  busy: ["Please wait a moment.", "请稍后再试。"],
};
const errorText = (e) =>
  errors[e.message] ? t(...errors[e.message]) : e.message;
function el(tag, text = "", cl = "") {
  const n = document.createElement(tag);
  if (text) n.textContent = text;
  if (cl) n.className = cl;
  return n;
}
function btn(text, fn, cl = "") {
  const b = el("button", text, cl);
  b.type = "button";
  b.onclick = () =>
    Promise.resolve()
      .then(fn)
      .catch((e) => notice(errorText(e)));
  return b;
}
function notice(text) {
  $("toast").textContent = text;
  $("toast").hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => ($("toast").hidden = true), 4500);
}
async function post(path, data) {
  const r = await fetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  const v = await r.json().catch(() => ({}));
  if (!r.ok)
    throw Error(
      v.error || (r.status === 429 ? "busy" : t("Request failed", "请求失败")),
    );
  return v;
}
async function act(action, data = {}) {
  if (!online) throw Error("offline");
  return post("/api/action", {
    action,
    requestId: crypto.randomUUID(),
    ...data,
  });
}
const name = (id) => room?.people[id]?.name || t("Guest", "访客");
const mine = () => room?.stage?.who === room?.me;
const sitting = () => room?.seats.indexOf(room.me) ?? -1;
const stageData = () => ({ stage: room?.stage?.id });
function gate(fn) {
  if (room.role === "guest") passDialog();
  else fn();
}
function modal(title, fields, submit, run, notes = "") {
  $("dialogTitle").textContent = title;
  $("dialogBody").replaceChildren();
  $("dialogError").textContent = "";
  $("dialogSave").textContent = submit;
  $("dialogSave").hidden = !submit;
  if (notes)
    $("dialogBody").append(typeof notes === "string" ? el("p", notes) : notes);
  for (const f of fields) {
    const l = el("label", f.label, "formfield");
    let inp;
    if (f.opts) {
      inp = el("select", "", "field");
      for (const [v, txt] of f.opts) {
        const o = el("option", txt);
        o.value = v;
        inp.append(o);
      }
    } else inp = el(f.long ? "textarea" : "input");
    if (f.type) inp.type = f.type;
    inp.name = f.key;
    inp.required = f.req !== false;
    if (f.max) inp.maxLength = f.max;
    if (f.value !== undefined) inp.value = f.value;
    l.append(inp);
    $("dialogBody").append(l);
  }
  dialogWork = run;
  if (!$("dialog").open) $("dialog").showModal();
}
$("x").onclick = () => $("dialog").close();
$("dialogForm").onsubmit = async (e) => {
  e.preventDefault();
  if (submitting) return;
  submitting = true;
  $("dialogSave").disabled = true;
  try {
    await dialogWork?.(Object.fromEntries(new FormData(e.target)));
    $("dialog").close();
  } catch (err) {
    $("dialogError").textContent = errorText(err);
  } finally {
    submitting = false;
    $("dialogSave").disabled = false;
  }
};
function passDialog() {
  modal(
    t("Participant pass", "参与凭证"),
    [
      {
        key: "pass",
        label: t("Paste your invitation link or pass", "粘贴邀请链接或凭证"),
        max: 500,
      },
    ],
    t("Join", "加入"),
    async (d) => {
      let token = d.pass.trim();
      if (token.includes("#"))
        token = new URLSearchParams(token.split("#")[1]).get("pass") || "";
      await post("/api/enter", { pass: token });
      location.reload();
    },
    t(
      "Listening is open to everyone. The host issues one reusable pass per participant for the closed trial.",
      "所有人都可以旁听。内测主持人为每人发一枚可重复使用的凭证。",
    ),
  );
}
function profile() {
  if (!room) return;
  const p = room.people[room.me],
    extra = el("div");
  if (room.role === "host") {
    extra.append(
      btn(t("Set next talk", "预告下一场"), () =>
        modal(
          t("Schedule a talk", "预告下一场分享"),
          [
            { key: "title", label: t("Topic", "题目"), max: 90 },
            {
              key: "when",
              type: "datetime-local",
              label: t("Starts in your local time", "开始时间（本地时区）"),
            },
          ],
          t("Save", "保存"),
          (d) =>
            act("schedule", {
              title: d.title,
              at: new Date(d.when).getTime() / 1000,
            }),
        ),
      ),
    );
    if (room.nextTalk)
      extra.append(
        btn(t("Remove next talk", "撤下预告"), () =>
          ask(
            t("Remove announcement?", "撤下预告？"),
            t("Remove", "撤下"),
            () => act("schedule", { clear: true }),
          ),
        ),
      );
  }
  if (room.role === "guest")
    extra.append(btn(t("Use a participant pass", "使用参与凭证"), passDialog));
  if (room.role === "host")
    extra.append(
      btn(t("Create participant invitation", "生成参与者邀请"), async () => {
        const v = await act("invite");
        const input = el("input");
        input.readOnly = true;
        input.value = location.origin + "/#pass=" + v.pass;
        input.style.width = "100%";
        extra.replaceChildren(
          el(
            "p",
            t(
              "Private invitation for one participant.",
              "仅交给一位参与者的私人邀请。",
            ),
          ),
          input,
        );
        input.select();
      }),
    );
  modal(
    t("My café profile", "我的咖啡馆名片"),
    [
      { key: "name", label: t("Nickname", "昵称"), max: 24, value: p.name },
      {
        key: "tag",
        label: t("One skill or role", "一个技能或角色"),
        max: 32,
        value: p.tag,
        req: false,
      },
      {
        key: "bio",
        label: t(
          "Building · can help with · looking for",
          "正在做什么／能帮什么／想找谁",
        ),
        max: 160,
        value: p.bio,
        req: false,
        long: true,
      },
      {
        key: "lang",
        label: t("I speak and write in", "我说话和书写的语言"),
        opts: [
          ["en", "English"],
          ["zh", "中文"],
        ],
        value: p.lang,
      },
    ],
    t("Save profile", "保存名片"),
    (d) => act("profile", d),
    extra,
  );
}
function person(id) {
  if (id === room.me) return profile();
  const p = room.people[id],
    extra = el("div");
  extra.append(el("p", p.tag || ""));
  if (p.bio) extra.append(trans(p.bio, p.lang));
  extra.append(
    btn(t("Report to host", "向主持人举报"), () =>
      modal(
        t("Report", "举报"),
        [
          {
            key: "text",
            label: t("What happened?", "发生了什么？"),
            max: 240,
            long: true,
          },
        ],
        t("Send report", "提交举报"),
        (d) => act("report", { ...d, who: id }),
      ),
    ),
  );
  modal(p.name, [], "", null, extra);
}
function apply() {
  gate(() =>
    modal(
      t("Request the stage", "申请上台"),
      [
        { key: "title", label: t("Talk title", "分享题目"), max: 90 },
        {
          key: "goal",
          label: t("What will people take away?", "听完能带走什么？"),
          max: 180,
          long: true,
        },
        {
          key: "terms",
          label: t(
            "Names or project terms for captions (optional)",
            "字幕参考人名或项目名（选填）",
          ),
          max: 100,
          req: false,
        },
      ],
      t("Join speaker queue", "加入讲者队列"),
      (d) => act("apply", d),
    ),
  );
}
function cardForm() {
  modal(
    t("Invite a collaborator", "招募协作者"),
    [
      { key: "title", label: t("Short title", "合作标题"), max: 90 },
      {
        key: "task",
        label: t("Task and deliverable", "任务及交付物"),
        max: 240,
        long: true,
      },
      { key: "skills", label: t("Skills needed", "需要什么技能"), max: 100 },
      { key: "hours", label: t("Time commitment", "投入时间"), max: 50 },
      {
        key: "amount",
        label: t("Budget amount (optional)", "金额（选填）"),
        max: 16,
        req: false,
      },
      {
        key: "currency",
        label: t("Currency", "币种"),
        opts: ["USD", "CNY", "EUR", "GBP", "JPY"].map((v) => [v, v]),
      },
      {
        key: "pay",
        label: t("Compensation", "报酬方式"),
        opts: [
          ["paid", t("Paid", "有偿")],
          ["mutual", t("Mutual help", "互助")],
          ["discuss", t("To discuss", "待商议")],
        ],
      },
    ],
    t("Open collaboration card", "发布合作卡"),
    (d) => act("openCard", { ...stageData(), ...d }),
  );
}
function proposal(c) {
  gate(() =>
    modal(
      t("Offer to help publicly", "公开提出合作"),
      [
        {
          key: "text",
          label: t(
            "What can you help with? Everyone here can read your proposal.",
            "你能帮上什么忙？咖啡馆里的每个人都能看到这条提议。",
          ),
          max: 240,
          long: true,
        },
      ],
      t("Post publicly", "公开发表"),
      (d) => act("proposePublic", { ...d, id: c.id }),
    ),
  );
}
function ask(text, button, fn) {
  modal(text, [], button, fn);
}
function sit(i) {
  if (!room) return;
  if (room.seats[i]) person(room.seats[i]);
  else act("seat", { seat: i }).catch((e) => notice(errorText(e)));
}
function take() {
  if (!room) return;
  if (mine())
    return ask(
      t("Finish your talk?", "结束当前分享？"),
      t("Finish", "结束"),
      () => act("end", stageData()),
    );
  if (sitting() >= 0)
    return ask(
      t("Leave your seat?", "离开座位？"),
      t("Leave seat", "离座"),
      () => act("leave"),
    );
  if (room.seatOffer) return act("claimSeat");
  if (room.wait) return act("leave");
  const i = room.seats.findIndex((x, i) => !x && room.reserved !== i);
  return i < 0 ? act("wait") : act("seat", { seat: i });
}
const translations = new Map(),
  pending = [];
let running = 0;
async function drain() {
  if (running >= 2 || !pending.length) return;
  running++;
  const job = pending.shift();
  try {
    job.resolve((await post("/api/translate", job.d)).text);
  } catch (e) {
    job.reject(e);
  } finally {
    running--;
    drain();
  }
}
function translated(text, source, target) {
  const key = JSON.stringify([text, source, target]);
  if (!translations.has(key)) {
    if (translations.size > 750)
      translations.delete(translations.keys().next().value);
    const promise = new Promise((resolve, reject) => {
      pending.push({ resolve, reject, d: { text, source, target } });
      drain();
    });
    translations.set(key, promise);
    promise.catch(() => translations.delete(key));
  }
  return translations.get(key);
}
function trans(text, source) {
  const n = el("div", "", "translation");
  if (!text || source === language) {
    n.textContent = text || "";
    return n;
  }
  const original = el("details"),
    summary = el("summary", t("Original", "原文"));
  original.append(summary, el("span", text));
  if (
    /[0-9$€¥£]|美元|有偿|无偿|预算|盈利|付费|报酬|payment|salary|budget|profit|paid/i.test(
      text,
    )
  )
    original.open = true;
  const visible = el("span", text),
    status = el("small", " · " + t("Translating…", "翻译中…"), "muted");
  n.append(visible, status, original);
  const run = () =>
    translated(text, source, language)
      .then((v) => {
        visible.textContent = v;
        status.remove();
      })
      .catch(() => {
        status.replaceChildren(btn(t("Retry translation", "重新翻译"), run));
      });
  run();
  return n;
}
function paintLabels() {
  document.documentElement.lang = language;
  $("language").value = language;
  const labels = {
    roomNav: t("Coffee room", "咖啡厅"),
    inboxNav: t("Open discussions", "公开讨论"),
    roomTitle: t("The coffee room", "创业咖啡馆"),
    floorTitle: t("Café floor", "咖啡馆座位"),
    view: list ? t("View floor", "查看场景") : t("Seat list", "座位列表"),
    stageLabel: t("The stage", "开放讲台"),
    chatNav: t("Chat", "聊天"),
    chatTitle: t("Public café chat", "大厅公开聊天"),
    discussionHint: t(
      "Everyone in the café can read proposals and join the discussion.",
      "合作提议对全场可见，旁听的朋友也可以回复。",
    ),
    showFloor: t("View café floor", "看座位区"),
    chatSend: t("Send", "发送"),
    transcriptTitle: t("Stage conversation", "讲台交流"),
    cardTitle: t("Collaboration board", "合作黑板"),
    inboxTitle: t("Open discussions", "公开讨论"),
    sendLine: t("Send", "发送"),
    footerState: t("Closed trial", "封闭内测"),
  };
  for (const [id, value] of Object.entries(labels)) $(id).textContent = value;
  $("map").setAttribute(
    "aria-label",
    t(
      "Illustrated café with ten tables and a stage",
      "卡通咖啡馆，十张桌子和一个讲台",
    ),
  );
  $("connection").textContent = online
    ? ""
    : t("Connecting to the café…", "正在连接咖啡馆…");
  $("chatText").placeholder = t("Say hello to the room…", "跟大家打个招呼…");
  $("chatText").setAttribute(
    "aria-label",
    t("Message to the café", "写给大厅的消息"),
  );
  $("chatSend").disabled = !online || sendingChat;
  $("roomPage").hidden = page !== "room";
  $("inboxPage").hidden = page !== "inbox";
  $("roomNav").classList.toggle("active", page === "room");
  $("inboxNav").classList.toggle("active", page === "inbox");
}
// The previous local server sends chat snapshots without message IDs or timestamps.
// Carry over the shared tail across snapshots so a redraw never replays old greetings.
function stampLegacyChat(previous, next) {
  if (!next.chat?.length || next.chat.every((line) => line.at != null)) return;
  const key = (line) =>
    line.id ?? JSON.stringify([line.who, line.lang, line.text]);
  const blocked = new Set(
    next.offers
      .filter((o) => o.blocked)
      .map((o) => (o.from === next.me ? o.owner : o.from)),
  );
  const old = (previous?.chat || []).filter((line) => !blocked.has(line.who));
  const oldKeys = old.map(key),
    newKeys = next.chat.map(key);
  let shared = Math.min(old.length, newKeys.length);
  while (
    shared &&
    !oldKeys.slice(-shared).every((value, i) => value === newKeys[i])
  )
    shared--;
  next.chat.forEach((line, i) => {
    line.at ??=
      i < shared ? old[old.length - shared + i].at : previous ? next.now : 0;
  });
}

const bubbleLifetime = 10;
let bubbleTimer;
function layoutBubbles() {
  const layer = $("speechBubbles");
  const { clientWidth: width, clientHeight: height } = layer;
  if (!width || !height) return;
  const placed = [];
  // Give the newest utterance the space closest to its speaker.
  for (const node of layer.children) {
    const x = (width * Number(node.dataset.x)) / 600;
    const head = (height * (Number(node.dataset.y) - 30)) / 358;
    const w = node.offsetWidth,
      h = node.offsetHeight;
    const left = Math.max(2, Math.min(width - w - 2, x - w / 2));
    let top = Math.max(2, head - h - 5);
    for (const other of placed.toSorted((a, b) => b.top - a.top)) {
      if (
        left < other.right + 3 &&
        left + w + 3 > other.left &&
        top < other.bottom + 4 &&
        top + h + 4 > other.top
      ) {
        top = Math.max(2, other.top - h - 6);
      }
    }
    placed.push({ left, right: left + w, top, bottom: top + h });
    node.style.left = left + "px";
    node.style.top = top + "px";
    node.style.zIndex = String(layer.childElementCount - placed.length + 1);
    node.style.setProperty(
      "--tail",
      Math.min(w - 6, Math.max(6, x - left)) + "px",
    );
  }
}
new ResizeObserver(layoutBubbles).observe($("speechBubbles"));

function paintBubbles() {
  clearTimeout(bubbleTimer);
  const layer = $("speechBubbles"),
    latest = new Map();
  const now = Date.now() / 1000 + offset;
  if (online && page === "room" && !list) {
    const speech = [...(room.chat || []), ...(room.stage?.lines || [])];
    for (const o of room.discussions || []) {
      if (o.updated <= now - bubbleLifetime) continue;
      speech.push({ who: o.from, at: o.at, text: o.text, lang: o.lang });
      for (const message of o.messages) {
        if (message.at > now - bubbleLifetime) speech.push(message);
      }
    }
    for (const line of speech) {
      if (
        line.at > now - bubbleLifetime &&
        (!latest.has(line.who) || line.at >= latest.get(line.who).at)
      )
        latest.set(line.who, line);
    }
  }
  const lines = [...latest.values()].sort((a, b) => b.at - a.at);
  const waiting = lines.filter(
    (line) => !room.seats.includes(line.who) && room.stage?.who !== line.who,
  );
  // Make visitors visible at the entrance while they speak, without allocating a chair.
  const gap = Math.min(62, 540 / Math.max(1, waiting.length));
  const doorway = waiting.map((line, i) => ({
    who: line.who,
    x: 300 + (i % 2 ? 1 : -1) * Math.ceil(i / 2) * gap,
    y: 339,
  }));
  draw($("map"), room, language === "zh", doorway);
  const current = new Map(
    [...layer.children].map((node) => [node.dataset.who, node]),
  );
  const nodes = [];
  for (const line of lines) {
    const seat = room.seats.indexOf(line.who),
      onStage = room.stage?.who === line.who;
    const visitor =
      seat < 0 && !onStage ? doorway.find((p) => p.who === line.who) : null;
    const [x, y] = onStage
      ? stageSpot
      : seat >= 0
        ? seats[seat]
        : [visitor.x, visitor.y];
    let node = current.get(line.who);
    if (!node) {
      node = el("div", "", "speech-bubble");
      node.append(el("span"));
      node.dataset.who = line.who;
    }
    node.dataset.own = String(line.who === room.me);
    node.dataset.x = x;
    node.dataset.y = y;
    node.dataset.anchor = onStage ? "stage" : seat >= 0 ? "seat" : "entrance";
    const signature = JSON.stringify([line.text, line.lang, language]);
    if (node.dataset.content !== signature) {
      node.dataset.content = signature;
      node.firstChild.textContent = line.text;
      if (line.lang !== language)
        translated(line.text, line.lang, language)
          .then((text) => {
            if (node.isConnected && node.dataset.content === signature) {
              node.firstChild.textContent = text;
              layoutBubbles();
            }
          })
          .catch(() => {}); // The original remains visible during a translation outage.
    }
    nodes.push(node);
  }
  layer.replaceChildren(...nodes);
  layoutBubbles();
  if (lines.length) {
    const expires = lines[lines.length - 1].at + bubbleLifetime;
    bubbleTimer = setTimeout(
      paintBubbles,
      Math.max(10, (expires - now) * 1000 + 5),
    );
  }
}
function paintFloor() {
  const n = room.seats.filter(Boolean).length;
  $("roomInfo").textContent = t(
    "Share what you’re building. Everyone here can read and join the conversation.",
    "聊聊你正在做的项目。每个人都能看到你的分享，也可以加入讨论。",
  );
  $("seatCount").textContent = t(n + " / 50 seated", n + " / 50 已入座");
  $("floorHint").textContent = t(
    "Choose a chair or tap a guest to meet them.",
    "点空椅子入座，点人物查看名片。",
  );
  $("take").textContent = mine()
    ? t("End my talk", "结束我的分享")
    : sitting() >= 0
      ? t("Leave seat " + (sitting() + 1), "离开 " + (sitting() + 1) + " 号座")
      : room.seatOffer
        ? t("Claim reserved seat", "确认入座")
        : room.wait
          ? t("Leave waitlist · " + room.wait, "退出候位 · " + room.wait)
          : n === 50 || room.seats.every((v, i) => v || i === room.reserved)
            ? t("Join waitlist", "加入候位")
            : t("Take a seat", "找个座位");
  document.querySelector(".scene").hidden = list;
  $("seatList").hidden = !list;
  paintBubbles();
  for (const target of [list ? "seatList" : "spots"]) {
    const box = $(target);
    if (box.children.length !== 50) {
      box.replaceChildren();
      for (let i = 0; i < 50; i++) {
        const b = btn("", () => sit(i), list ? "small" : "spot");
        if (!list) {
          b.style.left = (seats[i][0] / 600) * 100 + "%";
          b.style.top = (seats[i][1] / 358) * 100 + "%";
        }
        box.append(b);
      }
    }
    [...box.children].forEach((b, i) => {
      const id = room.seats[i],
        text =
          t("Seat ", "座位 ") +
          (i + 1) +
          " · " +
          (id
            ? name(id)
            : i === room.reserved
              ? t("Reserved", "已预留")
              : t("Free", "空闲"));
      b.title = text;
      b.setAttribute("aria-label", text);
      if (list) b.textContent = text;
    });
  }
}
function paintStage() {
  const s = room.stage,
    a = $("stageActions");
  a.replaceChildren();
  const add = (label, fn, cl) => a.append(btn(label, fn, cl));
  $("stageState").textContent = s
    ? s.reconnecting
      ? t("Reconnecting", "重连中")
      : t("On air", "分享中")
    : t("Available", "空闲");
  $("stageTitle").replaceChildren(
    s
      ? trans(s.title, s.lang)
      : document.createTextNode(t("The floor is yours.", "讲台正空着。")),
  );
  $("stageDesc").replaceChildren(
    s
      ? trans(s.goal, s.lang)
      : el(
          "p",
          t(
            "Share a lesson from building your business, or invite someone to build with you.",
            "分享一次创业亲历，也可以邀请在场的人一起做点事。",
          ),
        ),
  );
  $("stageMeta").replaceChildren();
  if (!s && room.nextTalk) {
    const n = room.nextTalk;
    $("stageMeta").append(
      el(
        "small",
        t("Next talk · ", "下一场 · ") +
          new Date(n.at * 1000).toLocaleString(language),
      ),
      trans(n.title, n.lang),
    );
  }

  if (s) {
    $("stageMeta").append(
      el(
        "span",
        name(s.who) +
          " · " +
          t("Round ", "第 ") +
          s.round +
          (language === "zh" ? " 轮" : ""),
        "meta",
      ),
      el("div", "", "timer"),
    );
    timer();
  }
  if (room.called)
    add(
      t("Confirm — take the stage", "确认上台"),
      () => act("confirm"),
      "primary",
    );
  else if (mine()) {
    add(
      s.mic
        ? t("Mute microphone", "关麦")
        : t("Start microphone", "开启麦克风"),
      async () => {
        if (s.mic) {
          audio.stopMic();
          await act("mic", { stage: s.id, on: false });
        } else
          ask(
            t(
              "Broadcast your voice and generate local captions?",
              "广播你的声音并在本机生成字幕？",
            ),
            t("Turn on microphone", "开启麦克风"),
            () =>
              audio.mic(s.id, socket, () =>
                act("mic", { stage: s.id, on: true }),
              ),
          );
      },
      "primary",
    );
    if (!room.cards.some((c) => c.id === s.id))
      add(t("Post collaboration card", "发布合作卡"), cardForm);
  } else if (room.position)
    add(t("Cancel request", "取消申请"), () => act("cancel"));
  else
    add(
      t("Request the stage", "申请上台"),
      () =>
        sitting() < 0
          ? notice(t("Choose a seat first.", "请先入座。"))
          : apply(),
      "primary",
    );
  if (s && s.canVote) {
    const b = btn(
      s.voted
        ? t("Vote counted", "已投票")
        : t("Continue +15 min", "续讲 15 分钟"),
      () => act("vote", { stage: s.id, round: s.round }),
    );
    b.disabled = s.voted;
    a.append(b);
  }
  if (sitting() >= 0 || mine()) {
    add("👋 " + t("Wave", "挥手"), () => act("gesture", { emoji: "👋" }));
    add("👏 " + t("Clap", "鼓掌"), () => act("gesture", { emoji: "👏" }));
  }
  $("queueStatus").textContent = [
    t("Speaker queue · ", "候讲人数 · ") + room.queued,
    room.position ? t("Your position ", "你的位置 ") + room.position : "",
    s ? t("Continue votes ", "续讲票 ") + s.votes + "/11" : "",
  ]
    .filter(Boolean)
    .join(" / ");
}
function timer() {
  const n = document.querySelector(".timer");
  if (n && room?.stage) {
    let v = Math.max(
      0,
      Math.ceil(room.stage.end - (Date.now() / 1000 + offset)),
    );
    n.textContent =
      String(Math.floor(v / 60)).padStart(2, "0") +
      ":" +
      String(v % 60).padStart(2, "0");
  }
}
$("sourceLang").onchange = (e) =>
  act("speakLang", { lang: e.target.value }).catch((err) =>
    notice(errorText(err)),
  );
$("fontSize").onclick = () => {
  const big = !document.body.classList.contains("big-type");
  document.body.classList.toggle("big-type", big);
  localStorage.setItem("cafe-big", big ? "1" : "0");
};
document.body.classList.toggle(
  "big-type",
  localStorage.getItem("cafe-big") === "1",
);
function paintChat() {
  const box = $("chatLog");
  const follow = box.scrollHeight - box.scrollTop - box.clientHeight < 24;
  box.replaceChildren();
  const lines = room.chat || [];
  if (!lines.length)
    box.append(
      el(
        "p",
        t(
          "Say hello. Everyone in the café can join in.",
          "这里的人都能看到你发的消息。",
        ),
        "empty",
      ),
    );
  for (const line of lines) {
    const row = el("article", "", "entry");
    row.append(
      btn(name(line.who), () => person(line.who), "chat-author"),
      trans(line.text, line.lang),
    );
    box.append(row);
  }
  if (follow) box.scrollTop = box.scrollHeight;
}
function paintLines() {
  $("talkStream").hidden = !room.stage;
  $("sourceLang").value = room.people[room.me].lang;
  $("sourceLang").title = t("I speak and write in", "我说话和书写的语言");
  $("fontSize").title = t("Change caption size", "调整字幕字号");
  const box = $("lines"),
    s = room.stage;
  const atEnd = box.scrollHeight - box.scrollTop - box.clientHeight < 20;
  box.replaceChildren();
  if (!s?.lines.length)
    box.append(
      el(
        "p",
        t(
          "Questions and live captions appear here during a talk.",
          "开讲后，问题和实时字幕会显示在这里。",
        ),
        "empty",
      ),
    );
  if (s?.captionIssue)
    box.append(
      el(
        "p",
        t(
          "Some captions were unavailable. The speaker can type or correct a line.",
          "部分语音未生成字幕，讲者可打字补充或修订。",
        ),
        "muted",
      ),
    );
  for (const x of s?.lines || []) {
    const row = el("article", "", "entry");
    row.append(
      el(
        "strong",
        name(x.who) +
          " · " +
          {
            talk: t("Speaker", "讲者"),
            question: t("Question", "提问"),
            caption: t("Live caption", "实时字幕"),
          }[x.kind],
      ),
      trans(x.text, x.lang),
    );
    if (x.answered) row.append(el("small", t("Answered", "已回答")));
    else if (mine() && x.kind === "question")
      row.append(
        btn(
          t("Mark answered", "标为已答"),
          () => act("answer", { ...stageData(), line: x.id }),
          "small",
        ),
      );
    if (mine() && x.who === room.me)
      row.append(
        btn(
          t("Edit", "修订"),
          () =>
            modal(
              t("Correct line", "修订原文"),
              [
                {
                  key: "text",
                  label: t("Text", "正文"),
                  value: x.text,
                  max: 600,
                  long: true,
                },
              ],
              t("Save", "保存"),
              (d) => act("editLine", { ...stageData(), line: x.id, ...d }),
            ),
          "small",
        ),
      );
    box.append(row);
  }
  if (atEnd) box.scrollTop = box.scrollHeight;
  $("sayText").placeholder = mine()
    ? t("Share a thought…", "分享一句话…")
    : t("Ask the speaker…", "向讲者提问…");
  $("sayText").disabled = !s || (!mine() && sitting() < 0);
  $("sendLine").disabled = $("sayText").disabled;
  $("sound").textContent = audio.listening
    ? t("Mute audio", "静音")
    : t("Listen to audio", "收听语音");
  $("sound").disabled = !audio.listening && (!s || sitting() < 0);
}
function paintCards() {
  const box = $("cards");
  box.replaceChildren();
  const cards = room.cards.filter((c) => c.open || c.owner === room.me);
  if (!cards.length)
    box.append(
      el(
        "p",
        t(
          "Open tasks from speakers appear here.",
          "讲者发布的具体合作任务会显示在这里。",
        ),
        "empty",
      ),
    );
  for (const c of [...cards].reverse()) {
    const n = el("article", "", "notice");
    n.append(
      trans(c.title, c.lang),
      trans(c.task, c.lang),
      trans(c.skills + " · " + c.hours, c.lang),
      el(
        "small",
        name(c.owner) +
          " · " +
          {
            paid: t("Paid", "有偿"),
            mutual: t("Mutual help", "互助"),
            discuss: t("To discuss", "待商议"),
          }[c.pay] +
          (c.amount ? " · " + c.currency + " " + c.amount : ""),
      ),
    );
    const actions = el("div", "", "actions");
    if (c.open && c.owner !== room.me)
      actions.append(btn(t("I can help", "我可以帮忙"), () => proposal(c)));
    if (c.open && c.owner === room.me)
      actions.append(
        btn(
          t("Close card", "关闭合作卡"),
          () => act("closeCard", { id: c.id }),
          "small",
        ),
      );
    n.append(actions);
    box.append(n);
  }
}
function paintInbox() {
  const box = $("inbox");
  box.replaceChildren();
  const discussions = room.discussions || [];
  if (!discussions.length)
    box.append(
      el(
        "p",
        t(
          "No proposals yet. Choose a collaboration card in the coffee room to offer help.",
          "还没有提议。在咖啡厅的合作黑板上选一张卡，就能公开提出合作。",
        ),
        "empty",
      ),
    );
  for (const o of [...discussions].reverse()) {
    const c = el("article", "", "panel inbox-card"),
      owner = o.owner === room.me,
      author = o.from === room.me;
    c.append(
      el("h2", o.name),
      el(
        "small",
        name(o.from) +
          t(" offered to help ", " 提议协助 ") +
          name(o.owner) +
          " · " +
          {
            pending: t("Pending", "待处理"),
            accepted: t("Accepted", "已接受"),
            withdrawn: t("Withdrawn", "已撤回"),
            declined: t("Declined", "已婉拒"),
          }[o.status],
      ),
      trans(o.text, o.lang),
    );
    for (const m of o.messages)
      c.append(el("strong", name(m.who)), trans(m.text, m.lang));
    const a = el("div", "", "actions");
    if (o.status === "pending") {
      if (owner) {
        a.append(btn(t("Accept", "接受"), () => act("accept", { id: o.id })));
        a.append(btn(t("Decline", "婉拒"), () => act("decline", { id: o.id })));
      }
      if (author)
        a.append(
          btn(t("Withdraw", "撤回"), () => act("withdraw", { id: o.id })),
        );
    }
    if (o.status === "pending" || o.status === "accepted")
      a.append(
        btn(t("Reply publicly", "公开回复"), () =>
          modal(
            t("Reply to the café", "回复全场"),
            [
              {
                key: "text",
                label: t(
                  "Everyone in the café can read this reply.",
                  "咖啡馆里的每个人都能看到这条回复。",
                ),
                max: 600,
                long: true,
              },
            ],
            t("Post publicly", "公开发表"),
            (d) => act("replyPublic", { ...d, id: o.id }),
          ),
        ),
      );
    if (o.status === "accepted") {
      a.append(
        el(
          "small",
          t("Next step confirmed: ", "已确认具体下一步：") +
            Object.keys(o.confirmed || {}).length +
            "/2",
        ),
      );
      if ((owner || author) && !o.confirmed?.[room.me])
        a.append(
          btn(t("Confirm a next step", "确认已约定下一步"), () =>
            act("nextStep", { id: o.id }),
          ),
        );
    }
    c.append(a);
    box.append(c);
  }
  for (const r of room.reports.filter((r) => !r.closed)) {
    const c = el("article", "", "panel inbox-card");
    c.append(
      el(
        "strong",
        t("Host-only report about ", "仅主持人可见的举报 · ") + name(r.who),
      ),
      el("p", r.reason),
    );
    for (const [op, label] of [
      ["mute", t("Mute", "静音")],
      ["end", t("End talk", "结束分享")],
      ["dismiss", t("Dismiss", "关闭举报")],
    ])
      c.append(btn(label, () => act("moderate", { id: r.id, op })));
    for (const card of room.cards.filter((c) => c.open && c.owner === r.who))
      c.append(
        btn(t("Remove card", "撤下卡片"), () =>
          act("moderate", { id: r.id, op: "closeCard", card: card.id }),
        ),
      );
    box.append(c);
  }
}
function paint() {
  paintLabels();
  if (!room) return;
  document.body.classList.toggle("on-air", !!room.stage);
  if (page === "room") {
    paintFloor();
    paintStage();
    paintChat();
    paintLines();
    paintCards();
  } else {
    paintBubbles();
    paintInbox();
  }
}
$("roomNav").onclick = () => {
  page = "room";
  paint();
};
$("showFloor").onclick = () => {
  list = false;
  paint();
  $("map").scrollIntoView({ block: "center" });
};
$("chatNav").onclick = () => {
  page = "room";
  paint();
  $("chat").scrollIntoView({ block: "center" });
  $("chatText").focus({ preventScroll: true });
};
$("inboxNav").onclick = () => {
  page = "inbox";
  paint();
};
$("language").onchange = (e) => {
  language = e.target.value;
  localStorage.setItem("cafe-language", language);
  paint();
};
$("profile").onclick = profile;
$("view").onclick = () => {
  list = !list;
  paint();
};
$("take").onclick = () =>
  Promise.resolve(take()).catch((e) => notice(errorText(e)));
$("sound").onclick = async () => {
  try {
    await audio.listen(!audio.listening, socket);
    paintLines();
  } catch (e) {
    notice(errorText(e));
  }
};
let sendingChat = false;
const chatInput = $("chatText");
let composing = false;
chatInput.addEventListener("compositionstart", () => {
  composing = true;
});
chatInput.addEventListener("compositionend", () => {
  composing = false;
});
chatInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter" && (e.isComposing || composing || e.keyCode === 229)) {
    // Leave IME candidate selection to the browser, suppress only implicit submit.
    skipImeSubmit = true;
    setTimeout(() => {
      skipImeSubmit = false;
    }, 0);
  }
});
let skipImeSubmit = false;
$("chatForm").onsubmit = async (e) => {
  e.preventDefault();
  const text = chatInput.value;
  if (composing || skipImeSubmit || sendingChat || !text.trim()) return;
  if (!online) return notice(errorText(new Error("offline")));
  sendingChat = true;
  $("chatSend").disabled = true;
  try {
    await act("chat", { text });
    if (chatInput.value === text) chatInput.value = "";
  } catch (err) {
    notice(errorText(err));
  } finally {
    sendingChat = false;
    $("chatSend").disabled = !online;
  }
};
$("sayForm").onsubmit = (e) => {
  e.preventDefault();
  const input = $("sayText");
  if (!input.value.trim()) return;
  gate(() =>
    act("say", { ...stageData(), text: input.value })
      .then(() => (input.value = ""))
      .catch((e) => notice(errorText(e))),
  );
};
function connect() {
  socket = new WebSocket(
    (location.protocol === "https:" ? "wss://" : "ws://") +
      location.host +
      "/room",
  );
  socket.binaryType = "arraybuffer";
  socket.onmessage = (e) => {
    if (e.data instanceof ArrayBuffer) {
      audio.receive(e.data, room?.stage);
      return;
    }
    const msg = JSON.parse(e.data);
    if (msg.type !== "room" || (room && online && msg.data.rev < room.rev))
      return;
    if (room?.stage?.id !== msg.data.stage?.id) translations.clear();
    stampLegacyChat(online ? room : null, msg.data);
    room = msg.data;
    online = true;
    offset = room.now - Date.now() / 1000;
    if (
      audio.micStage() &&
      (!mine() || !room.stage.mic || audio.micStage() !== room.stage.id)
    )
      audio.stopMic();
    paint();
  };
  socket.onopen = () => {
    if (audio.listening) socket.send("listen");
  };
  socket.onclose = () => {
    online = false;
    if (room) paintBubbles();
    audio.stopMic();
    paintLabels();
    clearTimeout(retryTimer);
    retryTimer = setTimeout(connect, 1800);
  };
}
async function start() {
  paintLabels();
  draw($("map"), null, language === "zh");
  const pass = new URLSearchParams(location.hash.slice(1)).get("pass");
  if (pass) history.replaceState(null, "", location.pathname);
  try {
    await post("/api/enter", pass ? { pass } : {});
    connect();
  } catch (e) {
    $("connection").textContent = errorText(e);
    $("connection").append(btn(t("Try again", "重试"), start));
  }
}
setInterval(timer, 400);
start();
