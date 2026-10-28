import { input, resetInput, gameActive } from "./input.js";
import { Player } from "./Player.js";
import { resolvePlayer, overlap } from "./collision.js";

export class Game {
  constructor(canvas, ui) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d");
    this.ctx.imageSmoothingEnabled = false;
    this.W = canvas.width;
    this.H = canvas.height;
    this.ui = ui;

    this.State = { MENU: "menu", PLAYING: "playing", PAUSED: "paused", WIN: "win", LOSE: "lose" };
    this.state = this.State.MENU;

    this.rafId = null;
    this.lastTime = 0;
    this.elapsed = 0;
    this.score = 0;

    this.audioCtx = null;
    this.soundOn = this._loadSoundPref();

    this.RECORD_KEY = "ghostSkeleton.bestTime.v1";
    this.bestTime = this._loadRecord();

    this._buildLevel();

    this.player = new Player(30, this.platforms[0].y - 32);

    this.winAnim = {
      active: false,
      t: 0,
      parts: [],
      assembled: 0,
    };
    this._winTimer = null;

    this._bindUI();

    document.addEventListener("visibilitychange", () => {
      if (document.hidden && this.state === this.State.PLAYING) {
        this.togglePause();
        resetInput();
      }
    });
    window.addEventListener("blur", () => {
      if (this.state === this.State.PLAYING) {
        this.togglePause();
        resetInput();
      }
    });

    this.render();
  }


  //  УРОВЕНЬ

  _buildLevel() {
    this.platforms = [
      { x: 0,    y: 500, w: 200, h: 40 },
      { x: 300,  y: 440, w: 110, h: 20 },
      { x: 500,  y: 380, w: 100, h: 20 },
      { x: 700,  y: 320, w: 110, h: 20 },
      { x: 560,  y: 220, w: 140, h: 20 },
    ];

    this.groundHazard = { x: 200, y: 512, w: 260, h: 28 };

    this.bats = [
      { x: 440, y: 460, w: 34, h: 20, minX: 420, maxX: 480, dx: 70, dir: 1 },
      { x: 640, y: 400, w: 34, h: 20, minX: 620, maxX: 690, dx: 90, dir: -1 },
      { x: 800, y: 250, w: 34, h: 20, minX: 780, maxX: 850, dx: 80, dir: 1 },
    ];

    this.partTemplate = [
      { kind: "skull",  x: 340, y: 400, w: 22, h: 22, taken: false },
      { kind: "ribs",   x: 540, y: 340, w: 22, h: 22, taken: false },
      { kind: "legs",   x: 620, y: 180, w: 22, h: 22, taken: false },
    ];
    this.parts = [];

    this.cave = { x: 810, y: 120, w: 120, h: 100 };
  }

  _resetLevel() {
    this.player.reset(30, this.platforms[0].y - 32);
    this.parts = this.partTemplate.map(p => ({ ...p }));
    this.score = 0;
    this.elapsed = 0;
    this.lastTime = 0;
    this.bats[0].x = 440; this.bats[0].dir = 1;
    this.bats[1].x = 640; this.bats[1].dir = -1;
    this.bats[2].x = 800; this.bats[2].dir = 1;
    this.winAnim = { active: false, t: 0, parts: [], assembled: 0 };
    
    if (this._winTimer) {
      clearTimeout(this._winTimer);
      this._winTimer = null;
    }
    if (this._winRaf) {
      cancelAnimationFrame(this._winRaf);
      this._winRaf = null;
    }
    
    this._updateHUD();
  }


  //  UIшка

  _bindUI() {
    const ui = this.ui;
    ui.startBtn.addEventListener("click", () => {
      if (this.state === this.State.PAUSED) this.togglePause();
      else this.start();
    });
    ui.pauseBtn.addEventListener("click", () => this.togglePause());
    ui.restartBtn.addEventListener("click", () => this.start());

    ui.soundBtn.addEventListener("click", () => {
      this.soundOn = !this.soundOn;
      this._saveSoundPref();
      this._updateSoundBtn();
    });
    this._updateSoundBtn();

    window.addEventListener("keydown", (e) => {
      if (e.key === "Enter" &&
          (this.state === this.State.MENU ||
           this.state === this.State.WIN ||
           this.state === this.State.LOSE)) {
        this.start();
      }
    });
  }

  _updateSoundBtn() {
    const btn = this.ui.soundBtn;
    btn.textContent = this.soundOn ? "ЗВУК: ВКЛ" : "ЗВУК: ВЫКЛ";
    btn.style.background = this.soundOn ? "#6d1f6a" : "#4a2a6a";
  }

  _updateHUD() {
    this.ui.scoreEl.textContent = this.score;
    this.ui.timerEl.textContent = this.elapsed.toFixed(1);
    this.ui.recordEl.textContent = this.bestTime > 0 ? this.bestTime.toFixed(1) : "--";
  }

  showOverlay(title, html, btnLabel) {
    this.ui.overlayTitle.textContent = title;
    this.ui.overlayText.innerHTML = html;
    this.ui.startBtn.textContent = btnLabel;
    this.ui.overlay.classList.remove("hidden");
  }
  hideOverlay() {
    this.ui.overlay.classList.add("hidden");
  }

  //  рекордики
  _loadRecord() {
    try {
      const v = parseFloat(localStorage.getItem(this.RECORD_KEY) || "0");
      return isFinite(v) && v > 0 ? v : 0;
    } catch (_) { return 0; }
  }
  _saveRecord(time) {
    try {
      const prev = this._loadRecord();
      if (prev <= 0 || time < prev) {
        localStorage.setItem(this.RECORD_KEY, time.toFixed(2));
        this.bestTime = time;
      }
    } catch (_) {}
    this._updateHUD();
  }
  _loadSoundPref() {
    try { return localStorage.getItem("ghostSkeleton.sound.v1") !== "off"; }
    catch (_) { return true; }
  }
  _saveSoundPref() {
    try { localStorage.setItem("ghostSkeleton.sound.v1", this.soundOn ? "on" : "off"); }
    catch (_) {}
  }


  //  ЗВУК
  beep(freq, dur = 0.08, type = "square", gain = 0.05) {
    if (!this.soundOn) return;
    try {
      if (!this.audioCtx) this.audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      const osc = this.audioCtx.createOscillator();
      const g = this.audioCtx.createGain();
      osc.type = type;
      osc.frequency.value = freq;
      g.gain.value = gain;
      osc.connect(g).connect(this.audioCtx.destination);
      osc.start();
      osc.stop(this.audioCtx.currentTime + dur);
    } catch (_) {}
  }


playWinMelody() {
  if (!this.soundOn) return;

  const notes = [
    { freq: 523,  time: 0    },  // C5
    { freq: 659,  time: 0.13 },  // E5
    { freq: 784,  time: 0.26 },  // G5
    { freq: 1046, time: 0.40 },  // C6
  ];

  notes.forEach(note => {
    setTimeout(() => {
      this.beep(note.freq, 0.18, "sine", 0.045);  // sine + тише
    }, note.time * 1000);
  });
}

  meow() {
  if (!this.soundOn) return;

  try {
    if (!this.audioCtx) {
      this.audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    }
    const ctx = this.audioCtx;
    const now = ctx.currentTime;

    
    const osc1 = ctx.createOscillator();
    const osc2 = ctx.createOscillator();
    const gain = ctx.createGain();
    const filter = ctx.createBiquadFilter();

    osc1.type = "triangle";     
    osc2.type = "sine";         

    
    osc1.frequency.setValueAtTime(920, now);
    osc1.frequency.exponentialRampToValueAtTime(410, now + 0.28);

    osc2.frequency.setValueAtTime(940, now);
    osc2.frequency.exponentialRampToValueAtTime(430, now + 0.28);

    
    filter.type = "lowpass";
    filter.frequency.setValueAtTime(1800, now);
    filter.frequency.exponentialRampToValueAtTime(1100, now + 0.25);
    filter.Q.value = 1.2;

    
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(0.28, now + 0.025);
    gain.gain.exponentialRampToValueAtTime(0.12, now + 0.14);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.32);

    osc1.connect(filter);
    osc2.connect(filter);
    filter.connect(gain);
    gain.connect(ctx.destination);

    osc1.start(now);
    osc2.start(now);
    osc1.stop(now + 0.35);
    osc2.stop(now + 0.35);

  } catch (_) {}
}

  //  УПРАВЛЕНИЕ СОСТОЯНИЕМ
  start() {
    this._resetLevel();
    this.state = this.State.PLAYING;
    this.hideOverlay();
    this.ui.pauseBtn.textContent = "ПАУЗА";
    gameActive.value = true;
    resetInput();
    this._startLoop();
  }

  togglePause() {
    if (this.state === this.State.PLAYING) {
      this.state = this.State.PAUSED;
      this._stopLoop();
      gameActive.value = false;
      resetInput();
      this.ui.pauseBtn.textContent = "ПРОДОЛЖИТЬ";
      this.render();
    } else if (this.state === this.State.PAUSED) {
      this.state = this.State.PLAYING;
      gameActive.value = true;
      resetInput();
      this.ui.pauseBtn.textContent = "ПАУЗА";
      this._startLoop();
    }
  }

  //  ЦИКЛ
  _startLoop() {
    if (this.rafId !== null) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
    this.lastTime = 0;
    this.rafId = requestAnimationFrame(this._loop.bind(this));
  }

  _stopLoop() {
    if (this.rafId !== null) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
  }

  _loop(ts) {
    if (this.state !== this.State.PLAYING) {
      this.rafId = null;
      return;
    }
    if (!this.lastTime) this.lastTime = ts;
    let dt = (ts - this.lastTime) / 1000;
    this.lastTime = ts;

    if (dt > 0.05) dt = 0.05;
    if (dt < 0) dt = 0;

    this.update(dt);
    this.render();

    if (this.state === this.State.PLAYING) {
      this.rafId = requestAnimationFrame(this._loop.bind(this));
    } else {
      this.rafId = null;
    }
  }


  //  обновление

  update(dt) {
    for (const b of this.bats) {
      b.x += b.dx * b.dir * dt;
      if (b.x <= b.minX) { b.x = b.minX; b.dir = 1; }
      if (b.x >= b.maxX) { b.x = b.maxX; b.dir = -1; }
    }

    const prev = this.player.step(dt);
    const { onGround } = resolvePlayer(this.player, prev, this.platforms, dt);
    this.player.onGround = onGround;

    if (this.player.x < 0) { this.player.x = 0; this.player.vx = 0; }
    if (this.player.x > this.W - this.player.w) {
      this.player.x = this.W - this.player.w;
      this.player.vx = 0;
    }

    if (this.player.y > this.H + 60) {
      this._lose("Призрак растворился в пропасти...");
      return;
    }

    if (overlap(this.player, this.groundHazard)) {
      this._lose("Шипы! Скелетик расстроен.");
      return;
    }

    for (const b of this.bats) {
      if (overlap(this.player, b)) {
        this._lose("Летучая мышь! Слишком опасно.");
        return;
      }
    }

    for (const p of this.parts) {
      if (!p.taken && overlap(this.player, p)) {
        p.taken = true;
        this.score++;
        this.meow();
        this._updateHUD();
      }
    }

    if (this.score >= this.parts.length && overlap(this.player, this.cave)) {
      this._win();
      return;
    }

    this.elapsed += dt;
    this._updateHUD();
  }


  //  вин/луз

  _win() {
    this.state = this.State.WIN;
    this._stopLoop();
    gameActive.value = false;
    resetInput();
    this.playWinMelody();
    setTimeout(() => this.beep(1320, 0.16, "sine", 0.07), 120);
    this._saveRecord(this.elapsed);
    this.render();

    this.winAnim.active = true;
    this.winAnim.t = 0;
    this.winAnim.assembled = 0;

    this.winAnim.parts = this.partTemplate.map((p, i) => ({
      fromX: p.x, fromY: p.y,
      toX: this.cave.x + 20 + i * 22,
      toY: this.cave.y + 55,
      t: -0.25 * i,
    }));

    this._winRaf = requestAnimationFrame(this._winAnimLoop.bind(this));

    if (this._winTimer) clearTimeout(this._winTimer);
    this._winTimer = setTimeout(() => {
      if (this.winAnim.active) {
        this.winAnim.active = false;
        this.showOverlay(
          "СКЕЛЕТИК СПАСЁН",
          `Время: <b>${this.elapsed.toFixed(1)} с</b> · Части: <b>${this.score}/3</b><br>
           Рекорд обновлён. Попробуй быстрее!`,
          "ИГРАТЬ СНОВА"
        );
      }
    }, 3200);
  }

  _winAnimLoop(ts) {
    if (!this.winAnim.active) { this._winRaf = null; return; }
    if (!this._winLast) this._winLast = ts;
    let dt = (ts - this._winLast) / 1000;
    this._winLast = ts;
    if (dt > 0.05) dt = 0.05;
    this.winAnim.t += dt;

    let assembled = 0;
    for (const p of this.winAnim.parts) {
      p.t += dt;
      if (p.t >= 0.4) assembled = Math.max(assembled, this.winAnim.parts.filter(x => x.t >= 0.4).length);
    }
    this.winAnim.assembled = assembled;

    this.render();
    this._winRaf = requestAnimationFrame(this._winAnimLoop.bind(this));
  }

  _lose(reason) {
    this.state = this.State.LOSE;
    this._stopLoop();
    gameActive.value = false;
    resetInput();
    this.beep(180, 0.25, "sawtooth", 0.045);
    this.render();
    this.showOverlay(
      "ПОРАЖЕНИЕ",
      `${reason}<br>Собрано частей: <b>${this.score}/3</b>`,
      "ПОПРОБОВАТЬ СНОВА"
    );
  }
 
  px(x, y, size, color) {
    this.ctx.fillStyle = color;
    this.ctx.fillRect(Math.floor(x), Math.floor(y), size, size);
  }


  //  рендер

  render() {
    const ctx = this.ctx;

    this._drawBackground();
    this._drawPlatforms();
    this._drawGroundHazard();
    for (const b of this.bats) this._drawBat(b);
    for (const p of this.parts) this._drawPart(p);
    this._drawCave();
    this._drawPlayer();

    if (this.winAnim.active) this._drawWinAnim();

    if (this.state === this.State.PAUSED) {
      ctx.fillStyle = "rgba(8,4,16,0.75)";
      ctx.fillRect(0, 0, this.W, this.H);
      ctx.fillStyle = "#b47aff";
      ctx.font = "28px 'Press Start 2P', monospace";
      ctx.textAlign = "center";
      ctx.fillText("ПАУЗА", this.W / 2, this.H / 2);
      ctx.fillStyle = "#8a7aa0";
      ctx.font = "10px 'Press Start 2P', monospace";
      ctx.fillText("ESC — ПРОДОЛЖИТЬ", this.W / 2, this.H / 2 + 40);
    }
  }

//фон

_drawBackground() {
  const ctx = this.ctx;
  const W = this.W;
  const H = this.H;
  ctx.fillStyle = "#06030c";
  ctx.fillRect(0, 0, W, H);

  ctx.fillStyle = "#0b0614";
  ctx.fillRect(0, 0, W, Math.floor(H * 0.28));

  ctx.fillStyle = "#110a1f";
  ctx.fillRect(0, Math.floor(H * 0.28), W, Math.floor(H * 0.22));

  ctx.fillStyle = "#1a1030";
  ctx.fillRect(0, Math.floor(H * 0.50), W, Math.floor(H * 0.25));

  ctx.fillStyle = "#24163c";
  ctx.fillRect(0, Math.floor(H * 0.75), W, Math.floor(H * 0.25));


  const stars = [
    [55,28,3],[145,48,3],[275,22,3],[410,65,3],[555,32,3],[695,55,3],
    [95,95,2],[230,85,2],[370,105,2],[510,80,2],[650,100,2],[790,90,2],[910,75,2],
    [45,145,2],[185,155,2],[325,135,2],[465,165,2],[605,140,2],[745,150,2],[885,160,2],
    [85,42,1],[195,35,1],[315,60,1],[445,28,1],[575,48,1],[715,33,1],[845,65,1],
    [125,125,1],[255,115,1],[395,145,1],[535,120,1],[675,135,1],[815,125,1],[935,105,1],
    [65,195,1],[155,205,1],[295,185,1],[435,215,1],[575,195,1],[715,210,1],[855,200,1],
    [40,245,1],[205,265,1],[365,235,1],[505,255,1],[645,245,1],[785,265,1],[925,250,1],
    [110,70,1],[340,40,1],[480,55,1],[620,25,1],[760,70,1],[900,50,1]
  ];

  for (const [sx, sy, size] of stars) {
    if (size >= 3) {
      this.px(sx, sy, 3, "#f2eaff");
      this.px(sx + 3, sy, 2, "#a090c0");
    } else if (size === 2) {
      this.px(sx, sy, 2, "#ddd0f5");
      this.px(sx + 2, sy, 1, "#8070a0");
    } else {
      this.px(sx, sy, 1, "#c8b8e0");
    }
  }

  const mx = 80, my = 70;

  ctx.fillStyle = "#f0e6c8";

  const moonRows = [
    [22, 28],
    [16, 40],
    [12, 48],
    [8,  56],
    [6,  60],
    [4,  64],
    [2,  68],
    [2,  68],
    [0,  72],
    [0,  72],
    [0,  72],
    [0,  72],
    [0,  72],
    [0,  72],
    [2,  68],
    [2,  68],
    [4,  64],
    [6,  60],
    [8,  56],
    [12, 48],
    [16, 40],
    [22, 28],
  ];

  for (let i = 0; i < moonRows.length; i++) {
    const [start, w] = moonRows[i];
    ctx.fillRect(mx + start, my + i * 2, w, 2);
  }

 
  ctx.fillStyle = "#d4c4a0";
  ctx.fillRect(mx + 14, my + 12, 10, 7);
  ctx.fillRect(mx + 46, my + 10,  9, 7);
  ctx.fillRect(mx + 12, my + 34,  8, 7);
  ctx.fillRect(mx + 48, my + 32, 10, 8);
  ctx.fillRect(mx + 30, my + 46,  8, 6);
  ctx.fillRect(mx + 40, my + 20,  7, 6);
  ctx.fillRect(mx + 20, my + 26,  6, 5);

  
  ctx.fillStyle = "#2a1a10";

  
  ctx.fillRect(mx + 16, my + 18, 12, 2);
  ctx.fillRect(mx + 17, my + 20, 10, 2);
  ctx.fillRect(mx + 18, my + 22, 8, 2);
  ctx.fillRect(mx + 19, my + 24, 6, 2);

  
  ctx.fillRect(mx + 44, my + 18, 12, 2);
  ctx.fillRect(mx + 45, my + 20, 10, 2);
  ctx.fillRect(mx + 46, my + 22, 8, 2);
  ctx.fillRect(mx + 47, my + 24, 6, 2);

  
  ctx.fillRect(mx + 22, my + 32, 28, 2);
  ctx.fillRect(mx + 20, my + 34, 5, 2);
  ctx.fillRect(mx + 47, my + 34, 5, 2);
  
  ctx.fillRect(mx + 24, my + 34, 3, 2);
  ctx.fillRect(mx + 30, my + 34, 3, 2);
  ctx.fillRect(mx + 36, my + 34, 3, 2);
  ctx.fillRect(mx + 42, my + 34, 3, 2);
}

  _drawPlatforms() {
    const ctx = this.ctx;
    for (const p of this.platforms) {
      ctx.fillStyle = "#4a3a5a";
      ctx.fillRect(p.x, p.y, p.w, 4);
      ctx.fillStyle = "#2a1a3a";
      ctx.fillRect(p.x, p.y + 4, p.w, p.h - 4);
      ctx.fillStyle = "#1a0e28";
      for (let tx = p.x + 4; tx < p.x + p.w - 4; tx += 12) {
        for (let ty = p.y + 8; ty < p.y + p.h - 4; ty += 10) {
          if ((tx + ty) % 3 === 0) ctx.fillRect(tx, ty, 4, 4);
        }
      }
      ctx.fillStyle = "#0d0714";
      ctx.fillRect(p.x, p.y + p.h - 3, p.w, 3);
    }
  }

  _drawGroundHazard() {
    const ctx = this.ctx;
    const { x, y, w, h } = this.groundHazard;
    ctx.fillStyle = "#3a0e0e";
    ctx.fillRect(x, y + 12, w, h - 12);
    for (let i = 0; i <= w - 16; i += 16) {
      const bx = x + i;
      ctx.fillStyle = "#a0a0b0";
      ctx.fillRect(bx + 6,  y + 6,  4, 8);
      ctx.fillRect(bx + 4,  y + 10, 8, 4);
      ctx.fillRect(bx + 2,  y + 12, 12, 4);
      ctx.fillStyle = "#6a6a80";
      ctx.fillRect(bx + 6,  y + 6,  2, 8);
    }
  }

  _drawBat(b) {
    const ctx = this.ctx;
    const x = Math.floor(b.x);
    const y = Math.floor(b.y);
    const flap = Math.floor(this.elapsed * 10) % 2 === 0;

    ctx.fillStyle = "#3a1a4a";
    ctx.fillRect(x + 10, y + 6, 14, 10);
    ctx.fillRect(x + 12, y + 2, 10, 6);
    ctx.fillRect(x + 12, y - 2, 3, 4);
    ctx.fillRect(x + 19, y - 2, 3, 4);
    
    ctx.fillStyle = "#ff3a3a";
    ctx.fillRect(x + 14, y + 4, 2, 2);
    ctx.fillRect(x + 19, y + 4, 2, 2);
    
    ctx.fillStyle = "#2a0e3a";
    if (flap) {
      ctx.fillRect(x,      y + 2, 10, 4);
      ctx.fillRect(x,      y + 6, 6,  4);
      ctx.fillRect(x + 24, y + 2, 10, 4);
      ctx.fillRect(x + 28, y + 6, 6,  4);
    } else {
      ctx.fillRect(x,      y + 6, 10, 6);
      ctx.fillRect(x + 24, y + 6, 10, 6);
    }
  }

  _drawPart(p) {
    if (p.taken) return;
    const ctx = this.ctx;
    const x = Math.floor(p.x);
    const y = Math.floor(p.y) + Math.floor(Math.sin(this.elapsed * 4 + x) * 2);

    
    ctx.fillStyle = "#e0d8c8";
    if (p.kind === "skull") {
      ctx.fillRect(x + 4, y + 2, 14, 12);
      ctx.fillRect(x + 6, y + 14, 10, 4);
      ctx.fillRect(x + 8, y + 18, 6, 3);
      ctx.fillStyle = "#1a0e28";
      ctx.fillRect(x + 6, y + 6, 3, 4);
      ctx.fillRect(x + 13, y + 6, 3, 4);
      ctx.fillRect(x + 10, y + 11, 2, 2);
      ctx.fillRect(x + 8, y + 15, 1, 2);
      ctx.fillRect(x + 10, y + 15, 1, 2);
      ctx.fillRect(x + 12, y + 15, 1, 2);
    } else if (p.kind === "ribs") {
      ctx.fillRect(x + 2, y + 2, 2, 18);
      ctx.fillRect(x + 4, y + 4, 14, 2);
      ctx.fillRect(x + 4, y + 9, 14, 2);
      ctx.fillRect(x + 4, y + 14, 14, 2);
      ctx.fillRect(x + 16, y + 4, 2, 2);
      ctx.fillRect(x + 16, y + 9, 2, 2);
      ctx.fillRect(x + 16, y + 14, 2, 2);
    } else if (p.kind === "legs") {
      ctx.fillRect(x + 4, y + 2, 3, 12);
      ctx.fillRect(x + 14, y + 2, 3, 12);
      ctx.fillRect(x + 2, y + 14, 7, 3);
      ctx.fillRect(x + 12, y + 14, 7, 3);
      ctx.fillRect(x + 2, y + 17, 3, 3);
      ctx.fillRect(x + 17, y + 17, 3, 3);
    }
  }

  _drawCave() {
    const ctx = this.ctx;
    const { x, y, w, h } = this.cave;
    const unlocked = this.score >= this.parts.length;

    ctx.fillStyle = "#2a1a3a";
    ctx.fillRect(x, y + 20, w, h - 20);
    for (let i = 0; i < w; i += 20) {
      ctx.fillRect(x + i, y + 12, 14, 12);
      ctx.fillRect(x + i + 4, y + 4, 8, 8);
    }
    ctx.fillStyle = "#0a0510";
    ctx.fillRect(x + 20, y + 40, w - 40, h - 40);
    ctx.fillRect(x + 28, y + 32, w - 56, 8);
    ctx.fillRect(x + 36, y + 26, w - 72, 6);

    if (unlocked) {
      ctx.fillStyle = "#b47aff";
      ctx.fillRect(x + 32, y + 50, w - 64, 4);
    }
  }

  //  призрааак
 
  _drawPlayer() {
    const ctx = this.ctx;
    const pl = this.player;
    const x = Math.floor(pl.x);
    const y = Math.floor(pl.y);
    const f = pl.facing;

    const wave = Math.floor(Math.sin(this.elapsed * 6) * 2);

    ctx.fillStyle = "#e0d8f0";
    ctx.fillRect(x + 4, y, pl.w - 8, 4);
    ctx.fillRect(x + 2, y + 4, pl.w - 4, 4);
    ctx.fillRect(x, y + 8, pl.w, pl.h - 16);
    
    const bottom = y + pl.h - 8 + wave;
    for (let i = 0; i < pl.w; i += 6) {
      ctx.fillRect(x + i, bottom, 4, 4);
    }
    ctx.fillRect(x, y + pl.h - 16, pl.w, 8);

    ctx.fillStyle = "#1a0e28";
    if (f === 1) {
      ctx.fillRect(x + 8,  y + 8, 4, 6);
      ctx.fillRect(x + 18, y + 8, 4, 6);
      ctx.fillStyle = "#b47aff";
      ctx.fillRect(x + 9,  y + 9, 2, 2);
      ctx.fillRect(x + 19, y + 9, 2, 2);
    } else {
      ctx.fillRect(x + pl.w - 12, y + 8, 4, 6);
      ctx.fillRect(x + pl.w - 22, y + 8, 4, 6);
      ctx.fillStyle = "#b47aff";
      ctx.fillRect(x + pl.w - 11, y + 9, 2, 2);
      ctx.fillRect(x + pl.w - 21, y + 9, 2, 2);
    }

    ctx.fillStyle = "#1a0e28";
    ctx.fillRect(x + pl.w / 2 - 2, y + 16, 4, 3);
  }

//анимка вин

  _drawWinAnim() {
    const ctx = this.ctx;
    const wa = this.winAnim;


    const cx = this.cave.x + this.cave.w / 2;
    const cy = this.cave.y + 55;

    for (let i = 0; i < wa.parts.length; i++) {
      const p = wa.parts[i];
      if (p.t < 0) continue;
      const tt = Math.min(p.t / 0.4, 1);
      const ease = tt * tt * (3 - 2 * tt);
      const fx = p.fromX + (p.toX - p.fromX) * ease;
      const fy = p.fromY + (p.toY - p.fromY) * ease - Math.sin(ease * Math.PI) * 60;

      if (tt < 1) {
        ctx.fillStyle = "#e0d8c8";
        ctx.fillRect(Math.floor(fx), Math.floor(fy), 14, 14);
        ctx.fillStyle = "#1a0e28";
        ctx.fillRect(Math.floor(fx) + 3, Math.floor(fy) + 4, 3, 3);
        ctx.fillRect(Math.floor(fx) + 8, Math.floor(fy) + 4, 3, 3);
        
        if (Math.floor(wa.t * 20) % 3 === 0) {
          ctx.fillStyle = "#b47aff";
          ctx.fillRect(Math.floor(fx) - 4, Math.floor(fy) - 4, 3, 3);
          ctx.fillRect(Math.floor(fx) + 16, Math.floor(fy) + 16, 3, 3);
        }
      }
    }

    if (wa.assembled >= 1) {
      this._drawSkeleton(cx, cy - 40, wa.assembled);
    }
  }

  _drawSkeleton(cx, cy, parts) {
    const ctx = this.ctx;
    const x = Math.floor(cx - 16);
    const y = Math.floor(cy);

    ctx.fillStyle = "#e0d8c8";

    if (parts >= 1) {
      ctx.fillRect(x + 8, y, 16, 14);
      ctx.fillRect(x + 10, y + 14, 12, 4);
      ctx.fillRect(x + 12, y + 18, 8, 3);
      
      ctx.fillStyle = "#1a0e28";
      ctx.fillRect(x + 11, y + 4, 3, 4);
      ctx.fillRect(x + 18, y + 4, 3, 4);
      ctx.fillRect(x + 14, y + 10, 2, 2);
      for (let i = 0; i < 4; i++) ctx.fillRect(x + 12 + i * 2, y + 15, 1, 2);
      
      ctx.fillStyle = "#e0d8c8";
    }

    if (parts >= 2) {
      ctx.fillRect(x + 15, y + 22, 2, 18);
      for (let i = 0; i < 3; i++) {
        const ry = y + 26 + i * 5;
        ctx.fillRect(x + 8,  ry, 16, 2);
        ctx.fillRect(x + 8,  ry, 2,  2);
        ctx.fillRect(x + 22, ry, 2,  2);
      }
      ctx.fillRect(x + 4,  y + 24, 2, 12);
      ctx.fillRect(x + 26, y + 24, 2, 12);
      ctx.fillRect(x + 2,  y + 34, 4, 2);
      ctx.fillRect(x + 26, y + 34, 4, 2);
    }

    if (parts >= 3) {
      ctx.fillRect(x + 11, y + 40, 10, 3);
      ctx.fillRect(x + 12, y + 43, 3, 12);
      ctx.fillRect(x + 19, y + 43, 3, 12);
      ctx.fillRect(x + 10, y + 54, 5, 3);
      ctx.fillRect(x + 19, y + 54, 5, 3);
    }

    if (parts >= 3) {
      ctx.fillStyle = "#b47aff";
      ctx.fillRect(x + 11, y + 4, 3, 2);
      ctx.fillRect(x + 18, y + 4, 3, 2);
    }
  }
}