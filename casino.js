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
    if (this.limit && (this.m[k] || 0) + state.chip > this.limit(k)) { toast(`이 칸의 최대 베팅은 ${fmt(this.limit(k))}입니다`, 'bad'); return false; }
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
    hint(busy ? '릴이 돌아가는 중… 결과를 기다리세요 🎰' : bet < 10 ? '＋ 버튼으로 베팅액을 올려주세요 (최소 10)' : `① 칩 단위 선택 → ② ＋/－로 베팅액(${fmt(bet)}) 조절 → ③ SPIN 버튼!`);
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
    hint(busy ? '카드를 나누는 중…' : phase === 'bet' ? (bet < 10 ? '＋ 버튼으로 베팅하세요 (최소 10)' : '베팅 완료! DEAL 버튼을 눌러 시작하세요') : `내 합계 ${val(player)} — 21에 가까우면 이겨요. 더 받으려면 HIT, 그만하려면 STAND`);
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
  const hist = []; const bets = new Bets(() => panel && sync());

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
  function sync() {
    if (!panel) return; panel.querySelectorAll('button').forEach(b => { if (b.dataset.act) b.disabled = busy; }); bets.paint(panel);
    hint(busy ? '공이 굴러가는 중… 🎡' : bets.total ? `총 ${fmt(bets.total)} 베팅 중 — 더 걸거나 SPIN을 누르세요` : '① 칩 선택 → ② 숫자·색 칸을 눌러 칩 올리기 → ③ SPIN');
  }

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
 *  4) 바카라 (실제 카지노 스타일: 반원 테이블, 딜러, 슈, 번 카드, 스퀴즈, 구슬판/대로, 페어 사이드벳)
 * ===================================================================== */
function drawRoads(g, w, h, hist) {
  g.fillStyle = '#f6f2e6'; g.fillRect(0, 0, w, h);
  const cell = h / 6, half = Math.floor(w / 2);
  g.strokeStyle = '#cfc8b0'; g.lineWidth = 1;
  for (let x = 0; x <= w; x += cell) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, h); g.stroke(); }
  for (let y = 0; y <= h; y += cell) { g.beginPath(); g.moveTo(0, y); g.lineTo(w, y); g.stroke(); }
  g.strokeStyle = '#7a6a3a'; g.lineWidth = 3; g.beginPath(); g.moveTo(half, 0); g.lineTo(half, h); g.stroke();
  const col = { P: '#1d5fd1', B: '#d11f2f', T: '#12994f' };
  const dot = (x, y, r, c) => { g.fillStyle = c; g.beginPath(); g.arc(x, y, r, 0, 7); g.fill(); };
  // 구슬판(Bead plate): 위→아래, 왼→오른
  const visB = Math.floor(half / cell), totB = Math.ceil(hist.length / 6), offB = Math.max(0, totB - visB);
  hist.forEach((r, i) => {
    const c = Math.floor(i / 6) - offB; if (c < 0) return;
    const x = c * cell + cell / 2, y = (i % 6) * cell + cell / 2;
    dot(x, y, cell * .4, col[r.w]); g.fillStyle = '#fff'; g.font = `800 ${cell * .46}px ${FONT}`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(r.w, x, y + 1);
    if (r.bp) dot(x - cell * .3, y - cell * .3, cell * .1, '#ff2a2a'); if (r.pp) dot(x + cell * .3, y + cell * .3, cell * .1, '#2a6bff');
  });
  // 대로(Big road)
  const occ = new Set(), cells = []; let sc = -1, c = 0, r = 0, tail = false, last = null;
  for (const h2 of hist) {
    if (h2.w === 'T') { if (cells.length) cells[cells.length - 1].t++; continue; }
    if (h2.w !== last) { sc++; c = sc; r = 0; tail = false; }
    else if (!tail && r < 5 && !occ.has((r + 1) + ',' + c)) r++; else { tail = true; c++; }
    occ.add(r + ',' + c); cells.push({ c, r, w: h2.w, t: 0, pp: h2.pp, bp: h2.bp }); last = h2.w;
  }
  const maxC = cells.reduce((m, q) => Math.max(m, q.c), 0), visR = Math.floor((w - half) / cell), offR = Math.max(0, maxC - visR + 1);
  for (const q of cells) {
    const cc = q.c - offR; if (cc < 0) continue;
    const x = half + cc * cell + cell / 2, y = q.r * cell + cell / 2;
    g.strokeStyle = col[q.w]; g.lineWidth = cell * .13; g.beginPath(); g.arc(x, y, cell * .33, 0, 7); g.stroke();
    if (q.t) { g.strokeStyle = col.T; g.lineWidth = 3; g.beginPath(); g.moveTo(x - cell * .32, y + cell * .32); g.lineTo(x + cell * .32, y - cell * .32); g.stroke(); }
    if (q.bp) dot(x - cell * .3, y - cell * .3, cell * .1, '#ff2a2a'); if (q.pp) dot(x + cell * .3, y + cell * .3, cell * .1, '#2a6bff');
  }
  g.fillStyle = '#7a6a3a99'; g.font = `700 ${cell * .3}px ${FONT}`; g.textAlign = 'left'; g.textBaseline = 'top';
  g.fillText('구슬판', 4, 2); g.fillText('대로', half + 4, 2);
}

function makeBaccarat(G) {
  const LIM = { P: 2000, B: 2000, T: 500, PP: 500, BP: 500 };
  const wood = mat(0x3a1d0e, .35, .3), gold = mat(0xffc83d, .25, .95), felt = mat(0x0a6a3f, .95);
  const TZ = -1.4; // 테이블 직선 가장자리 z
  const half = (r, h, y, m) => { const o = new THREE.Mesh(new THREE.CylinderGeometry(r, r, h, 64, 1, false, -Math.PI / 2, Math.PI), m); o.position.set(0, y, TZ); G.add(o); return o; };
  half(7, .9, .45, mat(0x2a140a, .6));
  half(7.35, .08, .06, gold);
  half(6.75, .22, 1.0, felt);
  const arc = new THREE.Mesh(new THREE.TorusGeometry(6.95, .24, 12, 64, Math.PI), wood); arc.rotation.set(-Math.PI / 2, 0, Math.PI); arc.position.set(0, 1.12, TZ); G.add(arc);
  const arcG = new THREE.Mesh(new THREE.TorusGeometry(6.62, .04, 8, 64, Math.PI), gold); arcG.rotation.set(-Math.PI / 2, 0, Math.PI); arcG.position.set(0, 1.12, TZ); G.add(arcG);
  box(G, 14.2, .3, .5, 0, 1.12, TZ - .1, wood);

  // 펠트 장식 (카드 구역 / 베팅 칸)
  const plane = (x, z, w, d, draw, y = 1.116) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, d), new THREE.MeshBasicMaterial({ map: canvasTex(Math.round(w * 128), Math.round(d * 128), draw), transparent: true, depthWrite: false }));
    m.rotation.x = -Math.PI / 2; m.position.set(x, y, z); G.add(m); return m;
  };
  const rrect = (g, x, y, w, h, r) => { g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath(); };
  const area = (cx, color, name) => plane(cx, .35, 4.2, 2.2, (g, w, h) => {
    g.strokeStyle = color; g.lineWidth = 6; rrect(g, 8, 8, w - 16, h - 16, 24); g.stroke();
    g.fillStyle = color; g.globalAlpha = .55; g.font = `900 ${h * .17}px ${FONT}`; g.textAlign = 'center'; g.fillText(name, w / 2, h - 22); g.globalAlpha = 1;
    g.strokeStyle = color + '66'; g.lineWidth = 3; for (let i = 0; i < 2; i++) rrect(g, w / 2 - w * .27 + i * w * .28 + (i ? 4 : 0), h * .14, w * .24, h * .56, 8), g.stroke();
  });
  area(-2.6, '#6db8ff', 'PLAYER'); area(2.6, '#ff7b8e', 'BANKER');
  const spotPlane = (x, z, w, d, color, t1, t2) => plane(x, z, w, d, (g, cw, ch) => {
    g.fillStyle = color + '33'; g.strokeStyle = color; g.lineWidth = 7; g.beginPath(); g.ellipse(cw / 2, ch / 2, cw / 2 - 8, ch / 2 - 8, 0, 0, 7); g.fill(); g.stroke();
    g.fillStyle = '#fff'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.font = `900 ${ch * .26}px ${FONT}`; g.fillText(t1, cw / 2, ch * .42); g.font = `700 ${ch * .17}px ${FONT}`; g.fillStyle = '#ffd24a'; g.fillText(t2, cw / 2, ch * .68);
  });
  const SP = { PP: [-4.4, 2.5, 1.7, 1.2, '#4aa3ff', 'P PAIR', '11 : 1'], P: [-2.3, 3.2, 3.0, 1.5, '#4aa3ff', 'PLAYER', '1 : 1'], T: [0, 3.55, 2.2, 1.3, '#2fd37c', 'TIE', '8 : 1'], B: [2.3, 3.2, 3.0, 1.5, '#ff5a6e', 'BANKER', '0.95 : 1'], BP: [4.4, 2.5, 1.7, 1.2, '#ff5a6e', 'B PAIR', '11 : 1'] };
  const stacks = {};
  for (const k in SP) { const [x, z, w, d, c, t1, t2] = SP[k]; spotPlane(x, z, w, d, c, t1, t2); stacks[k] = chipStack(G, x, z + .1); }
  plane(0, 4.55, 6, .7, (g, w, h) => { g.fillStyle = '#ffd24acc'; g.font = `800 ${h * .5}px ${FONT}`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('BACCARAT  ·  PAYS 8 TO 1 ON TIE', w / 2, h / 2); });
  // 칩 트레이(딜러 앞)
  box(G, 2.6, .12, .7, 0, 1.17, TZ + .6, mat(0x151515, .4, .6));
  const trayChips = new THREE.Group(); G.add(trayChips);
  [[1000, -1], [500, -.6], [100, -.2], [50, .2], [10, .6]].forEach(([v, x]) => { for (let i = 0; i < 7; i++) { const m = new THREE.Mesh(chipGeo, chipMats[v]); m.position.set(x, 1.27 + i * .062, TZ + .6); trayChips.add(m); } });

  // 슈 + 버린 카드함
  shoeMesh(G, 5.2, TZ + .5);
  box(G, 1.1, .5, 1.6, -5.2, 1.4, TZ + .5, mat(0x222, .3, .6));
  const SHOE = V(5.2, 2.2, TZ + .5);

  // 딜러
  const dealer = new THREE.Group(); dealer.position.set(0, 0, -3.2); G.add(dealer);
  box(dealer, 1.5, 1.9, .8, 0, 1.8, 0, mat(0x101015, .6));
  box(dealer, .55, 1.2, .02, 0, 2.15, .41, mat(0xf4f4f4, .5));
  box(dealer, .22, .12, .03, 0, 2.7, .42, mat(0xd11f2f, .5)); box(dealer, .1, .1, .03, 0, 2.7, .43, mat(0xaa1020, .5));
  const head = new THREE.Mesh(new THREE.SphereGeometry(.38, 20, 20), mat(0xf0c8a0, .7)); head.position.set(0, 3.2, 0); dealer.add(head);
  const hair = new THREE.Mesh(new THREE.SphereGeometry(.4, 20, 20, 0, Math.PI * 2, 0, Math.PI / 2), mat(0x1a1008, .8)); hair.position.set(0, 3.25, -.02); dealer.add(hair);
  const armL = box(dealer, .3, 1.2, .3, -.95, 1.9, .2, mat(0x101015, .6)), armR = box(dealer, .3, 1.2, .3, .95, 1.9, .2, mat(0x101015, .6));
  armL.rotation.x = -.9; armR.rotation.x = -.9; armL.position.set(-.95, 1.95, .55); armR.position.set(.95, 1.95, .55);
  const nameTag = box(dealer, .4, .12, .02, -.4, 2.5, .41, gold);

  // 안내 표지판 (MIN/MAX)
  const sign = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 1.5), new THREE.MeshBasicMaterial({
    map: canvasTex(384, 240, (g, w, h) => {
      g.fillStyle = '#1a0d08'; g.fillRect(0, 0, w, h); g.strokeStyle = '#ffd24a'; g.lineWidth = 8; g.strokeRect(6, 6, w - 12, h - 12);
      g.fillStyle = '#ffd24a'; g.textAlign = 'center'; g.font = `900 46px ${FONT}`; g.fillText('BACCARAT', w / 2, 62);
      g.fillStyle = '#fff'; g.font = `700 30px ${FONT}`; g.fillText('MIN  10', w / 2, 112); g.fillText('MAX  2,000', w / 2, 152); g.font = `600 22px ${FONT}`; g.fillStyle = '#ffffffbb'; g.fillText('TIE · PAIR  MAX 500', w / 2, 200);
    })
  }));
  sign.position.set(-5.2, 2.1, TZ - .4); G.add(sign); box(G, .1, 1, .1, -5.2, 1.3, TZ - .45, gold);

  // 전광판 (구슬판 + 대로)
  const boardCv = canvasTex(1024, 300, () => { });
  const drawBoard = () => { drawRoads(boardCv.userCanvas.getContext('2d'), 1024, 300, hist); boardCv.needsUpdate = true; };
  const board = new THREE.Mesh(new THREE.PlaneGeometry(7.2, 2.1), new THREE.MeshBasicMaterial({ map: boardCv })); board.position.set(0, 5.4, -4.4); G.add(board);
  box(G, 7.6, 2.5, .15, 0, 5.4, -4.5, mat(0x1b1020, .4, .7)); box(G, .3, 4.6, .3, -3.3, 2.5, -4.5, gold); box(G, .3, 4.6, .3, 3.3, 2.5, -4.5, gold);

  // 결과 배너
  const bnCv = canvasTex(768, 192, () => { });
  const banner = new THREE.Sprite(new THREE.SpriteMaterial({ map: bnCv, transparent: true, depthWrite: false, opacity: 0 })); banner.scale.set(6.4, 1.6, 1); banner.position.set(0, 3.1, 1.2); G.add(banner);
  function showBanner(text, sub, color) {
    const g = bnCv.userCanvas.getContext('2d'); g.clearRect(0, 0, 768, 192); g.fillStyle = '#000b'; rrect(g, 4, 4, 760, 184, 36); g.fill(); g.strokeStyle = color; g.lineWidth = 8; g.stroke();
    g.textAlign = 'center'; g.fillStyle = color; g.font = `900 84px ${FONT}`; g.fillText(text, 384, 94); g.fillStyle = '#fff'; g.font = `700 40px ${FONT}`; g.fillText(sub, 384, 156); bnCv.needsUpdate = true;
    banner.material.opacity = 1;
  }

  const bets = new Bets(() => { if (!panel) return; sync(); for (const k in stacks) stacks[k].set(bets.m[k] || 0); });
  bets.limit = k => LIM[k];
  let shoe = [], meshes = [], busy = false, panel, burned = 0, newShoeNext = true; let hist = [];
  const cv = c => c.r === 'A' ? 1 : c.r === '10' || 'JQK'.includes(c.r) ? 0 : +c.r;
  const tot = h => h.reduce((a, c) => a + cv(c), 0) % 10;
  const CX = { P: -2.6, B: 2.6 };
  const pos = (side, i) => i < 2 ? V(CX[side] - .62 + i * 1.24, 1.13 + i * .01, .15) : V(CX[side], 1.14, 1.55);
  const st = { P: [], B: [] };
  function info() {
    $('#bcI', panel).innerHTML = `<span class="dealerp"><span style="color:#6db8ff">PLAYER ${st.P.length ? tot(st.P) : '-'}</span> &nbsp;|&nbsp; <span style="color:#ff7b8e">BANKER ${st.B.length ? tot(st.B) : '-'}</span></span>`;
  }
  async function newShoe() {
    shoe = newDeck(8); hist = []; drawBoard(); drawPanelRoads();
    const first = shoe.pop(), n = cv(first) || 10; shoe.splice(shoe.length - n, n); burned = n + 1; newShoeNext = false;
    toast(`🔀 새 슈 시작 — 첫 카드 ${first.r}${first.s} → ${n}장 번(burn)`);
    await sleep(1400);
  }
  async function put(hand, side, up = true) {
    const c = shoe.pop(); hand.push(c); const m = makeCard(c); m.position.copy(SHOE); G.add(m); meshes.push(m);
    const i = hand.length - 1, third = i === 2;
    await moveCard(m, pos(side, i), up ? FACE_UP : FACE_DN, third ? .5 : .4, third ? Math.PI / 2 : (Math.random() - .5) * .05);
    if (up) { st[side] = hand; info(); } return m;
  }
  /** 스퀴즈: 카드를 살짝 들어 올려 모서리부터 천천히 확인한 뒤 뒤집기 */
  async function squeeze(m, slow = 1) {
    const y0 = m.position.y, z0 = m.position.z; sfx.card();
    await tween(.8 * slow, k => { m.rotation.x = FACE_DN - k * 1.1; m.position.y = y0 + k * .25; m.position.z = z0 - k * .3; });
    await sleep(350 * slow);
    await tween(.45, k => { m.rotation.x = (FACE_DN - 1.1) + (FACE_UP - FACE_DN + 1.1) * k; m.position.y = y0 + .25 * (1 - k) + Math.sin(k * Math.PI) * .4; m.position.z = z0 - .3 * (1 - k); });
  }
  function bannerOff() { tween(.6, k => banner.material.opacity = 1 - k); }
  async function deal() {
    if (busy) return; if (!bets.total) return toast('칩을 먼저 놓아주세요', 'bad');
    busy = true; bets.begin(); sync(); meshes.forEach(m => G.remove(m)); meshes = []; st.P = []; st.B = []; banner.material.opacity = 0; info();
    if (newShoeNext || shoe.length < 16) await newShoe();
    const P = [], B = [];
    // 딜러 순서: 플레이어 → 뱅커 → 플레이어 → 뱅커 (모두 뒷면)
    const p1 = await put(P, 'P', false), b1 = await put(B, 'B', false), p2 = await put(P, 'P', false), b2 = await put(B, 'B', false);
    hint('딜러가 카드를 오픈합니다…');
    await sleep(400);
    await squeeze(p1, .6); await squeeze(p2); st.P = P; info();
    await sleep(300);
    await squeeze(b1, .6); await squeeze(b2); st.B = B; info();
    let pv = tot(P), bv = tot(B), natural = pv >= 8 || bv >= 8;
    if (natural) { toast(`내추럴 ${Math.max(pv, bv)}!`); await sleep(700); }
    else {
      await sleep(500);
      let p3 = null;
      if (pv <= 5) { toast('플레이어 3번째 카드'); p3 = await put(P, 'P'); await sleep(300); }
      bv = tot(B); let bd;
      if (p3 === null) bd = bv <= 5;
      else { const x = cv(p3); bd = bv <= 2 ? true : bv === 3 ? x !== 8 : bv === 4 ? x >= 2 && x <= 7 : bv === 5 ? x >= 4 && x <= 7 : bv === 6 ? x === 6 || x === 7 : false; }
      if (bd) { toast('뱅커 3번째 카드'); await put(B, 'B'); await sleep(300); }
    }
    pv = tot(P); bv = tot(B);
    const win = pv > bv ? 'P' : bv > pv ? 'B' : 'T', pp = P[0].r === P[1].r, bp = B[0].r === B[1].r;
    hist.push({ w: win, pp, bp }); drawBoard(); drawPanelRoads();
    const NAME = { P: 'PLAYER', B: 'BANKER', T: 'TIE' }, COL = { P: '#6db8ff', B: '#ff7b8e', T: '#7dffa8' };
    showBanner(win === 'T' ? 'TIE' : NAME[win] + ' WIN', `${pv} : ${bv}${natural ? '  NATURAL' : ''}${pp ? '  · P PAIR' : ''}${bp ? '  · B PAIR' : ''}`, COL[win]);
    let ret = 0; const tb = bets.total;
    for (const [k, amt] of Object.entries(bets.m)) {
      if (k === 'P') ret += win === 'P' ? amt * 2 : win === 'T' ? amt : 0;
      else if (k === 'B') ret += win === 'B' ? amt * 1.95 : win === 'T' ? amt : 0;
      else if (k === 'T') ret += win === 'T' ? amt * 9 : 0;
      else if (k === 'PP') ret += pp ? amt * 12 : 0;
      else if (k === 'BP') ret += bp ? amt * 12 : 0;
    }
    const wins = new Set([win, ...(pp ? ['PP'] : []), ...(bp ? ['BP'] : [])]);
    panel.querySelectorAll('[data-k]').forEach(el => { if (wins.has(el.dataset.k)) el.classList.add('hit'); });
    await sleep(300);
    settle(ret, tb, `${NAME[win]} 승! (${pv}:${bv})`, G.localToWorld(V(0, 1.5, 2)));
    if (shoe.length < 16) { newShoeNext = true; toast('✂️ 컷카드 등장 — 다음 판은 새 슈로 시작합니다'); }
    await sleep(2200);
    bannerOff(); panel.querySelectorAll('.hit').forEach(el => el.classList.remove('hit'));
    bets.end(); busy = false; sync();
  }
  function drawPanelRoads() {
    if (!panel) return; const c = $('#roads', panel); if (c) drawRoads(c.getContext('2d'), c.width, c.height, hist);
    const s = $('#bcS', panel); if (s) { const n = x => hist.filter(h => h.w === x).length; s.innerHTML = `<span style="color:#6db8ff">PLAYER ${n('P')}</span> · <span style="color:#ff7b8e">BANKER ${n('B')}</span> · <span style="color:#7dffa8">TIE ${n('T')}</span> · 남은 카드 ${shoe.length || '—'}`; }
  }
  function sync() {
    if (!panel) return; panel.querySelectorAll('button').forEach(b => { if (b.dataset.act) b.disabled = busy; }); bets.paint(panel); drawPanelRoads();
    hint(busy ? '딜러가 카드를 오픈합니다… (자동 진행)' : bets.total ? `총 ${fmt(bets.total)} 베팅 — 모두 걸었으면 DEAL! 카드는 정식 룰대로 자동 진행됩니다` : 'PLAYER / BANKER / TIE 중 맞힐 곳을 눌러 베팅하세요 (페어는 선택)');
  }
  const view = viewOf(G, [0, 13.5, 13.5], [0, 1.0, 2.9]);
  const sp = (k, a, b, style) => spot(k, `${a}<br><small>${b}</small>`, '', style);
  return {
    id: 'baccarat', name: '바카라', icon: '♦️', desc: '실제 카지노 방식 · 구슬판/대로 · 페어', view, group: G,
    html: () => `<div class="title"><b>♦️ 바카라</b><span class="info" id="bcI"></span></div>
      <div class="row" style="gap:8px;flex-wrap:nowrap;align-items:stretch">
        ${sp('PP', 'P PAIR', '11 : 1', 'background:#17407a;flex:1;max-width:120px;padding:10px 4px')}
        ${sp('P', 'PLAYER', '1 : 1', 'background:#1d4f9a;flex:2;padding:12px')}
        ${sp('T', 'TIE', '8 : 1', 'background:#127a48;flex:1.2;max-width:150px;padding:12px')}
        ${sp('B', 'BANKER', '0.95 : 1', 'background:#a3202f;flex:2;padding:12px')}
        ${sp('BP', 'B PAIR', '11 : 1', 'background:#7a1824;flex:1;max-width:120px;padding:10px 4px')}
      </div>
      <div class="row"><button class="primary" data-act="deal" style="min-width:120px;font-size:17px">DEAL</button>${betBtns()}<span class="info">총 베팅 <b id="tot" style="color:var(--gold)">0</b></span></div>
      <div class="info" id="bcS" style="font-size:13px"></div>
      <canvas id="roads" width="1000" height="108" style="width:100%;border-radius:8px;margin-top:4px"></canvas>
      <div class="pay">MIN 10 · MAX 2,000 (TIE/페어 500) · 뱅커 승리 시 5% 커미션(0.95배) · 8장 슈, 컷카드 후 새 슈 · ●빨강=뱅커 페어 ●파랑=플레이어 페어</div>`,
    bind(p) { panel = p; for (const k in stacks) stacks[k].set(bets.m[k] || 0); st.P = []; st.B = []; sync(); info(); },
    act(a, el) { if (a === 'deal') deal(); else if (a === 'spot') bets.add(el.dataset.k); else if (a === 'undo') bets.undo(); else if (a === 'clear') bets.clear(); else if (a === 'rebet') bets.rebet(); },
    pending: () => busy ? 0 : bets.total, busy: () => busy,
    update(dt, t) { head.position.y = 3.2 + Math.sin(t * 1.6) * .015; if (!busy) { armL.rotation.x = -.9 + Math.sin(t * 1.2) * .03; } }, clearBets() { bets.clear(); },
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
  const board = new THREE.Mesh(new THREE.PlaneGeometry(4.4, 2.75), new THREE.MeshBasicMaterial({ map: bc })); board.position.set(0, 3.0, -2.4); G.add(board);
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
    hint(busy ? '카드를 나누는 중…' : phase === 'hold' ? '남기고 싶은 카드를 클릭(HOLD)한 뒤 DRAW를 누르세요. 나머지는 새 카드로 바뀝니다' : '베팅액을 정하고 DEAL을 눌러 카드 5장을 받으세요');
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
  const bets = new Bets(() => panel && sync());
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
  function sync() {
    if (!panel) return; panel.querySelectorAll('button').forEach(b => { if (b.dataset.act) b.disabled = busy; }); bets.paint(panel);
    hint(busy ? '주사위가 굴러가는 중… 🎲' : bets.total ? `총 ${fmt(bets.total)} 베팅 중 — ROLL을 누르세요` : '가장 쉬운 베팅: 소(합 4~10) 또는 대(합 11~17)를 눌러보세요');
  }
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


const HELP = {
  slots: { lv: '⭐ 가장 쉬움', goal: '그림 3개가 같게 나오면 베팅한 칩의 몇 배를 받아요.',
    steps: ['아래 동그란 칩(10~1000) 중 하나를 눌러 단위를 고르세요.', '＋ / － 버튼으로 이번 판 베팅액을 정하세요.', 'SPIN 버튼을 누르면 릴이 돌아가요!'],
    tip: '가운데 빨간 줄에 보이는 그림 3개로 결정돼요.<br>🍒🍒🍒 5배 · 🍋🍋🍋 8배 · 🔔🔔🔔 15배 · ⭐⭐⭐ 25배 · 7️⃣7️⃣7️⃣ 50배 · 💎💎💎 100배 · 🍒 2개 2배 · 나머지는 꽝' },
  blackjack: { lv: '⭐⭐ 쉬움', goal: '카드 합계를 21에 더 가깝게 만들어 딜러를 이기세요. 21을 넘으면(버스트) 바로 져요.',
    steps: ['베팅액을 정하고 DEAL을 눌러 카드를 받으세요.', '내 카드 합계를 보고 HIT(한 장 더) 또는 STAND(멈추기)를 고르세요.', '내가 멈추면 딜러가 17 이상이 될 때까지 카드를 받고, 합계가 더 큰 쪽이 이겨요.'],
    tip: '숫자 카드는 숫자 그대로, J·Q·K는 10, A는 1 또는 11(유리한 쪽)이에요.<br>첫 두 장이 A+10점 카드(블랙잭)면 베팅의 1.5배를 더 받아요. DOUBLE은 베팅을 2배로 올리고 딱 한 장만 더 받는 선택이에요.' },
  roulette: { lv: '⭐ 쉬움', goal: '공이 어느 칸에 들어갈지 맞히세요. 여러 칸에 동시에 걸어도 돼요.',
    steps: ['아래 동그란 칩을 눌러 한 번에 놓을 금액을 고르세요.', '숫자 칸이나 빨강/검정, 홀수/짝수 칸을 눌러 칩을 올려놓으세요.', 'SPIN을 누르면 공이 굴러가고, 맞힌 칸의 배당을 받아요.'],
    tip: '쉬운 베팅: 빨강/검정, 홀수/짝수, 1-18/19-36 은 맞히면 2배(확률 약 49%)예요.<br>숫자 하나는 36배지만 확률이 낮아요. 초록 0이 나오면 숫자 베팅 외에는 모두 져요.' },
  baccarat: { lv: '⭐ 쉬움', goal: '실제 카지노와 같은 방식! PLAYER와 BANKER 중 카드 합계(끝자리)가 9에 더 가까운 쪽을 맞히세요.',
    steps: ['칩을 고른 뒤 PLAYER, BANKER, TIE 중 하나를 눌러 베팅하세요. (P PAIR / B PAIR는 선택 사이드벳)', 'DEAL을 누르면 딜러가 카드를 나눠주고, 한 장씩 천천히 열어 보여줘요. 3번째 카드는 정식 룰로 자동 진행돼요.', '맞힌 곳의 배당을 받고, 결과는 전광판의 구슬판·대로에 기록돼요.'],
    tip: '합계는 끝자리만 봐요 (7+8=15 → 5점). A=1점, 10·J·Q·K=0점이고 8~9점은 내추럴(즉시 승부)이에요.<br>PLAYER 1배 · BANKER 0.95배(5% 커미션) · TIE 8배 · 페어(첫 두 장이 같은 숫자) 11배. 타이가 나오면 PLAYER/BANKER 베팅은 돌려받아요.<br>전광판: 구슬판은 결과를 순서대로, 대로는 같은 쪽이 이어지면 아래로 쌓여요. 8장 슈를 쓰고, 컷카드가 나오면 새로 섞어요.' },
  poker: { lv: '⭐⭐ 보통', goal: '카드 5장으로 족보를 만드세요. 잭(J) 이상 원페어부터 돈을 받아요.',
    steps: ['베팅액을 정하고 DEAL을 눌러 카드 5장을 받으세요.', '남기고 싶은 카드를 HOLD 버튼(또는 카드를 직접 클릭)으로 선택하세요.', 'DRAW를 누르면 HOLD 안 한 카드만 새로 바뀌고 족보가 계산돼요.'],
    tip: '같은 숫자가 있는 카드, 같은 무늬 5장, 이어지는 숫자는 남기는 게 좋아요.<br>족보 높은 순: 로열플러시 800배 · 스플 50 · 포카드 25 · 풀하우스 9 · 플러시 6 · 스트레이트 4 · 트리플 3 · 투페어 2 · 잭 이상 원페어 1배' },
  sicbo: { lv: '⭐⭐ 보통', goal: '주사위 3개의 결과를 예측하세요. 합계가 큰지(대) 작은지(소)만 맞혀도 돼요.',
    steps: ['칩을 고른 뒤 소(4~10) 또는 대(11~17) 같은 칸을 눌러 베팅하세요.', 'ROLL을 누르면 주사위가 굴러가요.', '맞힌 칸의 배당을 받아요.'],
    tip: '가장 쉬운 건 소/대(1배)예요. 단일 숫자는 그 숫자가 나온 주사위 개수만큼 배당을 줘요.<br>3개가 모두 같은 숫자(트리플)면 소/대는 모두 지고, "올 트리플"에 걸었다면 30배예요.' },
};
let hintTimer;
const hint = t => { const e = $('#hint'); if (e) e.textContent = t || ''; };
function showHelp(id, first) {
  const g = HELP[id]; if (!g) return;
  $('#helpT').textContent = `${games[id].icon} ${games[id].name} 하는 법`;
  $('#helpB').innerHTML = `<div class="goal">🎯 <b>목표</b> — ${g.goal}</div><ol>${g.steps.map(x => `<li>${x}</li>`).join('')}</ol><div class="tip">💡 ${g.tip}</div>`;
  $('#helpOk').textContent = first ? '알겠어요, 시작!' : '닫기';
  $('#help').style.display = 'flex';
}
$('#helpOk').onclick = () => $('#help').style.display = 'none';
$('#help').addEventListener('pointerdown', e => { if (e.target.id === 'help') $('#help').style.display = 'none'; });

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

$('#menu').innerHTML = Object.values(games).map(g => `<button data-g="${g.id}"><span class="ic">${g.icon}</span><b>${g.name}</b><span class="d">${g.desc}</span><span class="lv">${HELP[g.id].lv}</span></button>`).join('');
$('#chips').innerHTML = CHIPS.map(([v, c]) => `<button class="chip${v === state.chip ? ' sel' : ''}" data-chip="${v}" style="background:${c}">${v}</button>`).join('');

function enter(id) {
  const g = games[id]; if (!g || state.game) return;
  state.game = g; sfx.chip();
  $('#lobby').style.display = 'none'; $('#game').style.display = 'flex'; $('#btnLobby').style.display = '';
  const p = $('#panel'); p.innerHTML = g.html(); g.bind(p);
  camGoal.copy(g.view.pos); lookGoal.copy(g.view.look);
  $('#btnHelp').style.display = '';
  let seen = false; try { seen = localStorage.getItem('help_' + id); localStorage.setItem('help_' + id, '1'); } catch {}
  if (!seen) showHelp(id, true);
}
function leave() {
  const g = state.game;
  if (g && g.busy()) return toast('게임이 진행 중입니다', 'bad');
  if (g && g.clearBets) g.clearBets();
  if (g && g.pending() > 0) toast('진행 중이던 베팅은 반환되었습니다');
  state.game = null; $('#panel').innerHTML = '';
  $('#lobby').style.display = 'block'; $('#game').style.display = 'none'; $('#btnLobby').style.display = 'none'; $('#btnHelp').style.display = 'none'; $('#help').style.display = 'none'; hint('');
}
$('#menu').addEventListener('click', e => { const b = e.target.closest('[data-g]'); if (b) enter(b.dataset.g); });
$('#menu').addEventListener('pointerover', e => { const b = e.target.closest('[data-g]'); hoverYaw = b ? stationAngle(b.dataset.g) : null; });
$('#menu').addEventListener('pointerleave', () => hoverYaw = null);
$('#btnLobby').onclick = leave;
$('#btnHelp').onclick = () => state.game && showHelp(state.game.id, false);
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
