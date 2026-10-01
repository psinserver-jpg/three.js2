import * as THREE from 'three';

/* =====================================================================
 *  유틸 / 전역 상태
 * ===================================================================== */
const $ = (s, r = document) => r.querySelector(s);
const rnd = n => Math.floor(Math.random() * n);
const fmt = n => Math.round(n).toLocaleString('ko-KR');
const short = n => n >= 10000 ? (n / 1000).toFixed(0) + 'k' : n >= 1000 ? (n / 1000).toFixed(n % 1000 ? 1 : 0) + 'k' : String(n);
const easeIO = t => t < .5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
const easeOut = t => 1 - Math.pow(1 - t, 3);
const sleep = ms => new Promise(r => setTimeout(r, ms));
const START = 1000;
const CHIPS = [[10, '#2f7fe0'], [50, '#d6362f'], [100, '#222'], [500, '#8a3fd0'], [1000, '#e6a800']];

const state = { bal: START, chip: 50, sound: true, game: null };
try { const s = JSON.parse(localStorage.getItem('casino3d')); if (s && typeof s.bal === 'number' && s.bal >= 0) state.bal = s.bal; } catch {}
const save = () => { try { localStorage.setItem('casino3d', JSON.stringify({ bal: state.bal })); } catch {} };
const addBal = n => { state.bal += n; save(); };
let shownBal = state.bal;

/* ---------- 사운드 ---------- */
let AC;
function tone(f, d = .12, type = 'sine', v = .07, delay = 0) {
  if (!state.sound) return;
  try {
    AC = AC || new (window.AudioContext || window.webkitAudioContext)();
    const o = AC.createOscillator(), g = AC.createGain(), t = AC.currentTime + delay;
    o.type = type; o.frequency.value = f;
    g.gain.setValueAtTime(v, t); g.gain.exponentialRampToValueAtTime(.001, t + d);
    o.connect(g); g.connect(AC.destination); o.start(t); o.stop(t + d + .02);
  } catch {}
}
const sfx = {
  chip: () => tone(900, .05, 'square', .035),
  card: () => tone(320, .07, 'triangle', .07),
  tick: () => tone(1300, .02, 'square', .025),
  clunk: () => tone(140, .12, 'square', .06),
  win: () => [523, 659, 784, 1047].forEach((f, i) => tone(f, .25, 'triangle', .08, i * .09)),
  jack: () => [523, 659, 784, 1047, 1318, 1568, 2093].forEach((f, i) => tone(f, .3, 'triangle', .08, i * .08)),
  lose: () => { tone(220, .3, 'sawtooth', .04); tone(165, .4, 'sawtooth', .04, .15); },
};

/* ---------- 토스트 / 플래시 ---------- */
function toast(msg, cls = '') {
  const t = $('#toast'); t.textContent = msg; t.className = 'show ' + cls;
  clearTimeout(toast.h); toast.h = setTimeout(() => t.className = '', 2800);
}
function flash(text) {
  const f = $('#flash'); f.textContent = text; f.classList.remove('go'); void f.offsetWidth; f.classList.add('go');
}
/** 라운드 정산: ret = 돌려받는 총액, bet = 걸었던 총액 */
function settle(ret, bet, msg, where) {
  ret = Math.floor(ret);
  if (ret > 0) addBal(ret);
  const net = ret - bet;
  if (net > 0) {
    (net >= bet * 9 && net >= 500 ? sfx.jack : sfx.win)();
    toast(`${msg}  +${fmt(net)}`, 'win'); flash('+' + fmt(net));
    if (where) coinBurst(where, Math.min(70, 15 + Math.floor(net / bet * 6)));
  } else if (net < 0) { sfx.lose(); toast(`${msg}  -${fmt(-net)}`, 'bad'); }
  else toast(`${msg} (본전)`);
  return net;
}

/* =====================================================================
 *  three.js 기본 세팅
 * ===================================================================== */
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.15;
document.body.prepend(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x0a0612);
scene.fog = new THREE.Fog(0x0a0612, 28, 75);
const camera = new THREE.PerspectiveCamera(55, innerWidth / innerHeight, .1, 200);
camera.position.set(0, 4, 0);

addEventListener('resize', () => {
  renderer.setSize(innerWidth, innerHeight);
  camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix();
});

const mat = (color, rough = .7, metal = 0, emissive = 0x000000, ei = 1) =>
  new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: metal, emissive, emissiveIntensity: ei });
const box = (p, w, h, d, x, y, z, m) => { const o = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m); o.position.set(x, y, z); p.add(o); return o; };
const V = (x, y, z) => new THREE.Vector3(x, y, z);

function canvasTex(w, h, draw) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const g = c.getContext('2d'); draw(g, w, h);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; t.userCanvas = c; return t;
}
const EMOJI = '"Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif';
const FONT = '"Pretendard","Noto Sans KR","Malgun Gothic",sans-serif';

function labelSprite(text, sub, color = '#ffd24a') {
  const t = canvasTex(512, 160, (g, w, h) => {
    g.textAlign = 'center'; g.font = `900 70px ${FONT}`; g.shadowColor = color; g.shadowBlur = 22; g.fillStyle = color;
    g.fillText(text, w / 2, 80); g.shadowBlur = 0; g.font = `600 30px ${FONT}`; g.fillStyle = '#fff'; g.fillText(sub, w / 2, 130);
  });
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, transparent: true, depthWrite: false, fog: false }));
  s.scale.set(7, 2.2, 1); return s;
}
function flatLabel(text, w, h, color = '#ffffffcc', size = 64) {
  const t = canvasTex(512, Math.round(512 * h / w), (g, cw, ch) => {
    g.textAlign = 'center'; g.textBaseline = 'middle'; g.font = `800 ${size}px ${FONT}`; g.fillStyle = color; g.fillText(text, cw / 2, ch / 2);
  });
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ map: t, transparent: true, depthWrite: false }));
  m.rotation.x = -Math.PI / 2; return m;
}

/* ---------- 트윈 ---------- */
const tweens = [];
function tween(dur, fn, ease = easeIO) {
  return new Promise(res => tweens.push({ t: 0, dur, fn, ease, res }));
}
function updateTweens(dt) {
  for (let i = tweens.length - 1; i >= 0; i--) {
    const w = tweens[i]; w.t += dt;
    const k = Math.min(1, w.t / w.dur); w.fn(w.ease(k));
    if (k >= 1) { tweens.splice(i, 1); w.res(); }
  }
}

/* ---------- 파티클(코인) ---------- */
const fx = new THREE.Group(); scene.add(fx);
const coinGeo = new THREE.CylinderGeometry(.14, .14, .035, 14);
const coinMat = mat(0xffcc33, .25, .9, 0x553300);
const coins = [];
function coinBurst(pos, n = 30) {
  for (let i = 0; i < n; i++) {
    const m = new THREE.Mesh(coinGeo, coinMat);
    m.position.copy(pos).add(V((Math.random() - .5) * 1.5, 0, (Math.random() - .5) * 1.5));
    m.userData.v = V((Math.random() - .5) * 4, 5 + Math.random() * 5, (Math.random() - .5) * 4);
    m.userData.s = V(Math.random() * 12, Math.random() * 12, Math.random() * 12);
    fx.add(m); coins.push(m);
  }
}
function updateCoins(dt) {
  for (let i = coins.length - 1; i >= 0; i--) {
    const c = coins[i], v = c.userData.v;
    v.y -= 14 * dt; c.position.addScaledVector(v, dt);
    c.rotation.x += c.userData.s.x * dt; c.rotation.z += c.userData.s.z * dt;
    if (c.position.y < 0) { fx.remove(c); coins.splice(i, 1); }
  }
}

/* =====================================================================
 *  카지노 홀 (바닥/천장/조명)
 * ===================================================================== */
const R = 18, NG = 6;
(function buildHall() {
  const carpet = canvasTex(256, 256, (g, w, h) => {
    g.fillStyle = '#4a0b1c'; g.fillRect(0, 0, w, h);
    g.strokeStyle = '#d4a63a55'; g.lineWidth = 3;
    for (let i = 0; i < 2; i++) for (let j = 0; j < 2; j++) {
      const cx = i * w / 2 + w / 4, cy = j * h / 2 + h / 4;
      g.beginPath(); g.moveTo(cx, cy - 55); g.lineTo(cx + 55, cy); g.lineTo(cx, cy + 55); g.lineTo(cx - 55, cy); g.closePath(); g.stroke();
      g.beginPath(); g.arc(cx, cy, 14, 0, 7); g.stroke();
    }
  });
  carpet.wrapS = carpet.wrapT = THREE.RepeatWrapping; carpet.repeat.set(14, 14);
  const floor = new THREE.Mesh(new THREE.CircleGeometry(34, 64), new THREE.MeshStandardMaterial({ map: carpet, roughness: .95 }));
  floor.rotation.x = -Math.PI / 2; scene.add(floor);
  // 바닥 중앙 엠블럼
  const em = new THREE.Mesh(new THREE.RingGeometry(R - 7.5, R - 7, 80), new THREE.MeshBasicMaterial({ color: 0xffc83d }));
  em.rotation.x = -Math.PI / 2; em.position.y = .02; scene.add(em);

  // 원통 벽
  const wall = new THREE.Mesh(new THREE.CylinderGeometry(34, 34, 14, 64, 1, true),
    mat(0x24102e, .8, .1)); wall.material.side = THREE.BackSide; wall.position.y = 7; scene.add(wall);
  const ceil = new THREE.Mesh(new THREE.CircleGeometry(34, 48), mat(0x0e0716)); ceil.rotation.x = Math.PI / 2; ceil.position.y = 14; scene.add(ceil);

  // 기둥 + 네온
  for (let i = 0; i < NG; i++) {
    const a = (i + .5) * Math.PI * 2 / NG;
    const col = new THREE.Mesh(new THREE.CylinderGeometry(.7, .8, 13, 20), mat(0x3a2358, .4, .6));
    col.position.set(Math.sin(a) * 27, 6.5, Math.cos(a) * 27); scene.add(col);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(.85, .06, 8, 24), new THREE.MeshBasicMaterial({ color: i % 2 ? 0xff3d8b : 0x38d6ff }));
    ring.rotation.x = Math.PI / 2; ring.position.set(Math.sin(a) * 27, 3, Math.cos(a) * 27); scene.add(ring);
  }
  // 천장 네온 링
  scene.userData.neon = [];
  [[10, 0xff3d8b], [17, 0x38d6ff], [24, 0xffc83d], [31, 0xa04dff]].forEach(([r, c]) => {
    const m = new THREE.Mesh(new THREE.TorusGeometry(r, .12, 8, 90), new THREE.MeshBasicMaterial({ color: c }));
    m.rotation.x = Math.PI / 2; m.position.y = 13.4; scene.add(m); scene.userData.neon.push(m);
  });
  // 반짝이 별
  const pts = []; for (let i = 0; i < 300; i++) pts.push((Math.random() - .5) * 60, 8 + Math.random() * 5.5, (Math.random() - .5) * 60);
  const sg = new THREE.BufferGeometry(); sg.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
  scene.add(new THREE.Points(sg, new THREE.PointsMaterial({ color: 0xffeeaa, size: .12, fog: false })));

  scene.add(new THREE.AmbientLight(0x8a6aa8, .9));
  scene.add(new THREE.HemisphereLight(0xffe0b0, 0x201030, .6));
})();

/* =====================================================================
 *  공용 3D 부품: 테이블, 카드, 칩 스택, 주사위 …
 * ===================================================================== */
function makeStation(i, id, name, sub) {
  const a = i * Math.PI * 2 / NG;
  const G = new THREE.Group();
  G.position.set(Math.sin(a) * R, 0, Math.cos(a) * R);
  G.lookAt(0, 0, 0);
  scene.add(G);
  G.userData.gameId = id;
  const sp = new THREE.SpotLight(0xfff0d0, 420, 0, .75, .7, 2);
  sp.position.set(0, 11, 3); sp.target.position.set(0, 1, 0); G.add(sp, sp.target);
  const lb = labelSprite(name, sub); lb.position.set(0, 8.2, 0); G.add(lb);
  return G;
}
function viewOf(G, p, l) { G.updateMatrixWorld(true); return { pos: G.localToWorld(V(...p)), look: G.localToWorld(V(...l)) }; }

function pedestalTable(G, w, d, felt = 0x0b6b3a) {
  box(G, w, .2, d, 0, 1.0, 0, mat(felt, .95));
  const wood = mat(0x4a2a14, .5, .2);
  box(G, w + .5, .3, .3, 0, 1.05, d / 2 + .1, wood); box(G, w + .5, .3, .3, 0, 1.05, -d / 2 - .1, wood);
  box(G, .3, .3, d + .5, w / 2 + .1, 1.05, 0, wood); box(G, .3, .3, d + .5, -w / 2 - .1, 1.05, 0, wood);
  box(G, w - 1, .9, d - 1, 0, .45, 0, mat(0x2a160a, .6));
  box(G, w + .6, .06, d + .6, 0, .03, 0, mat(0xffc83d, .3, .9));
}

/* ---------- 카드 ---------- */
const RANKS = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];
const SUITS = ['♠', '♥', '♦', '♣'];
const cardGeo = new THREE.BoxGeometry(1, 1.4, .02);
const edgeMat = mat(0xeeeeee, .6);
const backMat = new THREE.MeshStandardMaterial({
  roughness: .5,
  map: canvasTex(256, 358, (g, w, h) => {
    g.fillStyle = '#fff'; g.fillRect(0, 0, w, h); g.fillStyle = '#a3122b'; g.fillRect(14, 14, w - 28, h - 28);
    g.strokeStyle = '#ffd24a'; g.lineWidth = 4; g.strokeRect(24, 24, w - 48, h - 48);
    g.strokeStyle = '#ffffff66'; g.lineWidth = 2;
    for (let i = -h; i < w + h; i += 22) { g.beginPath(); g.moveTo(i, 24); g.lineTo(i + h, h - 24); g.stroke(); g.beginPath(); g.moveTo(i + h, 24); g.lineTo(i, h - 24); g.stroke(); }
    g.fillStyle = '#a3122b'; g.fillRect(w / 2 - 36, h / 2 - 36, 72, 72); g.fillStyle = '#ffd24a'; g.font = `900 52px ${FONT}`; g.textAlign = 'center'; g.fillText('♠', w / 2, h / 2 + 18);
  })
});
const faceCache = {};
function faceMat(r, s) {
  const k = r + s; if (faceCache[k]) return faceCache[k];
  const red = s === '♥' || s === '♦';
  return faceCache[k] = new THREE.MeshStandardMaterial({
    roughness: .5, map: canvasTex(256, 358, (g, w, h) => {
      g.fillStyle = '#fbfbf6'; g.fillRect(0, 0, w, h); g.strokeStyle = '#bbb'; g.lineWidth = 4; g.strokeRect(2, 2, w - 4, h - 4);
      g.fillStyle = red ? '#c8102e' : '#15151a'; g.textAlign = 'center';
      g.font = `800 ${r === '10' ? 50 : 58}px ${FONT}`; g.fillText(r, 38, 66); g.font = `700 46px ${FONT}`; g.fillText(s, 38, 116);
      g.save(); g.translate(w, h); g.rotate(Math.PI); g.font = `800 ${r === '10' ? 50 : 58}px ${FONT}`; g.fillText(r, 38, 66); g.font = `700 46px ${FONT}`; g.fillText(s, 38, 116); g.restore();
      g.font = `700 130px ${FONT}`; g.fillText(s, w / 2, h / 2 + 46);
      if ('JQK'.includes(r)) { g.font = `900 40px ${FONT}`; g.fillText(r === 'J' ? '♝' : r === 'Q' ? '♛' : '♚', w / 2, h / 2 - 66); }
    })
  });
}
function makeCard(c) {
  const m = new THREE.Mesh(cardGeo, [edgeMat, edgeMat, edgeMat, edgeMat, faceMat(c.r, c.s), backMat]);
  m.position.set(0, 3, 0); m.rotation.x = Math.PI / 2; m.userData.card = c; return m;
}
const FACE_UP = -Math.PI / 2, FACE_DN = Math.PI / 2;
function moveCard(c, pos, rx, dur = .45, rz = 0) {
  const p0 = c.position.clone(), r0 = c.rotation.x, z0 = c.rotation.z;
  sfx.card();
  return tween(dur, k => {
    c.position.lerpVectors(p0, pos, k); c.position.y += Math.sin(k * Math.PI) * .6;
    c.rotation.x = r0 + (rx - r0) * k; c.rotation.z = z0 + (rz - z0) * k;
  });
}
function flipCard(c, dur = .4) {
  const y0 = c.position.y; sfx.card();
  return tween(dur, k => { c.rotation.x = FACE_DN + (FACE_UP - FACE_DN) * k; c.position.y = y0 + Math.sin(k * Math.PI) * .7; });
}
function newDeck(n = 1) {
  const s = []; for (let d = 0; d < n; d++) for (const r of RANKS) for (const su of SUITS) s.push({ r, s: su });
  for (let i = s.length - 1; i > 0; i--) { const j = rnd(i + 1);[s[i], s[j]] = [s[j], s[i]]; }
  return s;
}
function shoeMesh(G, x, z) {
  const m = box(G, 1.3, .7, 1.8, x, 1.45, z, mat(0x1a1a1a, .3, .6)); m.rotation.y = .25;
  box(G, 1.05, .3, 1.4, x, 1.85, z, backMat).rotation.y = .25;
}

/* ---------- 칩 스택 ---------- */
const chipGeo = new THREE.CylinderGeometry(.24, .24, .06, 24);
const chipMats = Object.fromEntries(CHIPS.map(([v, c]) => [v, mat(new THREE.Color(c), .35, .2)]));
function chipStack(G, x, z) {
  const g = new THREE.Group(); g.position.set(x, 1.1, z); G.add(g);
  return {
    set(amount) {
      g.clear(); let a = amount, n = 0;
      for (const v of [1000, 500, 100, 50, 10]) while (a >= v && n < 16) {
        const m = new THREE.Mesh(chipGeo, chipMats[v]); m.position.set((Math.random() - .5) * .03, .03 + n * .065, (Math.random() - .5) * .03); g.add(m); a -= v; n++;
      }
    }
  };
}

/* ---------- 주사위 ---------- */
const PIPS = { 1: [[.5, .5]], 2: [[.25, .25], [.75, .75]], 3: [[.25, .25], [.5, .5], [.75, .75]], 4: [[.25, .25], [.75, .25], [.25, .75], [.75, .75]], 5: [[.25, .25], [.75, .25], [.5, .5], [.25, .75], [.75, .75]], 6: [[.25, .22], [.75, .22], [.25, .5], [.75, .5], [.25, .78], [.75, .78]] };
const dieMats = [3, 4, 1, 6, 2, 5].map(v => new THREE.MeshStandardMaterial({
  roughness: .35, map: canvasTex(128, 128, (g, w, h) => {
    g.fillStyle = '#f8f4ea'; g.fillRect(0, 0, w, h); g.strokeStyle = '#ccc'; g.lineWidth = 6; g.strokeRect(0, 0, w, h);
    g.fillStyle = v === 1 ? '#d11' : '#111';
    for (const [x, y] of PIPS[v]) { g.beginPath(); g.arc(x * w, y * h, v === 1 ? 17 : 11, 0, 7); g.fill(); }
  })
}));
const FACE_Q = {
  1: new THREE.Quaternion(),
  6: new THREE.Quaternion().setFromAxisAngle(V(1, 0, 0), Math.PI),
  3: new THREE.Quaternion().setFromAxisAngle(V(0, 0, 1), Math.PI / 2),
  4: new THREE.Quaternion().setFromAxisAngle(V(0, 0, 1), -Math.PI / 2),
  2: new THREE.Quaternion().setFromAxisAngle(V(1, 0, 0), -Math.PI / 2),
  5: new THREE.Quaternion().setFromAxisAngle(V(1, 0, 0), Math.PI / 2),
};

/* =====================================================================
 *  베팅 헬퍼(여러 칸에 칩을 놓는 게임용)
 * ===================================================================== */
class Bets {
  constructor(onChange) { this.m = {}; this.stack = []; this.last = null; this.locked = false; this.onChange = onChange; }
  get total() { return Object.values(this.m).reduce((a, b) => a + b, 0); }
  add(k) {
    if (this.locked) return false;
    if (state.bal < state.chip) { toast('칩이 부족합니다', 'bad'); return false; }
    addBal(-state.chip); this.m[k] = (this.m[k] || 0) + state.chip; this.stack.push([k, state.chip]); sfx.chip(); this.onChange(); return true;
  }
  undo() {
    if (this.locked) return; const s = this.stack.pop(); if (!s) return;
    addBal(s[1]); this.m[s[0]] -= s[1]; if (!this.m[s[0]]) delete this.m[s[0]]; this.onChange();
  }
  clear() { if (this.locked) return; addBal(this.total); this.m = {}; this.stack = []; this.onChange(); }
  rebet() {
    if (this.locked || !this.last) return;
    const need = Object.values(this.last).reduce((a, b) => a + b, 0);
    this.clear();
    if (need > state.bal) return toast('이전 베팅을 반복하기엔 칩이 부족합니다', 'bad');
    addBal(-need); this.m = { ...this.last }; this.stack = Object.entries(this.last).map(([k, v]) => [k, v]); this.onChange();
  }
  begin() { this.last = { ...this.m }; this.locked = true; this.onChange(); }
  end() { this.m = {}; this.stack = []; this.locked = false; this.onChange(); }
  paint(panel) {
    panel.querySelectorAll('[data-k]').forEach(el => {
      const b = el.querySelector('.bd'); if (!b) return; const v = this.m[el.dataset.k];
      b.textContent = v ? short(v) : ''; b.classList.toggle('on', !!v);
    });
    const t = panel.querySelector('#tot'); if (t) t.textContent = fmt(this.total);
  }
}
const spot = (k, label, cls = '', style = '') => `<button class="spot ${cls}" data-act="spot" data-k="${k}" style="${style}">${label}<i class="bd"></i></button>`;
const betBtns = () => `<button data-act="undo">↶ 취소</button><button data-act="clear">모두 지우기</button><button data-act="rebet">↻ 이전 베팅</button>`;
const adjBet = (cur, act) => act === 'minus' ? Math.max(0, cur - state.chip) : act === 'plus' ? Math.min(cur + state.chip, state.bal) : act === 'max' ? state.bal : cur;
const singleBetRow = id => `<button data-act="minus">−</button><span class="val">베팅 <span id="${id}">0</span></span><button data-act="plus">＋</button><button data-act="max">MAX</button>`;

/* =====================================================================
 *  1) 슬롯머신
 * ===================================================================== */
function makeSlots(G) {
  const red = mat(0xb01030, .35, .4), dark = mat(0x1a1020, .6, .3), gold = mat(0xffc83d, .25, .95);
  box(G, 3.6, 2.1, 2.2, 0, 1.05, 0, red);                       // 아래 몸통
  box(G, 3.6, 1.9, 2.2, 0, 4.05, 0, red);                       // 위 몸통
  box(G, 3.6, 5, .1, 0, 2.5, -1.1, dark);                       // 뒷벽
  box(G, .25, 5, 2.2, 1.775, 2.5, 0, red); box(G, .25, 5, 2.2, -1.775, 2.5, 0, red);
  box(G, 3.8, .12, 2.4, 0, 2.1, .05, gold); box(G, 3.8, .12, 2.4, 0, 3.1, .05, gold);
  box(G, 3.6, .15, 2.4, 0, 5.05, 0, gold);
  box(G, 3.2, .4, 1.4, 0, 1.75, 1.2, dark).rotation.x = -.35;    // 콘솔
  box(G, 3.9, .15, 2.6, 0, .08, 0, gold);
  const line = box(G, 3.0, .03, .05, 0, 2.6, 1.0, new THREE.MeshBasicMaterial({ color: 0xff2040 }));
  const sign = new THREE.Mesh(new THREE.PlaneGeometry(3.2, 1.2), new THREE.MeshBasicMaterial({
    map: canvasTex(512, 192, (g, w, h) => {
      const gr = g.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, '#fff2a0'); gr.addColorStop(1, '#ff9d00');
      g.fillStyle = '#240812'; g.fillRect(0, 0, w, h); g.fillStyle = gr; g.textAlign = 'center'; g.font = `900 110px ${FONT}`; g.fillText('LUCKY', w / 2, 100);
      g.font = `900 64px ${FONT}`; g.fillStyle = '#ff4d6d'; g.fillText('S L O T S', w / 2, 170);
    })
  }));
  sign.position.set(0, 4.2, 1.12); G.add(sign);

  // 전구
  const bulbs = [];
  for (let i = 0; i < 14; i++) {
    const b = new THREE.Mesh(new THREE.SphereGeometry(.08, 8, 8), new THREE.MeshBasicMaterial({ color: 0xffeeaa }));
    const t = i / 13; b.position.set(-1.6 + 3.2 * t, 4.95, 1.15); G.add(b); bulbs.push(b);
  }
  for (let i = 0; i < 5; i++) {
    for (const sx of [-1, 1]) { const b = new THREE.Mesh(new THREE.SphereGeometry(.08, 8, 8), new THREE.MeshBasicMaterial({ color: 0xffeeaa })); b.position.set(sx * 1.65, 3.4 + i * .35, 1.15); G.add(b); bulbs.push(b); }
  }
  // 레버
  const lever = new THREE.Group(); lever.position.set(2.0, 2.2, 0); G.add(lever);
  const rod = new THREE.Mesh(new THREE.CylinderGeometry(.06, .06, 1.6, 10), mat(0xcccccc, .2, 1)); rod.position.y = .8; lever.add(rod);
  const knob = new THREE.Mesh(new THREE.SphereGeometry(.22, 16, 16), mat(0xe0102a, .2, .3)); knob.position.y = 1.65; lever.add(knob);
  box(G, .25, .5, .4, 1.9, 2.1, 0, gold);

  // 릴
  const SYM = ['🍒', '🍋', '🔔', '⭐', '7', '💎'];
  const STRIP = [0, 1, 2, 3, 0, 4, 1, 5], N = STRIP.length;
  const symMat = SYM.map((s, i) => new THREE.MeshStandardMaterial({
    roughness: .35, emissive: 0x332a20, map: canvasTex(128, 128, (g, w, h) => {
      const gr = g.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, '#fffdf2'); gr.addColorStop(1, '#e6dcc0'); g.fillStyle = gr; g.fillRect(0, 0, w, h);
      g.textAlign = 'center'; g.textBaseline = 'middle';
      if (s === '7') { g.font = `900 112px ${FONT}`; g.lineWidth = 8; g.strokeStyle = '#7a0010'; g.strokeText('7', w / 2, h / 2 + 6); g.fillStyle = '#ff2038'; g.fillText('7', w / 2, h / 2 + 6); }
      else { g.font = `88px ${EMOJI}`; g.fillText(s, w / 2, h / 2 + 6); }
    })
  }));
  const reels = [];
  for (let i = 0; i < 3; i++) {
    const g = new THREE.Group(); g.position.set((i - 1) * 1.02, 2.6, 0); G.add(g);
    for (let j = 0; j < N; j++) {
      const a = j * Math.PI * 2 / N;
      const p = new THREE.Mesh(new THREE.PlaneGeometry(.94, .84), symMat[STRIP[j]]);
      p.position.set(0, .96 * Math.sin(a), .96 * Math.cos(a)); p.rotation.x = -a; g.add(p);
    }
    const core = new THREE.Mesh(new THREE.CylinderGeometry(.9, .9, .96, 24), dark); core.rotation.z = Math.PI / 2; g.add(core);
    reels.push(g);
  }
  const rl = new THREE.PointLight(0xffffff, 14, 8); rl.position.set(0, 2.6, 2.4); G.add(rl);

  let bet = 10, busy = false, panel, winFlash = 0;
  const view = viewOf(G, [0, 3.9, 8.6], [0, 1.9, 0]);

  const pay = [[0, 5], [1, 8], [2, 15], [3, 25], [4, 50], [5, 100]];
  function evaluate(idx) {
    const s = idx.map(i => STRIP[i]);
    if (s[0] === s[1] && s[1] === s[2]) { const p = pay.find(x => x[0] === s[0]); return [p[1], `${SYM[s[0]]} 트리플! x${p[1]}`]; }
    if (s.filter(x => x === 0).length === 2) return [2, '🍒 체리 2개 x2'];
    return [0, '꽝!'];
  }
  async function spin() {
    if (busy) return;
    if (bet < 10) return toast('최소 베팅은 10입니다', 'bad');
    if (bet > state.bal) return toast('칩이 부족합니다', 'bad');
    busy = true; addBal(-bet); const wagered = bet; sync();
    const idx = [rnd(N), rnd(N), rnd(N)];
    // 레버
    tween(.5, k => lever.rotation.x = Math.sin(k * Math.PI) * .9);
    const tk = setInterval(sfx.tick, 70);
    await Promise.all(reels.map((r, i) => {
      const cur = r.rotation.x;
      const target = Math.ceil(cur / (2 * Math.PI)) * 2 * Math.PI + 2 * Math.PI * (3 + i * 2) + idx[i] * 2 * Math.PI / N;
      return tween(2 + i * .7, k => r.rotation.x = cur + (target - cur) * k, easeOut).then(() => { sfx.clunk(); if (i === 2) clearInterval(tk); });
    }));
    clearInterval(tk);
    const [mul, msg] = evaluate(idx);
    const net = settle(wagered * mul, wagered, msg, G.localToWorld(V(0, 3, 2)));
    if (net > 0) winFlash = 2.5;
    busy = false; if (bet > state.bal) bet = state.bal; sync();
  }
  function sync() {
    if (!panel) return;
    $('#sBet', panel).textContent = fmt(bet);
    panel.querySelectorAll('button').forEach(b => { if (b.dataset.act) b.disabled = busy; });
  }
  return {
    id: 'slots', name: '슬롯머신', icon: '🎰', desc: '3릴 · 최대 x100', view, group: G,
    html: () => `<div class="title"><b>🎰 슬롯머신</b><span class="info">같은 그림 3개를 맞추세요</span></div>
      <div class="row">${singleBetRow('sBet')}<button class="primary" data-act="spin" style="min-width:130px;font-size:18px">SPIN</button></div>
      <div class="pay">🍒🍒🍒 x5 · 🍋🍋🍋 x8 · 🔔🔔🔔 x15 · ⭐⭐⭐ x25 · <b style="color:#ff6677">777</b> x50 · 💎💎💎 x100 · 🍒 2개 x2</div>`,
    bind(p) { panel = p; sync(); },
    act(a) { if (a === 'spin') spin(); else { bet = adjBet(bet, a); sync(); sfx.chip(); } },
    pending: () => 0, busy: () => busy,
    update(dt, t) {
      winFlash = Math.max(0, winFlash - dt);
      bulbs.forEach((b, i) => b.material.color.setHex(winFlash > 0 ? ((Math.floor(t * 10) + i) % 2 ? 0xff3d8b : 0xffee66) : (busy ? ((Math.floor(t * 8) + i) % 3 ? 0x664400 : 0xffee66) : 0xffe9a0)));
      if (!busy) lever.rotation.x *= .9;
    },
  };
}

/* =====================================================================
 *  2) 블랙잭
 * ===================================================================== */
function makeBlackjack(G) {
  pedestalTable(G, 11, 5.5);
  box(G, 6, .02, 1.2, 0, 1.11, -.3, mat(0x0a5a30)); // 장식
  const dl = flatLabel('BLACKJACK PAYS 3 TO 2', 8, 1, '#ffd24acc', 38); dl.position.set(0, 1.115, -1.9); G.add(dl);
  const dl2 = flatLabel('딜러는 17에서 스탠드', 8, .7, '#ffffff99', 38); dl2.position.set(0, 1.115, -1.15); G.add(dl2);
  shoeMesh(G, 4.4, -1.6);
  const stack = chipStack(G, 0, 1.9);
  const ring = new THREE.Mesh(new THREE.RingGeometry(.45, .5, 32), new THREE.MeshBasicMaterial({ color: 0xffd24a })); ring.rotation.x = -Math.PI / 2; ring.position.set(0, 1.115, 1.9); G.add(ring);

  let shoe = newDeck(6), dealer = [], player = [], dm = [], pm = [], bet = 10, wagered = 0, phase = 'bet', busy = false, panel, hole;
  const SHOE = V(4.4, 2.2, -1.6);
  const val = h => { let t = 0, a = 0; for (const c of h) { if (c.r === 'A') { a++; t += 11; } else t += 'JQK'.includes(c.r) || c.r === '10' ? 10 : +c.r; } while (t > 21 && a) { t -= 10; a--; } return t; };
  const draw = () => { if (shoe.length < 40) { shoe = newDeck(6); toast('🔀 슈를 새로 섞었습니다'); } return shoe.pop(); };
  const posD = i => V(-.9 + i * .75, 1.13 + i * .012, -.9);
  const posP = i => V(-.9 + i * .75, 1.13 + i * .012, 1.0);
  async function give(hand, meshes, who, up) {
    const c = draw(); hand.push(c); const m = makeCard(c); m.position.copy(SHOE); G.add(m); meshes.push(m);
    await moveCard(m, who === 'd' ? posD(hand.length - 1) : posP(hand.length - 1), up ? FACE_UP : FACE_DN, .4, (Math.random() - .5) * .08);
    return m;
  }
  function clearTable() { [...dm, ...pm].forEach(m => G.remove(m)); dm = []; pm = []; dealer = []; player = []; }
  function info(hideHole) {
    const d = hideHole ? (dealer.length ? val([dealer[0]]) + ' + ?' : '-') : (dealer.length ? val(dealer) : '-');
    $('#bjI', panel).innerHTML = `<span class="dealerp">딜러 ${d} &nbsp;|&nbsp; 나 ${player.length ? val(player) : '-'}</span>`;
  }
  function sync() {
    if (!panel) return;
    $('#bjBet', panel).textContent = fmt(phase === 'bet' ? bet : wagered);
    const q = a => panel.querySelector(`[data-act=${a}]`);
    const inBet = phase === 'bet' && !busy, inPlay = phase === 'play' && !busy;
    ['minus', 'plus', 'max'].forEach(a => q(a).disabled = !inBet);
    q('deal').disabled = !inBet; q('hit').disabled = !inPlay; q('stand').disabled = !inPlay;
    q('double').disabled = !inPlay || player.length !== 2 || wagered > state.bal;
    stack.set(phase === 'bet' ? bet : wagered);
  }
  async function deal() {
    if (busy || phase !== 'bet') return;
    if (bet < 10) return toast('최소 베팅은 10입니다', 'bad');
    if (bet > state.bal) return toast('칩이 부족합니다', 'bad');
    busy = true; clearTable(); addBal(-bet); wagered = bet; phase = 'play'; sync();
    await give(player, pm, 'p', true); info(true);
    hole = null; await give(dealer, dm, 'd', true); info(true);
    await give(player, pm, 'p', true); info(true);
    hole = await give(dealer, dm, 'd', false);
    info(true);
    const pbj = val(player) === 21;
    const up = dealer[0].r, peek = up === 'A' || up === '10' || 'JQK'.includes(up);
    if (pbj || (peek && val(dealer) === 21)) {
      await flipCard(hole); info(false);
      if (pbj && val(dealer) !== 21) finish(wagered * 2.5, '블랙잭! 🎉');
      else if (pbj) finish(wagered, '둘 다 블랙잭 – 푸시');
      else finish(0, '딜러 블랙잭');
      return;
    }
    busy = false; sync();
  }
  async function hit() {
    if (busy || phase !== 'play') return; busy = true; sync();
    await give(player, pm, 'p', true); info(true);
    const v = val(player);
    if (v > 21) { await flipCard(hole); info(false); return finish(0, `버스트! (${v})`); }
    if (v === 21) return dealerPlay();
    busy = false; sync();
  }
  async function dealerPlay() {
    busy = true; sync();
    await flipCard(hole); info(false);
    while (val(dealer) < 17) { await give(dealer, dm, 'd', true); info(false); await sleep(200); }
    const d = val(dealer), p = val(player);
    if (d > 21) finish(wagered * 2, `딜러 버스트(${d})! 승리`);
    else if (p > d) finish(wagered * 2, `${p} vs ${d} 승리!`);
    else if (p === d) finish(wagered, `${p} vs ${d} 푸시`);
    else finish(0, `${p} vs ${d} 패배`);
  }
  async function dbl() {
    if (busy || phase !== 'play' || player.length !== 2 || wagered > state.bal) return;
    busy = true; addBal(-wagered); wagered *= 2; sync();
    await give(player, pm, 'p', true); info(true);
    if (val(player) > 21) { await flipCard(hole); info(false); return finish(0, `더블 버스트 (${val(player)})`); }
    dealerPlay();
  }
  function finish(ret, msg) {
    settle(ret, wagered, msg, G.localToWorld(V(0, 1.5, 0)));
    phase = 'bet'; busy = false; if (bet > state.bal) bet = Math.max(0, state.bal);
    sync(); stack.set(0);
  }
  const view = viewOf(G, [0, 5.6, 7.2], [0, .5, -.1]);
  return {
    id: 'blackjack', name: '블랙잭', icon: '🃏', desc: '21에 가깝게 · 블랙잭 3:2', view, group: G,
    html: () => `<div class="title"><b>🃏 블랙잭</b><span class="info" id="bjI"></span></div>
      <div class="row">${singleBetRow('bjBet')}<button class="primary" data-act="deal" style="min-width:90px">DEAL</button></div>
      <div class="row"><button data-act="hit">HIT 한장 더</button><button data-act="stand">STAND 멈추기</button><button data-act="double">DOUBLE 2배</button></div>
      <div class="pay">블랙잭 3:2 · 일반 승리 1:1 · 딜러는 16 이하면 히트, 17 이상이면 스탠드 · 6덱 슈</div>`,
    bind(p) { panel = p; info(true); sync(); },
    act(a) { if (a === 'deal') deal(); else if (a === 'hit') hit(); else if (a === 'stand') dealerPlay(); else if (a === 'double') dbl(); else { bet = adjBet(bet, a); sync(); sfx.chip(); } },
    pending: () => phase === 'play' ? wagered : 0, busy: () => busy || phase === 'play',
    update() { },
  };
}

/* =====================================================================
 *  3) 룰렛 (유러피언 싱글 제로)
 * ===================================================================== */
const ORDER = [0, 32, 15, 19, 4, 21, 2, 25, 17, 34, 6, 27, 13, 36, 11, 30, 8, 23, 10, 5, 24, 16, 33, 1, 20, 14, 31, 9, 22, 18, 29, 7, 28, 12, 35, 3, 26];
const REDS = new Set([1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36]);
const rouColor = n => n === 0 ? 'zero' : REDS.has(n) ? 'red' : 'black';
function rouMul(k, n) {
  if (k[0] === 'n') return +k.slice(1) === n ? 36 : 0;
  if (n === 0) return 0;
  switch (k) {
    case 'dz1': return n <= 12 ? 3 : 0; case 'dz2': return n > 12 && n <= 24 ? 3 : 0; case 'dz3': return n > 24 ? 3 : 0;
    case 'col1': return n % 3 === 1 ? 3 : 0; case 'col2': return n % 3 === 2 ? 3 : 0; case 'col3': return n % 3 === 0 ? 3 : 0;
    case 'low': return n <= 18 ? 2 : 0; case 'high': return n > 18 ? 2 : 0;
    case 'even': return n % 2 === 0 ? 2 : 0; case 'odd': return n % 2 === 1 ? 2 : 0;
    case 'red': return REDS.has(n) ? 2 : 0; case 'black': return !REDS.has(n) ? 2 : 0;
  }
  return 0;
}
function makeRoulette(G) {
  const wood = mat(0x5a2e14, .4, .3), gold = mat(0xffc83d, .25, .95);
  const cyl = new THREE.Mesh(new THREE.CylinderGeometry(4.2, 4.6, 1.0, 48), wood); cyl.position.y = .5; G.add(cyl);
  const rim = new THREE.Mesh(new THREE.TorusGeometry(3.95, .22, 12, 64), wood); rim.rotation.x = Math.PI / 2; rim.position.y = 1.1; G.add(rim);
  const track = new THREE.Mesh(new THREE.RingGeometry(2.95, 3.85, 64), mat(0x7a4820, .35, .3)); track.rotation.x = -Math.PI / 2; track.position.y = 1.075; G.add(track);
  const felt = new THREE.Mesh(new THREE.CylinderGeometry(4.5, 4.5, .1, 48), mat(0x0b6b3a)); felt.position.y = 1.0; G.add(felt);
  const wheel = new THREE.Group(); wheel.position.y = 1.08; G.add(wheel);
  const hub = new THREE.Mesh(new THREE.CylinderGeometry(2.0, 2.0, .08, 40), mat(0x1c1224, .4, .5)); hub.position.y = -.02; wheel.add(hub);
  const spin = new THREE.Group(); wheel.add(spin);
  const gr = new THREE.Mesh(new THREE.CylinderGeometry(2.0, 2.0, .1, 48, 1, true), gold); spin.add(gr);
  const pockets = [];
  const cm = { red: mat(0xc01028, .4, .1), black: mat(0x15131a, .4, .1), zero: mat(0x0c8a44, .4, .1) };
  ORDER.forEach((n, i) => {
    const a = i * Math.PI * 2 / 37;
    const g = new THREE.Group(); g.position.set(2.45 * Math.cos(a), 0, 2.45 * Math.sin(a)); g.rotation.y = -a; spin.add(g);
    g.add(new THREE.Mesh(new THREE.BoxGeometry(.9, .14, .38), cm[rouColor(n)]));
    const lab = new THREE.Mesh(new THREE.PlaneGeometry(.55, .3), new THREE.MeshBasicMaterial({
      transparent: true, map: canvasTex(128, 64, (c, w, h) => { c.fillStyle = '#fff'; c.font = `800 46px ${FONT}`; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText(n, w / 2, h / 2 + 2); })
    }));
    lab.position.y = .075; lab.rotation.set(-Math.PI / 2, 0, Math.PI / 2); g.add(lab);
    // 칸막이
    const fr = new THREE.Mesh(new THREE.BoxGeometry(.9, .2, .03), gold); fr.position.set(0, .03, .2); g.add(fr);
  });
  const cone = new THREE.Mesh(new THREE.ConeGeometry(.9, .8, 24), gold); cone.position.y = .4; wheel.add(cone);
  const knob = new THREE.Mesh(new THREE.SphereGeometry(.18, 12, 12), gold); knob.position.y = .9; wheel.add(knob);
  for (let i = 0; i < 4; i++) { const sp = new THREE.Mesh(new THREE.BoxGeometry(1.7, .06, .08), gold); sp.position.y = .55; sp.rotation.y = i * Math.PI / 4; spin.add(sp); }
  const ball = new THREE.Mesh(new THREE.SphereGeometry(.1, 16, 16), mat(0xffffff, .1, .1, 0x888888)); wheel.add(ball);
  const WSPD = .45; let W = 0, gam = 0, ballR = 2.45, ballY = .15, ballIdx = 0, ballFollow = true, busy = false, panel;
  const hist = []; const bets = new Bets(() => panel && bets.paint(panel));

  async function doSpin() {
    if (busy) return; if (!bets.total) return toast('칩을 먼저 놓아주세요', 'bad');
    busy = true; bets.begin(); sync();
    const n = rnd(37), idx = ORDER.indexOf(n), T = 7;
    const a = idx * Math.PI * 2 / 37, g0 = Math.random() * 6.28, W0 = W;
    const Wend = W0 + WSPD * T; let base = a - Wend, k = Math.ceil((g0 + 2 * Math.PI * 6 - base) / (2 * Math.PI)); const gEnd = base + k * 2 * Math.PI;
    ballFollow = false; let lastTick = 0;
    await tween(T, u => {
      W = W0 + WSPD * T * u; spin.rotation.y = W;
      const e = 1 - Math.pow(1 - u, 2.4); gam = g0 + (gEnd - g0) * e;
      const f = easeOut(Math.max(0, (u - .62) / .38));
      ballR = 3.4 - 0.95 * f; ballY = .16 + Math.abs(Math.sin((u - .7) * 22)) * (u > .7 ? (1 - u) * .8 : 0);
      ball.position.set(ballR * Math.cos(gam), ballY, ballR * Math.sin(gam));
      const tk = Math.floor(gam * 37 / (2 * Math.PI)); if (tk !== lastTick && u > .6) { sfx.tick(); } lastTick = tk;
    }, t => t);
    ballIdx = idx; ballFollow = true; sfx.clunk();
    hist.unshift(n); if (hist.length > 14) hist.pop(); drawHist();
    let ret = 0; for (const [key, amt] of Object.entries(bets.m)) ret += amt * rouMul(key, n);
    const total = bets.total;
    panel.querySelectorAll('[data-k]').forEach(el => { if (rouMul(el.dataset.k, n)) el.classList.add('hit'); });
    await sleep(300);
    settle(ret, total, `🎡 ${n} ${({ red: '빨강', black: '검정', zero: '초록' })[rouColor(n)]}`, G.localToWorld(V(0, 1.5, 0)));
    await sleep(1800);
    panel.querySelectorAll('.hit').forEach(el => el.classList.remove('hit'));
    bets.end(); busy = false; sync();
  }
  function drawHist() {
    const h = $('#rHist', panel); if (!h) return;
    const bg = { red: '#c01028', black: '#222', zero: '#0c8a44' };
    h.innerHTML = hist.map(n => `<i style="background:${bg[rouColor(n)]}">${n}</i>`).join('');
  }
  function sync() { if (!panel) return; panel.querySelectorAll('button').forEach(b => { if (b.dataset.act) b.disabled = busy; }); bets.paint(panel); }

  let grid = '';
  for (let n = 1; n <= 36; n++) grid += spot('n' + n, n, rouColor(n), `grid-row:${3 - (n - 1) % 3};grid-column:${Math.ceil(n / 3) + 1}`);
  grid += spot('n0', '0', 'zero', 'grid-row:1/4;grid-column:1');
  grid += spot('col3', '2:1', '', 'grid-row:1;grid-column:14') + spot('col2', '2:1', '', 'grid-row:2;grid-column:14') + spot('col1', '2:1', '', 'grid-row:3;grid-column:14');
  grid += spot('dz1', '1st 12', '', 'grid-row:4;grid-column:2/6') + spot('dz2', '2nd 12', '', 'grid-row:4;grid-column:6/10') + spot('dz3', '3rd 12', '', 'grid-row:4;grid-column:10/14');
  grid += spot('low', '1-18', '', 'grid-row:5;grid-column:2/4') + spot('even', '짝수', '', 'grid-row:5;grid-column:4/6') + spot('red', '◆ 빨강', 'red', 'grid-row:5;grid-column:6/8') +
    spot('black', '◆ 검정', 'black', 'grid-row:5;grid-column:8/10') + spot('odd', '홀수', '', 'grid-row:5;grid-column:10/12') + spot('high', '19-36', '', 'grid-row:5;grid-column:12/14');

  const view = viewOf(G, [0, 9.6, 7.6], [0, .6, 1.3]);
  return {
    id: 'roulette', name: '룰렛', icon: '🎡', desc: '유러피언 · 숫자 적중 36배', view, group: G,
    html: () => `<div class="title"><b>🎡 룰렛</b><span class="info">칩을 선택하고 칸을 눌러 베팅하세요 · 총 베팅 <b id="tot" style="color:var(--gold)">0</b></span></div>
      <div class="rgrid">${grid}</div>
      <div class="row"><button class="primary" data-act="spin" style="min-width:120px;font-size:17px">SPIN</button>${betBtns()}</div>
      <div class="hist" id="rHist"></div>
      <div class="pay">숫자 35:1 · 12개/열 2:1 · 홀짝/색/1-18/19-36 1:1 · 0이 나오면 숫자 베팅 외 모두 하우스 승리</div>`,
    bind(p) { panel = p; drawHist(); sync(); },
    act(a, el) { if (a === 'spin') doSpin(); else if (a === 'spot') bets.add(el.dataset.k); else if (a === 'undo') bets.undo(); else if (a === 'clear') bets.clear(); else if (a === 'rebet') bets.rebet(); },
    pending: () => busy ? 0 : bets.total, busy: () => busy,
    update(dt) {
      if (!busy) { W += WSPD * dt; spin.rotation.y = W; }
      if (ballFollow) { const a = ballIdx * Math.PI * 2 / 37 - W; ball.position.set(2.45 * Math.cos(a), .15, 2.45 * Math.sin(a)); }
    },
    clearBets() { bets.clear(); },
  };
}

/* =====================================================================
 *  4) 바카라
 * ===================================================================== */
function makeBaccarat(G) {
  pedestalTable(G, 12, 5.5, 0x0a5c4a);
  shoeMesh(G, 5.0, -1.7);
  const lp = flatLabel('PLAYER', 4, 1, '#6db8ff', 70), lb = flatLabel('BANKER', 4, 1, '#ff7b8e', 70), lt = flatLabel('TIE 8:1', 3, .8, '#7dffa8', 56);
  lp.position.set(-2.6, 1.115, .45); lb.position.set(2.6, 1.115, .45); lt.position.set(0, 1.115, .45); G.add(lp, lb, lt);
  const stacks = { P: chipStack(G, -2.6, 1.7), T: chipStack(G, 0, 1.7), B: chipStack(G, 2.6, 1.7) };
  const bets = new Bets(() => { if (!panel) return; bets.paint(panel); for (const k in stacks) stacks[k].set(bets.m[k] || 0); });
  const SHOE = V(5, 2.2, -1.7);
  let shoe = newDeck(8), meshes = [], busy = false, panel; const hist = [];
  const cv = c => c.r === 'A' ? 1 : c.r === '10' || 'JQK'.includes(c.r) ? 0 : +c.r;
  const tot = h => h.reduce((a, c) => a + cv(c), 0) % 10;
  const pos = (side, i) => V((side === 'P' ? -2.6 : 2.6) - 1.1 + i * 1.1, 1.13 + i * .01, -.75);
  async function put(hand, side) {
    if (shoe.length < 30) shoe = newDeck(8);
    const c = shoe.pop(); hand.push(c); const m = makeCard(c); m.position.copy(SHOE); G.add(m); meshes.push(m);
    await moveCard(m, pos(side, hand.length - 1), FACE_UP, .4); info(hand, side); return c;
  }
  const state2 = { P: [], B: [] };
  function info(h, side) { state2[side] = h; $('#bcI', panel).innerHTML = `<span class="dealerp"><span style="color:#6db8ff">PLAYER ${state2.P.length ? tot(state2.P) : '-'}</span> &nbsp;|&nbsp; <span style="color:#ff7b8e">BANKER ${state2.B.length ? tot(state2.B) : '-'}</span></span>`; }
  async function deal() {
    if (busy) return; if (!bets.total) return toast('칩을 먼저 놓아주세요', 'bad');
    busy = true; bets.begin(); sync(); meshes.forEach(m => G.remove(m)); meshes = []; state2.P = []; state2.B = [];
    const P = [], B = [];
    await put(P, 'P'); await put(B, 'B'); await put(P, 'P'); await put(B, 'B');
    let pv = tot(P), bv = tot(B);
    if (pv < 8 && bv < 8) {
      let p3 = null;
      if (pv <= 5) p3 = await put(P, 'P');
      bv = tot(B);
      let bd;
      if (p3 === null) bd = bv <= 5;
      else {
        const x = cv(p3);
        bd = bv <= 2 ? true : bv === 3 ? x !== 8 : bv === 4 ? x >= 2 && x <= 7 : bv === 5 ? x >= 4 && x <= 7 : bv === 6 ? x === 6 || x === 7 : false;
      }
      if (bd) await put(B, 'B');
    }
    pv = tot(P); bv = tot(B);
    const win = pv > bv ? 'P' : bv > pv ? 'B' : 'T';
    hist.unshift(win); if (hist.length > 18) hist.pop(); drawHist();
    let ret = 0; const tb = bets.total;
    for (const [k, amt] of Object.entries(bets.m)) {
      if (win === 'T') ret += k === 'T' ? amt * 9 : k === 'P' || k === 'B' ? amt : 0;
      else if (k === win) ret += k === 'P' ? amt * 2 : amt * 1.95;
    }
    panel.querySelectorAll('[data-k]').forEach(el => { if (el.dataset.k === win) el.classList.add('hit'); });
    await sleep(300);
    settle(ret, tb, `${win === 'P' ? 'PLAYER' : win === 'B' ? 'BANKER' : 'TIE'} 승! (${pv} : ${bv})`, G.localToWorld(V(0, 1.5, 0)));
    await sleep(1800);
    panel.querySelectorAll('.hit').forEach(el => el.classList.remove('hit'));
    bets.end(); busy = false; sync();
  }
  function drawHist() {
    const h = $('#bcH', panel); if (!h) return; const c = { P: '#2f7fe0', B: '#d6362f', T: '#1fb866' };
    h.innerHTML = hist.map(x => `<i style="background:${c[x]}">${x}</i>`).join('');
  }
  function sync() { if (!panel) return; panel.querySelectorAll('button').forEach(b => { if (b.dataset.act) b.disabled = busy; }); bets.paint(panel); }
  const view = viewOf(G, [0, 5.6, 7.2], [0, .6, -.2]);
  return {
    id: 'baccarat', name: '바카라', icon: '♦️', desc: '플레이어 · 뱅커 · 타이', view, group: G,
    html: () => `<div class="title"><b>♦️ 바카라</b><span class="info" id="bcI"></span></div>
      <div class="row" style="gap:14px">
        ${spot('P', 'PLAYER<br><small>1 : 1</small>', '', 'background:#1d4f9a;min-width:140px;padding:12px')}
        ${spot('T', 'TIE<br><small>8 : 1</small>', '', 'background:#127a48;min-width:110px;padding:12px')}
        ${spot('B', 'BANKER<br><small>0.95 : 1</small>', '', 'background:#a3202f;min-width:140px;padding:12px')}
      </div>
      <div class="row"><button class="primary" data-act="deal" style="min-width:120px;font-size:17px">DEAL</button>${betBtns()}<span class="info">총 베팅 <b id="tot" style="color:var(--gold)">0</b></span></div>
      <div class="hist" id="bcH"></div>
      <div class="pay">카드 합계 끝자리(9에 가까울수록 승) · A=1, 10/J/Q/K=0 · 타이 시 플레이어/뱅커 베팅은 반환 · 3번째 카드는 정식 룰 자동 적용</div>`,
    bind(p) { panel = p; drawHist(); sync(); for (const k in stacks) stacks[k].set(bets.m[k] || 0); info([], 'P'); },
    act(a, el) { if (a === 'deal') deal(); else if (a === 'spot') bets.add(el.dataset.k); else if (a === 'undo') bets.undo(); else if (a === 'clear') bets.clear(); else if (a === 'rebet') bets.rebet(); },
    pending: () => busy ? 0 : bets.total, busy: () => busy,
    update() { }, clearBets() { bets.clear(); },
  };
}

/* =====================================================================
 *  5) 비디오 포커 (Jacks or Better)
 * ===================================================================== */
const VP_PAY = [['RF', '로열 플러시', 800], ['SF', '스트레이트 플러시', 50], ['4K', '포카드', 25], ['FH', '풀하우스', 9], ['FL', '플러시', 6], ['ST', '스트레이트', 4], ['3K', '트리플', 3], ['2P', '투 페어', 2], ['JB', '잭 이상 원페어', 1]];
function vpEval(h) {
  const v = h.map(c => RANKS.indexOf(c.r) + 1).sort((a, b) => a - b);
  const fl = h.every(c => c.s === h[0].s);
  const cnt = {}; v.forEach(x => cnt[x] = (cnt[x] || 0) + 1);
  const g = Object.values(cnt).sort((a, b) => b - a);
  const uniq = new Set(v).size === 5;
  const wheelRoyal = uniq && v[0] === 1 && v[1] === 10 && v[4] === 13;
  const st = uniq && ((v[4] - v[0] === 4) || wheelRoyal);
  if (fl && wheelRoyal) return 'RF'; if (fl && st) return 'SF'; if (g[0] === 4) return '4K'; if (g[0] === 3 && g[1] === 2) return 'FH';
  if (fl) return 'FL'; if (st) return 'ST'; if (g[0] === 3) return '3K'; if (g[0] === 2 && g[1] === 2) return '2P';
  if (g[0] === 2) { const r = +Object.keys(cnt).find(k => cnt[k] === 2); if (r === 1 || r >= 11) return 'JB'; }
  return null;
}
function makeVideoPoker(G) {
  pedestalTable(G, 10, 4.5, 0x0a2a6a);
  // 페이테이블 보드
  const bc = canvasTex(512, 320, () => { }), ctx = bc.userCanvas.getContext('2d');
  function drawPay(hl) {
    ctx.fillStyle = '#120a3a'; ctx.fillRect(0, 0, 512, 320); ctx.strokeStyle = '#ffd24a'; ctx.lineWidth = 6; ctx.strokeRect(3, 3, 506, 314);
    ctx.font = `800 28px ${FONT}`; ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
    VP_PAY.forEach(([k, n, m], i) => {
      const y = 28 + i * 31; if (k === hl) { ctx.fillStyle = '#ffd24a'; ctx.fillRect(10, y - 15, 492, 30); }
      ctx.fillStyle = k === hl ? '#2b1700' : '#cfd8ff'; ctx.textAlign = 'left'; ctx.fillText(n, 24, y); ctx.textAlign = 'right'; ctx.fillStyle = k === hl ? '#2b1700' : '#ffd24a'; ctx.fillText('x' + m, 490, y);
    });
    bc.needsUpdate = true;
  }
  drawPay(null);
  const board = new THREE.Mesh(new THREE.PlaneGeometry(4.4, 2.75), new THREE.MeshBasicMaterial({ map: bc })); board.position.set(0, 3.0, -2.45); board.rotation.x = -.18; G.add(board);
  box(G, 4.7, 3.05, .15, 0, 3.0, -2.55, mat(0x8a2a9a, .3, .6));
  box(G, .2, 1.6, .2, -2.2, 1.8, -2.5, mat(0x8a2a9a, .3, .6)); box(G, .2, 1.6, .2, 2.2, 1.8, -2.5, mat(0x8a2a9a, .3, .6));
  const SHOE = V(0, 3, -1.8);
  let deck = [], hand = [], held = [false, false, false, false, false], cardM = [], phase = 'bet', bet = 10, wagered = 0, busy = false, panel;
  const px = i => V((i - 2) * 1.25, 1.13, .25);
  function sync() {
    if (!panel) return;
    $('#vBet', panel).textContent = fmt(phase === 'bet' ? bet : wagered);
    const q = a => panel.querySelector(`[data-act=${a}]`), inBet = phase === 'bet' && !busy;
    ['minus', 'plus', 'max'].forEach(a => q(a).disabled = !inBet); q('deal').disabled = !inBet; q('draw').disabled = phase !== 'hold' || busy;
    for (let i = 0; i < 5; i++) { const b = panel.querySelector(`[data-h="${i}"]`); b.disabled = phase !== 'hold' || busy; b.classList.toggle('on', held[i]); b.textContent = held[i] ? 'HOLD' : '홀드 ' + (i + 1); }
  }
  async function deal() {
    if (busy || phase !== 'bet') return; if (bet < 10) return toast('최소 베팅은 10입니다', 'bad'); if (bet > state.bal) return toast('칩이 부족합니다', 'bad');
    busy = true; cardM.forEach(m => G.remove(m)); cardM = []; addBal(-bet); wagered = bet; held = [false, false, false, false, false]; drawPay(null); deck = newDeck(1); hand = [];
    sync();
    for (let i = 0; i < 5; i++) { const c = deck.pop(); hand.push(c); const m = makeCard(c); m.position.copy(SHOE); G.add(m); cardM.push(m); await moveCard(m, px(i), FACE_DN, .25); }
    for (let i = 0; i < 5; i++) await flipCard(cardM[i], .25);
    phase = 'hold'; busy = false; sync(); toast('남길 카드를 선택(HOLD)하고 DRAW를 누르세요');
  }
  function toggle(i) {
    if (phase !== 'hold' || busy) return; held[i] = !held[i]; sfx.chip();
    tween(.15, k => cardM[i].position.z = px(i).z + (held[i] ? -.45 : 0) * k + (held[i] ? 0 : 0)); cardM[i].position.z = held[i] ? px(i).z - .45 : px(i).z; sync();
  }
  async function drawCards() {
    if (busy || phase !== 'hold') return; busy = true; sync();
    for (let i = 0; i < 5; i++) if (!held[i]) {
      await moveCard(cardM[i], V(px(i).x, 1.13, px(i).z - .45 * 0), FACE_DN, .2); G.remove(cardM[i]);
      const c = deck.pop(); hand[i] = c; const m = makeCard(c); m.position.copy(SHOE); G.add(m); cardM[i] = m;
      await moveCard(m, px(i), FACE_DN, .25); await flipCard(m, .25);
    }
    cardM.forEach((m, i) => m.position.z = px(i).z);
    held = [false, false, false, false, false];
    const res = vpEval(hand), row = VP_PAY.find(r => r[0] === res);
    drawPay(res);
    if (row) settle(wagered * row[2], wagered, `${row[1]}!`, G.localToWorld(V(0, 2, 0)));
    else settle(0, wagered, '족보 없음');
    phase = 'bet'; busy = false; if (bet > state.bal) bet = state.bal; sync(); $('#vBet', panel).textContent = fmt(bet);
  }
  const view = viewOf(G, [0, 6.4, 7.8], [0, 1.0, -.2]);
  return {
    id: 'poker', name: '비디오 포커', icon: '♠️', desc: 'Jacks or Better · 로열 x800', view, group: G,
    html: () => `<div class="title"><b>♠️ 비디오 포커 (Jacks or Better)</b><span class="info">카드를 클릭해도 홀드됩니다</span></div>
      <div class="row">${singleBetRow('vBet')}<button class="primary" data-act="deal" style="min-width:90px">DEAL</button><button class="primary" data-act="draw" style="min-width:90px">DRAW</button></div>
      <div class="row">${[0, 1, 2, 3, 4].map(i => `<button class="hold" data-act="hold" data-h="${i}">홀드 ${i + 1}</button>`).join('')}</div>
      <div class="pay">${VP_PAY.map(r => `${r[1]} x${r[2]}`).join(' · ')}</div>`,
    bind(p) { panel = p; sync(); },
    act(a, el) { if (a === 'deal') deal(); else if (a === 'draw') drawCards(); else if (a === 'hold') toggle(+el.dataset.h); else { bet = adjBet(bet, a); sync(); sfx.chip(); } },
    pick(ray) { if (phase !== 'hold') return false; const h = ray.intersectObjects(cardM, false)[0]; if (h) { toggle(cardM.indexOf(h.object)); return true; } return false; },
    pending: () => phase === 'hold' ? wagered : 0, busy: () => busy || phase === 'hold', update() { },
  };
}

/* =====================================================================
 *  6) 식보 (주사위 3개)
 * ===================================================================== */
const SIC_TOTAL = { 4: 60, 5: 30, 6: 17, 7: 12, 8: 8, 9: 6, 10: 6, 11: 6, 12: 6, 13: 8, 14: 12, 15: 17, 16: 30, 17: 60 };
function sicMul(k, d) {
  const sum = d[0] + d[1] + d[2], tri = d[0] === d[1] && d[1] === d[2];
  if (k === 'small') return !tri && sum >= 4 && sum <= 10 ? 2 : 0;
  if (k === 'big') return !tri && sum >= 11 && sum <= 17 ? 2 : 0;
  if (k === 'triple') return tri ? 31 : 0;
  if (k[0] === 'd') { const c = d.filter(x => x === +k.slice(1)).length; return c ? c + 1 : 0; }
  if (k[0] === 't') { const t = +k.slice(1); return sum === t && !tri ? SIC_TOTAL[t] + 1 : sum === t && tri ? SIC_TOTAL[t] + 1 : 0; }
  return 0;
}
function makeSicBo(G) {
  pedestalTable(G, 11, 5.5, 0x6a0f22);
  const tray = new THREE.Mesh(new THREE.CylinderGeometry(2.6, 2.6, .06, 40), mat(0x111111, .8)); tray.position.set(0, 1.13, -.3); G.add(tray);
  const tr = new THREE.Mesh(new THREE.TorusGeometry(2.6, .1, 8, 48), mat(0xffc83d, .25, .9)); tr.rotation.x = Math.PI / 2; tr.position.set(0, 1.18, -.3); G.add(tr);
  const l1 = flatLabel('小  SMALL 4-10', 5, 1, '#ffffffbb', 50); l1.position.set(-3.6, 1.115, 1.7); G.add(l1);
  const l2 = flatLabel('BIG 11-17  大', 5, 1, '#ffffffbb', 50); l2.position.set(3.6, 1.115, 1.7); G.add(l2);
  const SZ = .9, dice = [];
  for (let i = 0; i < 3; i++) { const d = new THREE.Mesh(new THREE.BoxGeometry(SZ, SZ, SZ), dieMats); d.position.set((i - 1) * 1.3, 1.13 + SZ / 2, -.3); G.add(d); dice.push(d); }
  const bets = new Bets(() => panel && bets.paint(panel));
  let busy = false, panel; const hist = [];
  async function roll() {
    if (busy) return; if (!bets.total) return toast('칩을 먼저 놓아주세요', 'bad');
    busy = true; bets.begin(); sync();
    const res = [rnd(6) + 1, rnd(6) + 1, rnd(6) + 1], T = 1.9;
    const jobs = dice.map((d, i) => {
      const p0 = V((Math.random() - .5) * 2, 4.5, 3.2), fx = (i - 1) * 1.4 + (Math.random() - .5) * .5, fz = -.3 + (Math.random() - .5) * 1.2;
      const q = new THREE.Quaternion().setFromAxisAngle(V(0, 1, 0), Math.random() * 6.28).multiply(FACE_Q[res[i]]);
      const ax = V(Math.random() - .5, Math.random() - .5, Math.random() - .5).normalize(), turns = 3 + Math.random() * 3, sc = (Math.random() > .5 ? 1 : -1);
      let hits = 0;
      return tween(T + i * .15, u => {
        d.position.set(p0.x + (fx - p0.x) * easeOut(u), 1.13 + SZ / 2 + Math.abs(Math.sin(u * Math.PI * 3.2)) * (1 - u) * 2.2 * (1 - u) + (1 - easeOut(Math.min(1, u * 1.6))) * (p0.y - 1.6), p0.z + (fz - p0.z) * easeOut(u));
        const s = new THREE.Quaternion().setFromAxisAngle(ax, sc * turns * 2 * Math.PI * (1 - easeOut(u)));
        d.quaternion.copy(s).multiply(q);
        const h = Math.floor(u * 3.2); if (h > hits) { hits = h; sfx.clunk(); }
      }, t => t);
    });
    await Promise.all(jobs);
    const sum = res[0] + res[1] + res[2], tri = res[0] === res[1] && res[1] === res[2];
    hist.unshift(res.join('')); if (hist.length > 10) hist.pop(); drawHist();
    let ret = 0; const tb = bets.total;
    for (const [k, a] of Object.entries(bets.m)) ret += a * sicMul(k, res);
    panel.querySelectorAll('[data-k]').forEach(el => { if (sicMul(el.dataset.k, res)) el.classList.add('hit'); });
    await sleep(300);
    settle(ret, tb, `🎲 ${res.join(' · ')} = ${sum}${tri ? ' (트리플!)' : sum >= 11 ? ' 대' : ' 소'}`, G.localToWorld(V(0, 1.5, 0)));
    await sleep(1800);
    panel.querySelectorAll('.hit').forEach(el => el.classList.remove('hit'));
    bets.end(); busy = false; sync();
  }
  function drawHist() { const h = $('#sH', panel); if (h) h.innerHTML = hist.map(x => `<i style="background:#444;width:46px;border-radius:12px">${x}</i>`).join(''); }
  function sync() { if (!panel) return; panel.querySelectorAll('button').forEach(b => { if (b.dataset.act) b.disabled = busy; }); bets.paint(panel); }
  const totals = Object.keys(SIC_TOTAL).map(t => spot('t' + t, `${t}<br><small>${SIC_TOTAL[t]}:1</small>`, '', 'padding:4px')).join('');
  const singles = [1, 2, 3, 4, 5, 6].map(n => spot('d' + n, `⚀ 단일 ${n}`.replace('⚀', ['⚀', '⚁', '⚂', '⚃', '⚄', '⚅'][n - 1]), '', 'font-size:15px')).join('');
  const view = viewOf(G, [0, 5.6, 7.0], [0, .6, -.2]);
  return {
    id: 'sicbo', name: '식보', icon: '🎲', desc: '주사위 3개 · 대/소 · 합계', view, group: G,
    html: () => `<div class="title"><b>🎲 식보 (Sic Bo)</b><span class="info">총 베팅 <b id="tot" style="color:var(--gold)">0</b></span></div>
      <div class="sgrid" style="grid-template-columns:1fr 1fr 1fr">
        ${spot('small', '小 소 (4-10)<br><small>1:1</small>', '', 'background:#1d4f9a;padding:10px')}
        ${spot('triple', '올 트리플<br><small>30:1</small>', '', 'background:#127a48;padding:10px')}
        ${spot('big', '大 대 (11-17)<br><small>1:1</small>', '', 'background:#a3202f;padding:10px')}
      </div>
      <div class="sgrid" style="margin-top:6px">${singles}</div>
      <div class="sgrid" style="margin-top:6px;grid-template-columns:repeat(14,1fr);font-size:12px">${totals}</div>
      <div class="row"><button class="primary" data-act="roll" style="min-width:120px;font-size:17px">ROLL</button>${betBtns()}</div>
      <div class="hist" id="sH"></div>
      <div class="pay">단일 숫자: 나온 개수만큼 지급(1개 1:1, 2개 2:1, 3개 3:1) · 합계 4/17=60:1 … 9~12=6:1 · 트리플이면 대/소는 하우스 승</div>`,
    bind(p) { panel = p; drawHist(); sync(); },
    act(a, el) { if (a === 'roll') roll(); else if (a === 'spot') bets.add(el.dataset.k); else if (a === 'undo') bets.undo(); else if (a === 'clear') bets.clear(); else if (a === 'rebet') bets.rebet(); },
    pending: () => busy ? 0 : bets.total, busy: () => busy,
    update(dt, t) { if (!busy) dice.forEach((d, i) => { d.position.y = 1.13 + SZ / 2; }); }, clearBets() { bets.clear(); },
  };
}

/* =====================================================================
 *  게임 등록 / 화면 전환
 * ===================================================================== */
const games = {};
[['slots', '슬롯머신', 'LUCKY SLOTS', makeSlots], ['blackjack', '블랙잭', 'BLACKJACK', makeBlackjack], ['roulette', '룰렛', 'ROULETTE', makeRoulette],
 ['baccarat', '바카라', 'BACCARAT', makeBaccarat], ['poker', '비디오 포커', 'VIDEO POKER', makeVideoPoker], ['sicbo', '식보', 'SIC BO', makeSicBo]
].forEach(([id, name, sub, fn], i) => { const G = makeStation(i, id, name, sub); games[id] = fn(G); });

const camPos = camera.position.clone(), look = V(0, 2, R), camGoal = V(0, 4, 0), lookGoal = V(0, 2, R);
let lobbyYaw = 0, hoverYaw = null;
const stationAngle = id => Math.atan2(games[id].group.position.x, games[id].group.position.z);

$('#menu').innerHTML = Object.values(games).map(g => `<button data-g="${g.id}"><span class="ic">${g.icon}</span><b>${g.name}</b><span class="d">${g.desc}</span></button>`).join('');
$('#chips').innerHTML = CHIPS.map(([v, c]) => `<button class="chip${v === state.chip ? ' sel' : ''}" data-chip="${v}" style="background:${c}">${v}</button>`).join('');

function enter(id) {
  const g = games[id]; if (!g || state.game) return;
  state.game = g; sfx.chip();
  $('#lobby').style.display = 'none'; $('#game').style.display = 'flex'; $('#btnLobby').style.display = '';
  const p = $('#panel'); p.innerHTML = g.html(); g.bind(p);
  camGoal.copy(g.view.pos); lookGoal.copy(g.view.look);
}
function leave() {
  const g = state.game;
  if (g && g.busy()) return toast('게임이 진행 중입니다', 'bad');
  if (g && g.clearBets) g.clearBets();
  if (g && g.pending() > 0) toast('진행 중이던 베팅은 반환되었습니다');
  state.game = null; $('#panel').innerHTML = '';
  $('#lobby').style.display = 'block'; $('#game').style.display = 'none'; $('#btnLobby').style.display = 'none';
}
$('#menu').addEventListener('click', e => { const b = e.target.closest('[data-g]'); if (b) enter(b.dataset.g); });
$('#menu').addEventListener('pointerover', e => { const b = e.target.closest('[data-g]'); hoverYaw = b ? stationAngle(b.dataset.g) : null; });
$('#menu').addEventListener('pointerleave', () => hoverYaw = null);
$('#btnLobby').onclick = leave;
$('#btnSound').onclick = e => { state.sound = !state.sound; e.target.textContent = state.sound ? '🔊' : '🔇'; };
$('#btnReset').onclick = () => { if (state.game && state.game.busy()) return toast('게임이 진행 중입니다', 'bad'); if (confirm('보유 칩을 기본금 1,000으로 초기화할까요?')) { if (state.game?.clearBets) state.game.clearBets(); state.bal = START; save(); toast('기본금 1,000으로 초기화했습니다'); } };
$('#btnRefill').onclick = () => { state.bal = START; save(); toast('기본금 1,000 지급! 행운을 빕니다 🍀', 'win'); };
$('#chips').addEventListener('click', e => {
  const b = e.target.closest('[data-chip]'); if (!b) return; state.chip = +b.dataset.chip; sfx.chip();
  $('#chips').querySelectorAll('.chip').forEach(c => c.classList.toggle('sel', c === b));
});
$('#panel').addEventListener('click', e => {
  const b = e.target.closest('[data-act]'); if (!b || b.disabled || !state.game) return;
  state.game.act(b.dataset.act, b);
});

// 3D 클릭: 로비에서 테이블 선택 / 비디오 포커 카드 홀드
const ray = new THREE.Raycaster(), ndc = new THREE.Vector2();
renderer.domElement.addEventListener('pointerdown', e => {
  ndc.set(e.clientX / innerWidth * 2 - 1, -(e.clientY / innerHeight) * 2 + 1); ray.setFromCamera(ndc, camera);
  if (state.game) { if (state.game.pick) state.game.pick(ray); return; }
  const hit = ray.intersectObjects(scene.children, true).find(h => { let o = h.object; while (o) { if (o.userData.gameId) return true; o = o.parent; } return false; });
  if (hit) { let o = hit.object; while (!o.userData.gameId) o = o.parent; enter(o.userData.gameId); }
});

/* =====================================================================
 *  메인 루프
 * ===================================================================== */
let last = performance.now(), T = 0;
function loop(now) {
  const dt = Math.min(.05, (now - last) / 1000); last = now; T += dt;
  updateTweens(dt); updateCoins(dt);
  for (const g of Object.values(games)) g.update && g.update(dt, T);
  scene.userData.neon.forEach((m, i) => m.material.color.offsetHSL(dt * .05 * (i + 1), 0, 0));

  if (!state.game) {
    lobbyYaw += dt * .16;
    const yaw = hoverYaw !== null ? hoverYaw : lobbyYaw;
    camGoal.set(0, 4.2, 0); lookGoal.set(Math.sin(yaw) * R, 2.8, Math.cos(yaw) * R);
  }
  const k = 1 - Math.exp(-dt * (state.game ? 2.6 : 3));
  camPos.lerp(camGoal, k); look.lerp(lookGoal, k);
  camera.position.copy(camPos); camera.lookAt(look);

  shownBal += (state.bal - shownBal) * Math.min(1, dt * 6); if (Math.abs(state.bal - shownBal) < .5) shownBal = state.bal;
  $('#balv').textContent = fmt(shownBal);
  const broke = state.bal < 10 && (!state.game || state.game.pending() === 0) && !(state.game && state.game.busy());
  $('#broke').style.display = broke ? 'flex' : 'none';
  renderer.render(scene, camera);
  requestAnimationFrame(loop);
}
$('#lobby').style.display = 'block';
requestAnimationFrame(loop);
window.__casino = { state, games, enter, leave, camera };
