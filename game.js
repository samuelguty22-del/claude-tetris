'use strict';

const COLS = 10;
const ROWS = 20;
const BLOCK = 30;

const COLORS = [
  null,
  '#4dd0e1', // I - cyan
  '#ffd54f', // O - yellow
  '#ba68c8', // T - purple
  '#81c784', // S - green
  '#e57373', // Z - red
  '#90caf9', // J - pale blue
  '#ffb74d', // L - orange
];

const PIECES = [
  null,
  [[0,0,0,0],[1,1,1,1],[0,0,0,0],[0,0,0,0]], // I
  [[2,2],[2,2]],                               // O
  [[0,3,0],[3,3,3],[0,0,0]],                  // T
  [[0,4,4],[4,4,0],[0,0,0]],                  // S
  [[5,5,0],[0,5,5],[0,0,0]],                  // Z
  [[6,0,0],[6,6,6],[0,0,0]],                  // J
  [[0,0,7],[7,7,7],[0,0,0]],                  // L
];

const LINE_SCORES = [0, 100, 300, 500, 800];

const canvas = document.getElementById('board');
const ctx = canvas.getContext('2d');
const nextCanvas = document.getElementById('next-canvas');
const nextCtx = nextCanvas.getContext('2d');
const scoreEl = document.getElementById('score');
const linesEl = document.getElementById('lines');
const levelEl = document.getElementById('level');
const overlay = document.getElementById('overlay');
const overlayTitle = document.getElementById('overlay-title');
const overlayScore = document.getElementById('overlay-score');
const restartBtn = document.getElementById('restart-btn');
const themeToggle = document.getElementById('theme-toggle');
const recordsBox = document.getElementById('records-box');
const recordsPanel = document.getElementById('records-panel');

let combo, bestComboRun, recordSaved;
let board, current, next, score, lines, level, paused, gameOver, lastTime, dropAccum, dropInterval, animId;

function createBoard() {
  return Array.from({ length: ROWS }, () => new Array(COLS).fill(0));
}

function randomPiece() {
  const type = Math.floor(Math.random() * 7) + 1;
  const shape = PIECES[type].map(row => [...row]);
  return { type, shape, x: Math.floor(COLS / 2) - Math.floor(shape[0].length / 2), y: 0 };
}

function collide(shape, ox, oy) {
  for (let r = 0; r < shape.length; r++) {
    for (let c = 0; c < shape[r].length; c++) {
      if (!shape[r][c]) continue;
      const nx = ox + c;
      const ny = oy + r;
      if (nx < 0 || nx >= COLS || ny >= ROWS) return true;
      if (ny >= 0 && board[ny][nx]) return true;
    }
  }
  return false;
}

function rotateCW(shape) {
  const rows = shape.length, cols = shape[0].length;
  const result = Array.from({ length: cols }, () => new Array(rows).fill(0));
  for (let r = 0; r < rows; r++)
    for (let c = 0; c < cols; c++)
      result[c][rows - 1 - r] = shape[r][c];
  return result;
}

function tryRotate() {
  const rotated = rotateCW(current.shape);
  const kicks = [0, -1, 1, -2, 2];
  for (const kick of kicks) {
    if (!collide(rotated, current.x + kick, current.y)) {
      current.shape = rotated;
      current.x += kick;
      return;
    }
  }
}

function merge() {
  for (let r = 0; r < current.shape.length; r++)
    for (let c = 0; c < current.shape[r].length; c++)
      if (current.shape[r][c])
        board[current.y + r][current.x + c] = current.shape[r][c];
}

function clearLines() {
  let cleared = 0;
  for (let r = ROWS - 1; r >= 0; r--) {
    if (board[r].every(v => v !== 0)) {
      board.splice(r, 1);
      board.unshift(new Array(COLS).fill(0));
      cleared++;
      r++;
    }
  }
  if (cleared) combo++; else combo = 0;
  if (combo > bestComboRun) bestComboRun = combo;
  if (cleared) {
    lines += cleared;
    score += (LINE_SCORES[cleared] || 0) * level;
    level = Math.floor(lines / 10) + 1;
    dropInterval = Math.max(100, 1000 - (level - 1) * 90);
    updateHUD();
  }
}

function ghostY() {
  let gy = current.y;
  while (!collide(current.shape, current.x, gy + 1)) gy++;
  return gy;
}

function hardDrop() {
  const gy = ghostY();
  score += (gy - current.y) * 2;
  current.y = gy;
  lockPiece();
}

function softDrop() {
  if (!collide(current.shape, current.x, current.y + 1)) {
    current.y++;
    score += 1;
    updateHUD();
  } else {
    lockPiece();
  }
}

function lockPiece() {
  merge();
  clearLines();
  spawn();
}

function spawn() {
  current = next;
  next = randomPiece();
  if (collide(current.shape, current.x, current.y)) {
    endGame();
  }
  drawNext();
}

function updateHUD() {
  scoreEl.textContent = score.toLocaleString();
  linesEl.textContent = lines;
  levelEl.textContent = level;
}

function drawBlock(context, x, y, colorIndex, size, alpha) {
  if (!colorIndex) return;
  const color = COLORS[colorIndex];
  context.globalAlpha = alpha ?? 1;
  context.fillStyle = color;
  context.fillRect(x * size + 1, y * size + 1, size - 2, size - 2);
  // highlight
  context.fillStyle = 'rgba(255,255,255,0.12)';
  context.fillRect(x * size + 1, y * size + 1, size - 2, 4);
  context.globalAlpha = 1;
}

function drawGrid() {
  ctx.strokeStyle = getComputedStyle(document.documentElement).getPropertyValue('--grid').trim();
  ctx.lineWidth = 0.5;
  for (let c = 1; c < COLS; c++) {
    ctx.beginPath();
    ctx.moveTo(c * BLOCK, 0);
    ctx.lineTo(c * BLOCK, ROWS * BLOCK);
    ctx.stroke();
  }
  for (let r = 1; r < ROWS; r++) {
    ctx.beginPath();
    ctx.moveTo(0, r * BLOCK);
    ctx.lineTo(COLS * BLOCK, r * BLOCK);
    ctx.stroke();
  }
}

function draw() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  drawGrid();

  // board
  for (let r = 0; r < ROWS; r++)
    for (let c = 0; c < COLS; c++)
      drawBlock(ctx, c, r, board[r][c], BLOCK);

  // ghost
  const gy = ghostY();
  for (let r = 0; r < current.shape.length; r++)
    for (let c = 0; c < current.shape[r].length; c++)
      if (current.shape[r][c])
        drawBlock(ctx, current.x + c, gy + r, current.shape[r][c], BLOCK, 0.2);

  // current piece
  for (let r = 0; r < current.shape.length; r++)
    for (let c = 0; c < current.shape[r].length; c++)
      drawBlock(ctx, current.x + c, current.y + r, current.shape[r][c], BLOCK);
}

function drawNext() {
  const NB = 30;
  nextCtx.clearRect(0, 0, nextCanvas.width, nextCanvas.height);
  const shape = next.shape;
  const offX = Math.floor((4 - shape[0].length) / 2);
  const offY = Math.floor((4 - shape.length) / 2);
  for (let r = 0; r < shape.length; r++)
    for (let c = 0; c < shape[r].length; c++)
      drawBlock(nextCtx, offX + c, offY + r, shape[r][c], NB);
}

function endGame() {
  gameOver = true;
  cancelAnimationFrame(animId);
  overlayTitle.textContent = 'GAME OVER';
  overlayScore.textContent = `Puntuación: ${score.toLocaleString()}`;
  overlay.classList.remove('hidden');
  finishRecords();
}

function togglePause() {
  if (gameOver) return;
  paused = !paused;
  if (!paused) {
    lastTime = performance.now();
    loop(lastTime);
  } else {
    cancelAnimationFrame(animId);
    overlayTitle.textContent = 'PAUSA';
    overlayScore.textContent = '';
    recordsBox.hidden = true;
    overlay.classList.remove('hidden');
  }
}

function loop(ts) {
  const dt = ts - lastTime;
  lastTime = ts;
  dropAccum += dt;
  if (dropAccum >= dropInterval) {
    dropAccum = 0;
    if (!collide(current.shape, current.x, current.y + 1)) {
      current.y++;
    } else {
      lockPiece();
    }
  }
  draw();
  animId = requestAnimationFrame(loop);
}

function init() {
  board = createBoard();
  score = 0;
  lines = 0;
  level = 1;
  paused = false;
  gameOver = false;
  dropInterval = 1000;
  dropAccum = 0;
  combo = 0;
  bestComboRun = 0;
  recordSaved = false;
  recordsBox.hidden = true;
  lastTime = performance.now();
  next = randomPiece();
  spawn();
  updateHUD();
  renderRecords(recordsPanel, -1);
  overlay.classList.add('hidden');
  cancelAnimationFrame(animId);
  animId = requestAnimationFrame(loop);
}

document.addEventListener('keydown', e => {
  if (e.target && e.target.tagName === 'INPUT') return;
  if (e.code === 'KeyP') { togglePause(); return; }
  if (paused || gameOver) return;
  switch (e.code) {
    case 'ArrowLeft':
      if (!collide(current.shape, current.x - 1, current.y)) current.x--;
      break;
    case 'ArrowRight':
      if (!collide(current.shape, current.x + 1, current.y)) current.x++;
      break;
    case 'ArrowDown':
      softDrop();
      break;
    case 'ArrowUp':
    case 'KeyX':
      tryRotate();
      break;
    case 'Space':
      e.preventDefault();
      hardDrop();
      break;
  }
  updateHUD();
});

restartBtn.addEventListener('click', init);

themeToggle.addEventListener('click', () => {
  const root = document.documentElement;
  const light = root.dataset.theme !== 'light';
  root.dataset.theme = light ? 'light' : 'dark';
  themeToggle.textContent = light ? 'Modo oscuro' : 'Modo claro';
  themeToggle.setAttribute('aria-pressed', String(light));
  themeToggle.blur(); // evita que Space (caída) active el botón
  if (paused || gameOver) draw();
});

// ---- Records ----
const RECORDS_KEY = 'tetris-records';
const MAX_RECORDS = 5;
const NAME_MAX = 12;
const DEFAULT_NAME = 'Anónimo';

function defaultRecords() {
  return { scores: [], bestCombo: 0, maxLines: 0 };
}

function loadRecords() {
  const rec = defaultRecords();
  try {
    const data = JSON.parse(localStorage.getItem(RECORDS_KEY));
    if (data && typeof data === 'object') {
      if (Array.isArray(data.scores)) {
        rec.scores = data.scores
          .filter(e => e && Number.isFinite(e.score))
          .map(e => ({ name: String(e.name || DEFAULT_NAME).slice(0, NAME_MAX), score: e.score }))
          .sort((a, b) => b.score - a.score)
          .slice(0, MAX_RECORDS);
      }
      if (Number.isFinite(data.bestCombo)) rec.bestCombo = data.bestCombo;
      if (Number.isFinite(data.maxLines)) rec.maxLines = data.maxLines;
    }
  } catch (e) { /* JSON corrupto o localStorage no disponible */ }
  return rec;
}

function saveRecords(rec) {
  try { localStorage.setItem(RECORDS_KEY, JSON.stringify(rec)); } catch (e) { /* ignorar */ }
}

function qualifiesForTop(rec) {
  return score > 0 && (rec.scores.length < MAX_RECORDS || score > rec.scores[rec.scores.length - 1].score);
}

function el(tag, text, cls) {
  const n = document.createElement(tag);
  if (text !== undefined) n.textContent = text;
  if (cls) n.className = cls;
  return n;
}

function renderRecords(container, highlight) {
  const rec = loadRecords();
  container.replaceChildren();
  container.appendChild(el('span', 'RECORDS', 'label'));
  const ol = el('ol', undefined, 'records-list');
  if (!rec.scores.length) ol.appendChild(el('li', 'Sin records', 'records-empty'));
  rec.scores.forEach((e, i) => {
    const li = el('li', undefined, i === highlight ? 'records-hl' : '');
    li.appendChild(el('span', `${i + 1}. ${e.name}`));
    li.appendChild(el('span', e.score.toLocaleString()));
    ol.appendChild(li);
  });
  container.appendChild(ol);
  container.appendChild(el('p', `Mejor combo: ${rec.bestCombo}`, 'records-stat'));
  container.appendChild(el('p', `Líneas máx.: ${rec.maxLines}`, 'records-stat'));
  const btn = el('button', 'Resetear records', 'records-reset');
  btn.type = 'button';
  container.appendChild(btn);
}

function finishRecords() {
  const rec = loadRecords();
  rec.bestCombo = Math.max(rec.bestCombo, bestComboRun);
  rec.maxLines = Math.max(rec.maxLines, lines);
  saveRecords(rec);
  recordsBox.hidden = false;
  renderRecords(recordsBox, -1);
  renderRecords(recordsPanel, -1);
  if (!recordSaved && qualifiesForTop(rec)) showNameForm();
}

function showNameForm() {
  const form = el('div', undefined, 'records-form');
  form.appendChild(el('p', '¡Entras en el top 5! Tu nombre:'));
  const input = document.createElement('input');
  input.type = 'text';
  input.maxLength = NAME_MAX;
  input.placeholder = DEFAULT_NAME;
  input.setAttribute('aria-label', 'Nombre del jugador');
  const ok = el('button', 'Guardar');
  ok.type = 'button';
  form.append(input, ok);
  recordsBox.prepend(form);
  input.focus();
  const confirmName = () => {
    if (recordSaved) return;
    recordSaved = true;
    const name = input.value.trim().slice(0, NAME_MAX) || DEFAULT_NAME;
    const rec = loadRecords();
    let pos = rec.scores.findIndex(e => e.score < score);
    if (pos === -1) pos = rec.scores.length;
    rec.scores.splice(pos, 0, { name, score });
    rec.scores = rec.scores.slice(0, MAX_RECORDS);
    saveRecords(rec);
    const hl = pos < MAX_RECORDS ? pos : -1;
    renderRecords(recordsBox, hl);
    renderRecords(recordsPanel, hl);
  };
  ok.addEventListener('click', confirmName);
  input.addEventListener('keydown', e => { if (e.key === 'Enter') confirmName(); });
}

document.addEventListener('click', e => {
  if (!e.target.classList || !e.target.classList.contains('records-reset')) return;
  if (!confirm('¿Resetear todos los records?')) return;
  try { localStorage.removeItem(RECORDS_KEY); } catch (err) { /* ignorar */ }
  renderRecords(recordsPanel, -1);
  if (!recordsBox.hidden) renderRecords(recordsBox, -1);
});

init();
