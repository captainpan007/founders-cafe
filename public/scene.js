// Original pixel scenery. Seat buttons and the illustration use the same coordinates.
const W = 600,
  H = 358,
  ink = "#4c3d32",
  wood = "#aa714a",
  light = "#d9a069",
  cream = "#f5dfad";
export const seats = Array.from({ length: 50 }, (_, i) => {
  const t = Math.floor(i / 5),
    [dx, dy] = [
      [-15, -18],
      [16, -18],
      [30, 1],
      [0, 18],
      [-30, 1],
    ][i % 5];
  return [60 + 120 * (t % 5) + dx, 176 + 99 * Math.floor(t / 5) + dy];
});
let sceneTimer,
  priorSeats = [],
  arrived = new Map();
export const stageSpot = [308, 92];
export function draw(canvas, room, zh, doorway = []) {
  clearTimeout(sceneTimer);
  const now = performance.now(),
    motion = !matchMedia("(prefers-reduced-motion: reduce)").matches;
  for (const [i, id] of (room?.seats || []).entries())
    if (id && priorSeats[i] !== id) arrived.set(id, now);
  priorSeats = [...(room?.seats || [])];
  for (const [id, at] of arrived) if (now - at > 320) arrived.delete(id);
  if (
    motion &&
    room &&
    (arrived.size || Object.keys(room.effects).length) &&
    canvas.offsetParent !== null
  )
    sceneTimer = setTimeout(() => draw(canvas, room, zh, doorway), 85);
  const g = canvas.getContext("2d");
  g.imageSmoothingEnabled = false;
  const rect = (x, y, w, h, c) => {
    g.fillStyle = c;
    g.fillRect(Math.round(x), Math.round(y), w, h);
  };
  const oval = (x, y, rx, ry, c) => {
    g.fillStyle = c;
    g.beginPath();
    g.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2);
    g.fill();
  };
  const poly = (pts, c) => {
    g.fillStyle = c;
    g.beginPath();
    pts.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y)));
    g.closePath();
    g.fill();
  };
  const label = (t, x, y, c = "#fff0cd", size = 8) => {
    g.fillStyle = c;
    g.font = "bold " + size + "px monospace";
    g.textAlign = "center";
    g.fillText(t, x, y);
  };
  function pot(x, y, n = 1) {
    g.save();
    g.translate(x, y);
    g.scale(n, n);
    rect(-1, -16, 2, 18, "#5b6847");
    for (const [a, b, w, h, col] of [
      [-6, -19, 4, 8, "#738154"],
      [6, -18, 5, 8, "#546d50"],
      [-9, -11, 5, 5, "#5a724e"],
      [1, -25, 3, 7, "#668055"],
      [9, -9, 4, 4, "#7c915e"],
      [-4, -12, 4, 6, "#87985e"],
    ])
      oval(a, b, w, h, col);
    poly(
      [
        [-8, 0],
        [8, 0],
        [6, 12],
        [-5, 12],
      ],
      "#a45c3b",
    );
    rect(-9, -1, 18, 4, "#d18c5c");
    rect(-4, 4, 2, 5, "#d79766");
    g.restore();
  }
  function cup(x, y, c = "#f4e9d0") {
    rect(x, y, 5, 4, c);
    rect(x + 5, y, 2, 3, c);
    rect(x + 1, y, 3, 1, "#69462f");
    rect(x - 1, y + 4, 8, 1, "#c2ab83");
  }
  function windowAt(x, y, w, h) {
    rect(x - 4, y - 3, w + 8, h + 9, ink);
    rect(x, y, w, h, "#adc7ba");
    rect(x + 2, y + 2, w - 4, h - 5, "#bad3c3");
    oval(x + w * 0.7, y + 10, 7, 7, "#f5d690");
    for (let k = 0; k < 6; k++) {
      let ht = 8 + ((k * 11) % 17);
      rect(
        x + (k * w) / 6,
        y + h - ht,
        w / 6,
        ht,
        ["#91a892", "#8da79d", "#a0b09b"][k % 3],
      );
    }
    for (let i = 0; i < 3; i++) {
      oval(x + 8 + (i * w) / 3, y + h - 5, 9, 11, "#758e70");
      oval(x + 15 + (i * w) / 3, y + h - 5, 8, 6, "#94a079");
    }
    rect(x + w / 2 - 2, y, 4, h, "#785d45");
    rect(x, y + h / 2, w, 3, "#856a4d");
    rect(x - 6, y + h, w + 12, 5, wood);
    poly(
      [
        [x - 2, y],
        [x + 12, y],
        [x + 6, y + h * 0.47],
        [x + 1, y + h * 0.7],
      ],
      "#cb865c",
    );
    poly(
      [
        [x + w + 2, y],
        [x + w - 12, y],
        [x + w - 5, y + h * 0.47],
        [x + w, y + h * 0.7],
      ],
      "#b16c4f",
    );
  }
  function avatar(x, y, id) {
    if (motion && arrived.has(id))
      y -= Math.max(0, 4 * (1 - (now - arrived.get(id)) / 320));
    const v = parseInt(id.slice(0, 4), 16) || 0,
      shirt = [
        "#397071",
        "#af6046",
        "#737b9d",
        "#758556",
        "#a07a55",
        "#64788a",
      ][v % 6],
      skin = ["#e1ad85", "#bc8864", "#e8bc95", "#926b53"][v % 4],
      hair = ["#4c3c32", "#80553c", "#433d38", "#995c3a"][v % 4];
    rect(x - 6, y - 9, 12, 11, ink);
    rect(x - 8, y - 7, 16, 8, shirt);
    rect(x - 5, y - 4, 10, 6, shirt);
    rect(x - 4, y - 14, 9, 8, skin);
    rect(x - 5, y - 18, 10, 5, hair);
    rect(x - 6, y - 16, 3, 6, hair);
    rect(x + 3, y - 16, 3, 4, hair);
    rect(x + 1, y - 11, 1, 1, ink);
    const gesture = room?.effects[id]?.emoji;
    const phase = motion && Math.floor(now / 180) % 2 ? 2 : 0;
    if (gesture === "👋") {
      rect(x + 6, y - 10 - phase, 2, 6, shirt);
      rect(x + 6 + phase, y - 13 - phase, 3, 4, skin);
    }
    if (gesture === "👏") {
      rect(x - 5 + phase, y - 5, 3, 3, skin);
      rect(x + 3 - phase, y - 5, 3, 3, skin);
    }
    if (v % 3 === 0) {
      rect(x - 6, y - 18, 12, 2, "#c1a466");
      rect(x - 4, y - 21, 8, 4, "#ae8b54");
    }
  }
  function personLabel(x, y, id) {
    let person = room?.people[id];
    if (!person) return;
    let nm = person.name.slice(0, 12),
      tag = person.tag.slice(0, 10),
      effect = room.effects[id]?.emoji || "";
    let t = (effect ? effect + " " : "") + nm + (tag ? " · " + tag : "");
    g.font = "6px sans-serif";
    let w = Math.min(97, Math.ceil(g.measureText(t).width) + 6);
    x = Math.min(W - w / 2 - 1, Math.max(w / 2 + 1, x));
    rect(x - w / 2, y - 7, w, 9, id === room.me ? "#3c5846" : "#51473c");
    g.fillStyle = "#fff4d9";
    g.textAlign = "center";
    g.fillText(t, x, y, w - 3);
  }
  rect(0, 0, W, H, "#e4c39a");
  for (let y = 0; y < 101; y += 8) {
    for (let x = y % 16 ? -12 : 0; x < W; x += 24) {
      rect(
        x,
        y,
        23,
        7,
        ["#dfbe94", "#e5c59c", "#dfbb92"][(x + 60 + y * 2) % 3],
      );
    }
  }
  rect(0, 95, W, 15, "#947354");
  rect(0, 100, W, 3, "#6e573e");
  rect(0, 108, W, H - 108, "#d9b784");
  for (let y = 110, i = 0; y < H; y += 12, i++) {
    rect(0, y, W, 1, "#b69970");
    for (let x = (i % 3) * 32 - 96, j = 0; x < W; x += 96, j++) {
      rect(
        x + 1,
        y + 1,
        95,
        10,
        ["#e1c397", "#d8b887", "#dfbe8c", "#e9cc9f"][(i + j) % 4],
      );
      rect(x, y, 1, 12, "#b59a74");
      rect(x + 10 + (i % 4) * 4, y + 7, 15 + (j % 6), 1, "#ceb080");
    }
  }
  for (const x of [0, 190, 400, 593]) {
    rect(x, 0, 7, 100, "#866749");
    rect(x + 1, 0, 2, 97, "#af865e");
  }
  rect(0, 0, W, 7, ink);
  rect(0, 6, W, 3, "#a87c52");
  windowAt(18, 19, 75, 46);
  windowAt(490, 20, 85, 49);
  // Back counter, shelves, espresso machine and glass pastry case.
  rect(106, 29, 69, 3, "#885d41");
  rect(106, 47, 69, 3, "#885d41");
  for (let k = 0; k < 7; k++) {
    rect(
      110 + k * 9,
      19 + (k % 3),
      5,
      9 - (k % 3),
      ["#976a43", "#858457", "#b77950"][k % 3],
    );
    rect(110 + k * 9, 18 + (k % 3), 5, 2, "#55493b");
    cup(109 + k * 9, 42);
  }
  rect(8, 83, 174, 29, "#8f634a");
  rect(8, 83, 174, 4, "#60503e");
  rect(10, 89, 170, 21, "#be8658");
  for (let k = 0; k < 8; k++) {
    rect(12 + k * 21, 90, 17, 17, "#ad744f");
    rect(15 + k * 21, 92, 12, 12, "#ba8358");
  }
  rect(5, 78, 180, 6, "#76523c");
  rect(6, 77, 178, 2, "#e5b783");
  rect(20, 62, 37, 14, "#57736d");
  rect(21, 59, 35, 5, "#374e4d");
  rect(23, 63, 32, 3, "#b3bdb0");
  rect(25, 66, 4, 10, "#41534d");
  rect(48, 66, 5, 10, "#41534d");
  cup(32, 71);
  cup(41, 71);
  rect(63, 67, 8, 10, "#80634a");
  poly(
    [
      [61, 57],
      [73, 57],
      [70, 67],
      [65, 67],
    ],
    "#a99370",
  );
  rect(60, 55, 14, 2, ink);
  rect(96, 62, 62, 15, "#95b6aa");
  rect(96, 62, 62, 2, cream);
  rect(96, 71, 62, 1, "#ede0bd");
  rect(96, 76, 62, 2, "#6b6c56");
  for (let k = 0; k < 6; k++) {
    oval(102 + k * 9, 69, 3, 2, "#cc925d");
    oval(103 + k * 9, 74, 4, 2, "#aa7047");
  }
  pot(170, 68, 0.6);
  // Raised stage, its green blackboard, microphone and lamps.
  rect(203, 90, 186, 15, "#9e714c");
  rect(199, 101, 193, 6, "#b3895d");
  rect(196, 107, 200, 5, "#c39968");
  rect(218, 16, 151, 57, "#75593e");
  rect(222, 20, 143, 48, "#38554b");
  rect(225, 22, 137, 1, "#65806b");
  label(zh ? "创业咖啡馆" : "FOUNDERS’ CAFÉ", 293, 40, "#e4dfbf", 12);
  label(zh ? "开放讲台" : "OPEN MIC", 293, 57, "#d8c9a0", 8);
  rect(329, 67, 11, 2, "#e8dbb2");
  rect(264, 79, 18, 13, "#77563c");
  rect(261, 75, 23, 5, "#a37a51");
  rect(272, 66, 2, 9, ink);
  oval(274, 65, 4, 2, ink);
  for (const x of [42, 207, 382, 453]) {
    rect(x, 8, 1, 8, "#4d493a");
    poly(
      [
        [x - 7, 23],
        [x - 3, 16],
        [x + 4, 16],
        [x + 9, 23],
      ],
      "#60705a",
    );
    rect(x - 5, 23, 11, 2, "#e8cd87");
  }
  for (let i = 0; i < 3; i++) {
    rect(420 + i * 16, 40, 14, 23, "#725a41");
    rect(422 + i * 16, 42, 10, 19, "#eee1ba");
    oval(427 + i * 16, 50, 3, 4, ["#a47655", "#7d936b", "#c39a5c"][i]);
  }
  pot(404, 89, 1.2);
  pot(578, 96, 1.23);
  pot(9, 124, 0.9);
  if (room?.stage) {
    avatar(...stageSpot, room.stage.who);
    personLabel(310, 67, room.stage.who);
  }
  function chair(x, y, i) {
    rect(x - 6, y + 1, 3, 9, "#765a42");
    rect(x + 4, y + 1, 3, 9, "#765a42");
    oval(x, y + 3, 8, 4, "#9a7955");
    rect(x - 8, y - 5, 16, 6, "#826344");
    rect(x - 7, y - 6, 14, 5, "#bf9564");
    rect(x - 8, y - 9, 16, 4, "#97724d");
    const id = room?.seats[i];
    if (id) avatar(x, y + 1, id);
  }
  for (let t = 0; t < 10; t++) {
    const x = 60 + 120 * (t % 5),
      y = 176 + 99 * Math.floor(t / 5);
    oval(x + 3, y + 9, 37, 15, "#bea174");
    for (let j of [0, 1]) chair(...seats[t * 5 + j], t * 5 + j);
    rect(x - 12, y + 1, 4, 14, "#866345");
    rect(x + 9, y + 1, 4, 14, "#866345");
    oval(x, y + 2, 24, 12, "#896448");
    oval(x, y - 1, 24, 11, "#b98957");
    oval(x, y - 3, 22, 9, "#cfaa75");
    if (t % 3 === 0) pot(x + 2, y - 3, 0.37);
    else if (t % 3 === 1) {
      cup(x - 6, y - 6);
      cup(x + 5, y - 2);
    } else {
      rect(x - 4, y - 6, 9, 5, "#73806a");
      rect(x - 3, y - 6, 1, 5, "#ded8b6");
      cup(x + 6, y - 7);
    }
    for (let j of [4, 2, 3]) chair(...seats[t * 5 + j], t * 5 + j);
  }
  for (let i = 0; i < 50; i++)
    if (room?.seats[i])
      personLabel(seats[i][0], seats[i][1] - 22, room.seats[i]);
  for (const x of [3, 596]) {
    rect(x - 2, 112, 5, 242, "#8d7153");
  }
  pot(18, 328, 1);
  pot(578, 325, 0.9);
  rect(241, 324, 119, 19, "#a26849");
  rect(244, 326, 113, 15, "#bf895f");
  label(zh ? "入 口" : "ENTRANCE", 301, 337, "#634c39", 8);
  rect(0, 352, W, 6, "#8b7359");
  for (const { who, x, y } of doorway) {
    avatar(x, y, who);
    personLabel(x, y - 22, who);
  }
}
