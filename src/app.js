// Главный контроллер веб-приложения Grandmaster Chess Studio

import {
  ChessEngine,
  START_FEN,
  WHITE,
  BLACK,
  EMPTY,
  PAWN,
  KNIGHT,
  BISHOP,
  ROOK,
  QUEEN,
  KING,
  FLAG_CASTLE_K,
  FLAG_CASTLE_Q,
  FLAG_PROMOTION,
  FLAG_EN_PASSANT,
  sqToAlgebraic
} from './engine.js';
import { DIFFICULTY_PRESETS, MATE_SCORE, evaluateWhitePerspective, detectOpeningName } from './ai.js';
import { getPieceSvg } from './pieces.js';
import { SoundEffects } from './sound.js';
import { getBackendUrls } from './config.js';

const PRESET_FENS = {
  start: START_FEN,
  italian_tactics: 'r1bqk2r/pppp1ppp/2n2n2/2b1p3/2B1P3/2NP1N2/PPP2PPP/R1BQ1RK1 b kq - 2 6',
  mate_puzzle: '4kb1r/p2n1ppp/4q3/4p1B1/4P3/1Q6/PPP2PPP/2KR4 w k - 0 16',
  rook_endgame: '3k4/8/3KP3/8/8/8/5r2/2R5 w - - 0 1',
  pawn_race: '8/p4ppp/8/1P6/8/5k2/5P1P/6K1 w - - 0 1'
};

// DOM элементы
const boardEl = document.getElementById('chessboard');
const arrowSvg = document.getElementById('arrowSvg');
const dragGhost = document.getElementById('dragGhost');
const statusBanner = document.getElementById('statusBanner');

const evalBar = document.getElementById('evalBar');
const evalBarWhite = document.getElementById('evalBarWhite');
const evalScoreLabel = document.getElementById('evalScoreLabel');
const evalChart = document.getElementById('evalChart');

const topPlayerCard = document.getElementById('topPlayerCard');
const bottomPlayerCard = document.getElementById('bottomPlayerCard');
const topPlayerAvatar = document.getElementById('topPlayerAvatar');
const bottomPlayerAvatar = document.getElementById('bottomPlayerAvatar');
const topPlayerName = document.getElementById('topPlayerName');
const bottomPlayerName = document.getElementById('bottomPlayerName');
const topPlayerBadge = document.getElementById('topPlayerBadge');
const bottomPlayerBadge = document.getElementById('bottomPlayerBadge');
const topThinkingBadge = document.getElementById('topThinkingBadge');
const bottomThinkingBadge = document.getElementById('bottomThinkingBadge');
const topCapturedEl = document.getElementById('topCaptured');
const bottomCapturedEl = document.getElementById('bottomCaptured');
const topMaterialDiffEl = document.getElementById('topMaterialDiff');
const bottomMaterialDiffEl = document.getElementById('bottomMaterialDiff');
const topClockEl = document.getElementById('topClock');
const bottomClockEl = document.getElementById('bottomClock');

const promotionPopup = document.getElementById('promotionPopup');
const promotionChoices = document.getElementById('promotionChoices');

const gameOverOverlay = document.getElementById('gameOverOverlay');
const gameOverIcon = document.getElementById('gameOverIcon');
const gameOverTitle = document.getElementById('gameOverTitle');
const gameOverDesc = document.getElementById('gameOverDesc');

const themeSelect = document.getElementById('themeSelect');
const soundToggleBtn = document.getElementById('soundToggleBtn');
const soundIcon = document.getElementById('soundIcon');
const gameModeSelect = document.getElementById('gameModeSelect');
const difficultySelect = document.getElementById('difficultySelect');
const timeControlSelect = document.getElementById('timeControlSelect');
const presetFenSelect = document.getElementById('presetFenSelect');
const activeModeTag = document.getElementById('activeModeTag');

const openingNameEl = document.getElementById('openingName');
const statEvalEl = document.getElementById('statEval');
const statDepthEl = document.getElementById('statDepth');
const statNodesEl = document.getElementById('statNodes');
const statNpsEl = document.getElementById('statNps');
const pvLineEl = document.getElementById('pvLine');

const movesListEl = document.getElementById('movesList');
const moveCountLabel = document.getElementById('moveCountLabel');
const reviewBanner = document.getElementById('reviewBanner');

const fenModal = document.getElementById('fenModal');
const fenInput = document.getElementById('fenInput');
const pgnOutput = document.getElementById('pgnOutput');
const fenFeedback = document.getElementById('fenFeedback');

// Онлайн-мультиплеер DOM элементы
const openOnlineTopBtn = document.getElementById('openOnlineTopBtn');
const netStatusDot = document.getElementById('netStatusDot');
const pingBadge = document.getElementById('pingBadge');
const onlineCard = document.getElementById('onlineCard');
const onlineConnStatus = document.getElementById('onlineConnStatus');
const onlineLobbyView = document.getElementById('onlineLobbyView');
const onlineRoomView = document.getElementById('onlineRoomView');
const onlineNameInput = document.getElementById('onlineNameInput');
const onlineColorSelect = document.getElementById('onlineColorSelect');
const createRoomBtn = document.getElementById('createRoomBtn');
const quickMatchBtn = document.getElementById('quickMatchBtn');
const joinRoomCodeInput = document.getElementById('joinRoomCodeInput');
const joinRoomBtn = document.getElementById('joinRoomBtn');
const onlineErrorMsg = document.getElementById('onlineErrorMsg');
const roomCodeBadge = document.getElementById('roomCodeBadge');
const roomRoleBadge = document.getElementById('roomRoleBadge');
const tunnelTypeBadge = document.getElementById('tunnelTypeBadge');
const inviteUrlInput = document.getElementById('inviteUrlInput');
const copyInviteBtn = document.getElementById('copyInviteBtn');
const drawOfferBanner = document.getElementById('drawOfferBanner');
const acceptDrawBtn = document.getElementById('acceptDrawBtn');
const declineDrawBtn = document.getElementById('declineDrawBtn');
const offerDrawBtn = document.getElementById('offerDrawBtn');
const rematchOnlineBtn = document.getElementById('rematchOnlineBtn');
const leaveRoomBtn = document.getElementById('leaveRoomBtn');
const chatMessagesEl = document.getElementById('chatMessages');
const chatForm = document.getElementById('chatForm');
const chatInput = document.getElementById('chatInput');
const playAgainBtn = document.getElementById('playAgainBtn');

const sound = new SoundEffects();

function getOrCreatePlayerToken() {
  try {
    const saved = localStorage.getItem('chess_arena_token');
    if (saved && saved.length >= 8) return saved;
    const generated = (crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2, 12)}`);
    localStorage.setItem('chess_arena_token', generated);
    return generated;
  } catch {
    return `${Date.now()}-${Math.random().toString(36).slice(2, 12)}`;
  }
}

function getSavedPlayerName() {
  try {
    return localStorage.getItem('chess_arena_name') || 'Игрок';
  } catch {
    return 'Игрок';
  }
}

// Состояние приложения
const state = {
  engine: new ChessEngine(START_FEN),
  startFen: START_FEN,
  timeline: [], // [{ fen, lastMove, san, uci, evalWhite }]
  viewPly: 0,

  mode: 'white', // 'white' | 'black' | 'pvp' | 'aivai' | 'online'
  humanColor: WHITE, // для режима против ИИ
  aiLevel: 4,
  flipped: false,

  selectedSq: -1,
  legalMovesForSelected: [],
  pendingPromotion: null, // { from, to, color }

  hintArrow: null, // { from, to }
  userArrows: [], // [{ from, to }]
  userMarkedSquares: new Set(),

  aiThinking: false,
  activeSearchId: 0,
  customGameOver: null, // { reason, winner, title, desc } при сдаче или флаге времени
  lastShownResultKey: null,

  // Таймеры
  hasClock: false,
  baseTimeMs: 0,
  incrementMs: 0,
  whiteTimeMs: 0,
  blackTimeMs: 0,
  lastTickTs: 0,

  // Онлайн-состояние
  online: {
    ws: null,
    connected: false,
    pingMs: null,
    token: getOrCreatePlayerToken(),
    room: null,
    pendingAction: null,
    networkInfo: { publicUrl: null, lanUrls: [] },
    autoOrientedForRoom: null,
    lastSyncedPlyCount: 0,
    lastFinishedStatus: false
  },

  // Drag & drop
  drag: {
    active: false,
    pointerId: null,
    fromSq: -1,
    moved: false,
    startX: 0,
    startY: 0
  },

  // Правая кнопка мыши (рисование стрелок)
  rightDrag: {
    active: false,
    fromSq: -1
  }
};

// Создаём Web Worker для ИИ
let aiWorker = null;
function initWorker() {
  if (aiWorker) {
    aiWorker.terminate();
  }
  aiWorker = new Worker(new URL('./worker.js', import.meta.url), { type: 'module' });
  aiWorker.onmessage = handleWorkerMessage;
}

function handleWorkerMessage(e) {
  const msg = e.data;
  if (!msg || msg.requestId !== state.activeSearchId) return;

  if (msg.type === 'PROGRESS') {
    updateTelemetryUI({
      scoreWhite: msg.scoreWhite,
      depth: msg.depth,
      nodes: msg.nodes,
      nps: msg.nps,
      pv: msg.pv,
      opening: msg.opening
    });
    return;
  }

  if (msg.type === 'BEST_MOVE') {
    state.aiThinking = false;
    updateThinkingBadges();

    const res = msg.result;
    if (!res || !res.move) return;

    updateTelemetryUI({
      scoreWhite: res.scoreWhite,
      depth: res.book ? 'Книга' : res.depth,
      nodes: res.nodes,
      nps: res.nps,
      pv: res.pv,
      opening: res.opening
    });

    if (msg.kind === 'hint') {
      state.hintArrow = { from: res.move.from, to: res.move.to };
      pvLineEl.textContent = `Рекомендация ИИ: ${res.san} (${(res.pv || []).join(' ')})`;
      renderOverlayArrows();
      return;
    }

    if (msg.kind === 'ai') {
      // В режиме ИИ против ИИ делаем небольшую паузу, чтобы ходы были комфортны для наблюдения
      const delay = state.mode === 'aivai' ? Math.max(220, 420 - (res.elapsedMs || 0)) : 80;
      const expectedId = state.activeSearchId;
      setTimeout(() => {
        if (state.activeSearchId !== expectedId) return;
        executeMoveOnBoard(res.move, res.scoreWhite);
      }, delay);
    }
  }
}

// Форматирование оценки в человекочитаемый вид (+0.45, -1.20, #M3)
function formatEval(scoreWhite) {
  if (Math.abs(scoreWhite) > MATE_SCORE - 100) {
    const pliesToMate = MATE_SCORE - Math.abs(scoreWhite);
    const movesToMate = Math.max(1, Math.ceil(pliesToMate / 2));
    return scoreWhite > 0 ? `#${movesToMate}` : `-#${movesToMate}`;
  }
  const pawns = scoreWhite / 100;
  const sign = pawns > 0 ? '+' : '';
  return `${sign}${pawns.toFixed(2)}`;
}

function formatEvalShort(scoreWhite) {
  if (Math.abs(scoreWhite) > MATE_SCORE - 100) {
    const pliesToMate = MATE_SCORE - Math.abs(scoreWhite);
    const movesToMate = Math.max(1, Math.ceil(pliesToMate / 2));
    return scoreWhite > 0 ? `M${movesToMate}` : `-M${movesToMate}`;
  }
  const pawns = Math.abs(scoreWhite / 100);
  return pawns >= 10 ? pawns.toFixed(0) : pawns.toFixed(1);
}

function updateEvalBar(scoreWhite) {
  let pct = 50;
  if (scoreWhite > MATE_SCORE - 100) {
    pct = 98;
  } else if (scoreWhite < -MATE_SCORE + 100) {
    pct = 2;
  } else {
    // Сигмоида: +400 сентипешек ~ 85% шкалы
    pct = 50 + 50 * (2 / (1 + Math.exp(-0.0042 * scoreWhite)) - 1);
    pct = Math.max(4, Math.min(96, pct));
  }

  evalBar.classList.toggle('flipped', state.flipped);
  evalBarWhite.style.height = `${pct.toFixed(1)}%`;
  evalScoreLabel.textContent = formatEvalShort(scoreWhite);

  const whiteOnBottom = !state.flipped;
  const labelAtTop = (scoreWhite < 0 && whiteOnBottom) || (scoreWhite >= 0 && !whiteOnBottom);
  evalScoreLabel.classList.toggle('dark-advantage', labelAtTop);
}

function updateTelemetryUI({ scoreWhite, depth, nodes, nps, pv, opening }) {
  if (typeof scoreWhite === 'number') {
    statEvalEl.textContent = formatEval(scoreWhite);
    updateEvalBar(scoreWhite);
  }
  if (depth !== undefined) {
    statDepthEl.textContent = String(depth);
  }
  if (typeof nodes === 'number') {
    statNodesEl.textContent = nodes.toLocaleString('ru-RU');
  }
  if (typeof nps === 'number') {
    statNpsEl.textContent = nps > 0 ? `${(nps / 1000).toFixed(0)}k/с` : 'Книга';
  }
  if (Array.isArray(pv) && pv.length > 0) {
    pvLineEl.textContent = pv.join('  ');
  }
  if (opening) {
    openingNameEl.textContent = opening;
  }
}

// Инициализация новой партии (локальной или против ИИ)
function startNewGame(customFen = null, keepOnline = false) {
  if (!keepOnline && state.mode === 'online' && state.online.room) {
    sendWs({ type: 'LEAVE_ROOM' });
    state.online.room = null;
    state.online.autoOrientedForRoom = null;
    renderOnlinePanel();
  }

  state.activeSearchId++;
  state.aiThinking = false;
  state.selectedSq = -1;
  state.legalMovesForSelected = [];
  state.pendingPromotion = null;
  state.hintArrow = null;
  state.userArrows = [];
  state.userMarkedSquares.clear();
  state.customGameOver = null;
  state.lastShownResultKey = null;

  promotionPopup.classList.add('hidden');
  gameOverOverlay.classList.add('hidden');

  // Режим игры
  const rawMode = gameModeSelect.value;
  if (rawMode === 'online') {
    if (!state.online.room) {
      // Переходим в лобби онлайн-игры, не запуская ИИ
      state.mode = 'white';
      state.humanColor = WHITE;
      state.flipped = false;
      activeModeTag.textContent = 'Онлайн-лобби';
      onlineCard.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      onlineNameInput.focus();
    } else {
      state.mode = 'online';
    }
  } else if (rawMode === 'random') {
    state.mode = Math.random() < 0.5 ? 'white' : 'black';
  } else {
    state.mode = rawMode;
  }
  state.aiLevel = parseInt(difficultySelect.value, 10) || 4;

  if (state.mode === 'white') {
    state.humanColor = WHITE;
    state.flipped = false;
    activeModeTag.textContent = 'Вы (Белые) vs ИИ';
  } else if (state.mode === 'black') {
    state.humanColor = BLACK;
    state.flipped = true;
    activeModeTag.textContent = 'Вы (Чёрные) vs ИИ';
  } else if (state.mode === 'pvp') {
    state.humanColor = 0;
    state.flipped = false;
    activeModeTag.textContent = '2 игрока за экраном';
  } else if (state.mode === 'online') {
    activeModeTag.textContent = 'Онлайн (2 игрока)';
  } else {
    state.humanColor = 0;
    state.flipped = false;
    activeModeTag.textContent = 'Демо: ИИ против ИИ';
  }

  // Стартовая позиция
  const chosenPreset = presetFenSelect.value;
  const targetFen = customFen || PRESET_FENS[chosenPreset] || START_FEN;
  state.engine = new ChessEngine(targetFen);
  state.startFen = state.engine.toFen();

  const initialEval = evaluateWhitePerspective(state.engine);
  state.timeline = [
    {
      fen: state.startFen,
      lastMove: null,
      san: null,
      uci: null,
      evalWhite: initialEval
    }
  ];
  state.viewPly = 0;

  // Настройка таймеров
  const tc = timeControlSelect.value;
  if (tc === 'none') {
    state.hasClock = false;
    state.baseTimeMs = 0;
    state.incrementMs = 0;
  } else {
    const [secStr, incStr] = tc.split('+');
    state.hasClock = true;
    state.baseTimeMs = (parseInt(secStr, 10) || 180) * 1000;
    state.incrementMs = (parseInt(incStr, 10) || 0) * 1000;
    state.whiteTimeMs = state.baseTimeMs;
    state.blackTimeMs = state.baseTimeMs;
    state.lastTickTs = performance.now();
  }

  if (aiWorker) {
    aiWorker.postMessage({ type: 'CLEAR' });
  }

  statDepthEl.textContent = '—';
  statNodesEl.textContent = '0';
  statNpsEl.textContent = '—';
  pvLineEl.textContent = 'Партия началась — сделайте ход или нажмите «Подсказка ИИ»';
  openingNameEl.textContent = targetFen === START_FEN ? 'Начальная позиция' : 'Пользовательская позиция';

  renderAll();
  if (state.mode !== 'online') {
    maybeTriggerAIMove();
  }
}

function isLiveView() {
  return state.viewPly === state.timeline.length - 1;
}

function isGameOver() {
  if (state.mode === 'online' && state.online.room) {
    return state.online.room.status === 'finished';
  }
  if (state.customGameOver) return true;
  return state.engine.getGameStatus().over;
}

function canHumanMovePiece(pieceCode) {
  if (!isLiveView() || isGameOver() || state.aiThinking || state.pendingPromotion) return false;
  const pieceColor = pieceCode > 0 ? WHITE : BLACK;
  if (pieceColor !== state.engine.turn) return false;

  if (state.mode === 'online') {
    const room = state.online.room;
    if (!room || room.status !== 'playing') return false;
    return pieceColor === room.myColor;
  }
  if (state.mode === 'aivai') return false;
  if (state.mode === 'pvp') return true;
  return pieceColor === state.humanColor;
}

function getDisplayedEngine() {
  if (isLiveView()) return state.engine;
  const snap = state.timeline[state.viewPly];
  return new ChessEngine(snap.fen);
}

// Преобразование визуального индекса сетки (0..63) в индекс поля движка (0..63) с учётом переворота доски
function visualIdxToSq(vIdx) {
  return state.flipped ? 63 - vIdx : vIdx;
}

function sqToCoordsPercent(sq) {
  const r = sq >> 3;
  const c = sq & 7;
  const vr = state.flipped ? 7 - r : r;
  const vc = state.flipped ? 7 - c : c;
  return {
    x: (vc + 0.5) * 100,
    y: (vr + 0.5) * 100
  };
}

// Инициализация 64 клеток доски один раз, чтобы при ходах и кликах DOM не пересоздавался и доска не дёргалась
const boardCells = [];
function ensureBoardCells() {
  if (boardCells.length === 64) return;
  boardEl.innerHTML = '';
  for (let vIdx = 0; vIdx < 64; vIdx++) {
    const sqEl = document.createElement('div');
    const rankSpan = document.createElement('span');
    rankSpan.className = 'coord-rank hidden';
    const fileSpan = document.createElement('span');
    fileSpan.className = 'coord-file hidden';
    const pieceDiv = document.createElement('div');
    pieceDiv.className = 'piece hidden';
    pieceDiv.dataset.piece = '0';

    sqEl.appendChild(rankSpan);
    sqEl.appendChild(fileSpan);
    sqEl.appendChild(pieceDiv);
    boardEl.appendChild(sqEl);
    boardCells.push({ sqEl, rankSpan, fileSpan, pieceDiv });
  }
}

// Отрисовка шахматной доски без пересоздания DOM-элементов
function renderBoard() {
  ensureBoardCells();

  const dispEngine = getDisplayedEngine();
  const snap = state.timeline[state.viewPly];
  const lastMove = snap ? snap.lastMove : null;
  const inCheck = dispEngine.inCheck();
  const checkedKingSq = inCheck
    ? (dispEngine.turn === WHITE ? dispEngine.whiteKingSq : dispEngine.blackKingSq)
    : -1;

  const legalTargets = new Map();
  if (isLiveView() && state.selectedSq !== -1) {
    for (const m of state.legalMovesForSelected) {
      legalTargets.set(m.to, m);
    }
  }

  const files = 'abcdefgh';
  const ranks = '87654321';

  for (let vIdx = 0; vIdx < 64; vIdx++) {
    const vr = vIdx >> 3;
    const vc = vIdx & 7;
    const sq = visualIdxToSq(vIdx);
    const r = sq >> 3;
    const c = sq & 7;
    const cell = boardCells[vIdx];
    const { sqEl, rankSpan, fileSpan, pieceDiv } = cell;

    const isLight = ((r + c) & 1) === 0;
    const classes = ['square', isLight ? 'light' : 'dark'];

    if (lastMove && (sq === lastMove.from || sq === lastMove.to)) {
      classes.push('last-move');
    }
    if (isLiveView() && sq === state.selectedSq) {
      classes.push('selected');
    }
    if (state.userMarkedSquares.has(sq)) {
      classes.push('user-marked');
    }
    if (sq === checkedKingSq) {
      classes.push('in-check');
    }

    const legalMove = legalTargets.get(sq);
    if (legalMove) {
      const isCap = dispEngine.board[sq] !== EMPTY || legalMove.flags === FLAG_EN_PASSANT;
      classes.push(isCap ? 'legal-capture' : 'legal-move');
    }

    const nextClassName = classes.join(' ');
    if (sqEl.className !== nextClassName) {
      sqEl.className = nextClassName;
    }
    sqEl.dataset.sq = String(sq);

    if (vc === 0) {
      rankSpan.textContent = ranks[r];
      rankSpan.classList.remove('hidden');
    } else {
      rankSpan.classList.add('hidden');
    }

    if (vr === 7) {
      fileSpan.textContent = files[c];
      fileSpan.classList.remove('hidden');
    } else {
      fileSpan.classList.add('hidden');
    }

    const pieceCode = dispEngine.board[sq];
    const pieceStr = String(pieceCode);
    if (pieceCode !== EMPTY) {
      if (pieceDiv.dataset.piece !== pieceStr) {
        pieceDiv.dataset.piece = pieceStr;
        pieceDiv.innerHTML = getPieceSvg(pieceCode);
      }
      pieceDiv.classList.remove('hidden');
      const isDragSrc = state.drag.active && state.drag.moved && state.drag.fromSq === sq;
      pieceDiv.classList.toggle('dragging-source', isDragSrc);
    } else {
      if (pieceDiv.dataset.piece !== '0') {
        pieceDiv.dataset.piece = '0';
        pieceDiv.innerHTML = '';
      }
      pieceDiv.classList.add('hidden');
      pieceDiv.classList.remove('dragging-source');
    }
  }

  renderOverlayArrows();
}

// Рисование SVG-стрелок (подсказка ИИ + пользовательские тактические стрелки)
function renderOverlayArrows() {
  let svgHtml = `
    <defs>
      <marker id="arrowhead-hint" markerWidth="4.2" markerHeight="4.2" refX="2.7" refY="2.1" orient="auto">
        <polygon points="0 0, 4.2 2.1, 0 4.2" fill="#10b981" />
      </marker>
      <marker id="arrowhead-user" markerWidth="4.2" markerHeight="4.2" refX="2.7" refY="2.1" orient="auto">
        <polygon points="0 0, 4.2 2.1, 0 4.2" fill="#f59e0b" />
      </marker>
    </defs>
  `;

  const drawArrow = (from, to, color, markerId, opacity = 0.86) => {
    const p1 = sqToCoordsPercent(from);
    const p2 = sqToCoordsPercent(to);
    const dx = p2.x - p1.x;
    const dy = p2.y - p1.y;
    const len = Math.hypot(dx, dy) || 1;
    // Немного укорачиваем конец линии под наконечник стрелки
    const endX = p2.x - (dx / len) * 24;
    const endY = p2.y - (dy / len) * 24;
    const startX = p1.x + (dx / len) * 14;
    const startY = p1.y + (dy / len) * 14;

    return `<line x1="${startX}" y1="${startY}" x2="${endX}" y2="${endY}"
      stroke="${color}" stroke-width="15" stroke-linecap="round"
      opacity="${opacity}" marker-end="url(#${markerId})" />`;
  };

  for (const arr of state.userArrows) {
    svgHtml += drawArrow(arr.from, arr.to, '#f59e0b', 'arrowhead-user', 0.8);
  }

  if (state.hintArrow && isLiveView()) {
    svgHtml += drawArrow(state.hintArrow.from, state.hintArrow.to, '#10b981', 'arrowhead-hint', 0.92);
  }

  arrowSvg.innerHTML = svgHtml;
}

// Подсчёт срубленных фигур и материального перевеса
function renderPlayerCards() {
  const dispEngine = getDisplayedEngine();
  const initialCounts = { 1: 8, 2: 2, 3: 2, 4: 2, 5: 1 };
  const currentWhite = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
  const currentBlack = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
  const weights = { 1: 1, 2: 3, 3: 3, 4: 5, 5: 9 };

  let whiteMat = 0;
  let blackMat = 0;

  for (let sq = 0; sq < 64; sq++) {
    const p = dispEngine.board[sq];
    if (p === EMPTY || Math.abs(p) === KING) continue;
    const abs = Math.abs(p);
    if (p > 0) {
      currentWhite[abs]++;
      whiteMat += weights[abs];
    } else {
      currentBlack[abs]++;
      blackMat += weights[abs];
    }
  }

  // Фигуры Чёрных, захваченные Белыми
  const capturedByWhite = [];
  // Фигуры Белых, захваченные Чёрными
  const capturedByBlack = [];

  for (const type of [5, 4, 3, 2, 1]) {
    const missingBlack = Math.max(0, initialCounts[type] - currentBlack[type]);
    for (let i = 0; i < missingBlack; i++) capturedByWhite.push(-type);

    const missingWhite = Math.max(0, initialCounts[type] - currentWhite[type]);
    for (let i = 0; i < missingWhite; i++) capturedByBlack.push(type);
  }

  const preset = DIFFICULTY_PRESETS[state.aiLevel] || DIFFICULTY_PRESETS[4];
  const whiteInfo = getSideMeta(WHITE, preset);
  const blackInfo = getSideMeta(BLACK, preset);

  const topColor = state.flipped ? WHITE : BLACK;
  const bottomColor = state.flipped ? BLACK : WHITE;

  const topMeta = topColor === WHITE ? whiteInfo : blackInfo;
  const bottomMeta = bottomColor === WHITE ? whiteInfo : blackInfo;

  topPlayerAvatar.textContent = topMeta.avatar;
  topPlayerName.textContent = topMeta.name;
  topPlayerBadge.textContent = topMeta.badge;

  bottomPlayerAvatar.textContent = bottomMeta.avatar;
  bottomPlayerName.textContent = bottomMeta.name;
  bottomPlayerBadge.textContent = bottomMeta.badge;

  const topCaps = topColor === WHITE ? capturedByWhite : capturedByBlack;
  const bottomCaps = bottomColor === WHITE ? capturedByWhite : capturedByBlack;

  topCapturedEl.innerHTML = topCaps
    .map((code) => `<span class="mini-piece">${getPieceSvg(code)}</span>`)
    .join('');
  bottomCapturedEl.innerHTML = bottomCaps
    .map((code) => `<span class="mini-piece">${getPieceSvg(code)}</span>`)
    .join('');

  const diff = whiteMat - blackMat;
  const topDiff = topColor === WHITE ? diff : -diff;
  const bottomDiff = bottomColor === WHITE ? diff : -diff;

  topMaterialDiffEl.textContent = topDiff > 0 ? `+${topDiff}` : '';
  bottomMaterialDiffEl.textContent = bottomDiff > 0 ? `+${bottomDiff}` : '';

  const gameActive = !isGameOver() && isLiveView();
  topPlayerCard.classList.toggle('active-turn', gameActive && state.engine.turn === topColor);
  bottomPlayerCard.classList.toggle('active-turn', gameActive && state.engine.turn === bottomColor);

  updateThinkingBadges();
  renderClocks();
}

function getSideMeta(color, preset) {
  const colorLabel = color === WHITE ? 'Белые' : 'Чёрные';
  if (state.mode === 'online' && state.online.room) {
    const room = state.online.room;
    const slot = color === WHITE ? room.players.white : room.players.black;
    if (!slot) {
      return {
        avatar: '⏳',
        name: `Ожидание соперника (${colorLabel})`,
        badge: 'Свободно'
      };
    }
    const isMe = room.myColor === color;
    const statusText = slot.connected ? (isMe ? 'Вы • В сети' : 'В сети') : 'Отключён';
    return {
      avatar: isMe ? '👤' : (color === WHITE ? '♔' : '♚'),
      name: `${slot.name} (${colorLabel})`,
      badge: statusText
    };
  }
  if (state.mode === 'pvp') {
    return { avatar: color === WHITE ? '♔' : '♚', name: `Игрок (${colorLabel})`, badge: 'Локально' };
  }
  if (state.mode === 'aivai') {
    return { avatar: '🤖', name: `${preset.name} (${colorLabel})`, badge: `${preset.elo} ELO` };
  }
  if (color === state.humanColor) {
    return { avatar: '👤', name: `Вы (${colorLabel})`, badge: 'Игрок' };
  }
  return { avatar: '🤖', name: `${preset.name}`, badge: `${preset.elo} ELO` };
}

function updateThinkingBadges() {
  const topColor = state.flipped ? WHITE : BLACK;
  const bottomColor = state.flipped ? BLACK : WHITE;
  const aiTurnColor = state.aiThinking ? state.engine.turn : 0;

  topThinkingBadge.classList.toggle('hidden', aiTurnColor !== topColor);
  bottomThinkingBadge.classList.toggle('hidden', aiTurnColor !== bottomColor);
}

// Форматирование часов
function formatClockMs(ms) {
  const clamped = Math.max(0, ms);
  const totalSec = Math.ceil(clamped / 1000);
  const min = Math.floor(totalSec / 60);
  const sec = totalSec % 60;
  if (clamped < 10000) {
    const tenths = Math.floor((clamped % 1000) / 100);
    return `${min}:${String(sec).padStart(2, '0')}.${tenths}`;
  }
  return `${String(min).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
}

function renderClocks() {
  const topColor = state.flipped ? WHITE : BLACK;
  const bottomColor = state.flipped ? BLACK : WHITE;

  if (!state.hasClock) {
    topClockEl.textContent = '∞';
    bottomClockEl.textContent = '∞';
    topClockEl.className = 'clock-box';
    bottomClockEl.className = 'clock-box';
    return;
  }

  const topMs = topColor === WHITE ? state.whiteTimeMs : state.blackTimeMs;
  const bottomMs = bottomColor === WHITE ? state.whiteTimeMs : state.blackTimeMs;
  const active = !isGameOver() && state.engine.history.length > 0;

  topClockEl.textContent = formatClockMs(topMs);
  bottomClockEl.textContent = formatClockMs(bottomMs);

  topClockEl.className = 'clock-box';
  bottomClockEl.className = 'clock-box';

  if (active && state.engine.turn === topColor) topClockEl.classList.add('running');
  if (active && state.engine.turn === bottomColor) bottomClockEl.classList.add('running');
  if (topMs <= 15000) topClockEl.classList.add('low-time');
  if (bottomMs <= 15000) bottomClockEl.classList.add('low-time');
}

// Отрисовка истории ходов (SAN)
function renderMoveHistory() {
  const totalPlies = state.timeline.length - 1;
  const fullMoveNum = Math.floor(state.viewPly / 2) + 1;
  moveCountLabel.textContent = totalPlies === 0 ? 'Начало' : `Ход ${fullMoveNum} (${state.viewPly}/${totalPlies})`;

  reviewBanner.classList.toggle('hidden', isLiveView());
  const resumeBtn = document.getElementById('resumeFromHereBtn');
  if (resumeBtn) {
    resumeBtn.classList.toggle('hidden', state.mode === 'online');
  }

  if (totalPlies === 0) {
    movesListEl.innerHTML = '<div class="empty-moves">Ходов пока нет. Кликните или перетащите фигуру!</div>';
    return;
  }

  // Учитываем случай, если стартовый FEN начинался с хода Чёрных
  const firstMoveSnap = state.timeline[1];
  const startsWithBlack = firstMoveSnap && firstMoveSnap.lastMove && firstMoveSnap.lastMove.piece < 0;

  let html = '';
  let ply = 1;
  let rowNum = 1;

  if (startsWithBlack) {
    const activeCls = state.viewPly === 1 ? 'active' : '';
    html += `
      <div class="move-row">
        <span class="move-num">${rowNum}.</span>
        <span class="move-cell">...</span>
        <span class="move-cell ${activeCls}" data-ply="1">${firstMoveSnap.san}</span>
      </div>
    `;
    ply = 2;
    rowNum = 2;
  }

  while (ply <= totalPlies) {
    const wSnap = state.timeline[ply];
    const bSnap = ply + 1 <= totalPlies ? state.timeline[ply + 1] : null;
    const wActive = state.viewPly === ply ? 'active' : '';
    const bActive = state.viewPly === ply + 1 ? 'active' : '';

    html += `
      <div class="move-row">
        <span class="move-num">${rowNum}.</span>
        <span class="move-cell ${wActive}" data-ply="${ply}">${wSnap.san}</span>
        ${
          bSnap
            ? `<span class="move-cell ${bActive}" data-ply="${ply + 1}">${bSnap.san}</span>`
            : '<span></span>'
        }
      </div>
    `;
    ply += 2;
    rowNum++;
  }

  movesListEl.innerHTML = html;
  const activeCell = movesListEl.querySelector('.move-cell.active');
  if (activeCell) {
    // Скроллим только внутренний контейнер истории, не вызывая прокрутку всей страницы на мобильных
    const listRect = movesListEl.getBoundingClientRect();
    const cellRect = activeCell.getBoundingClientRect();
    if (cellRect.top < listRect.top) {
      movesListEl.scrollTop -= (listRect.top - cellRect.top);
    } else if (cellRect.bottom > listRect.bottom) {
      movesListEl.scrollTop += (cellRect.bottom - listRect.bottom);
    }
  }
}

// Интерактивный график оценки позиции по ходу партии
function renderEvalChart() {
  const ctx = evalChart.getContext('2d');
  const w = evalChart.width;
  const h = evalChart.height;
  ctx.clearRect(0, 0, w, h);

  // Фон и центральная линия равенства 0.0
  ctx.fillStyle = '#121824';
  ctx.fillRect(0, 0, w, h);

  ctx.strokeStyle = 'rgba(148, 163, 184, 0.22)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(0, h / 2);
  ctx.lineTo(w, h / 2);
  ctx.stroke();

  const points = state.timeline.map((snap, idx) => {
    const x = state.timeline.length <= 1 ? 0 : (idx / (state.timeline.length - 1)) * w;
    const clampedCp = Math.max(-700, Math.min(700, snap.evalWhite || 0));
    const y = h / 2 - (clampedCp / 700) * (h * 0.44);
    return { x, y, idx };
  });

  if (points.length === 1) {
    points.push({ x: w, y: points[0].y, idx: 0 });
  }

  // Заливка графика
  ctx.beginPath();
  ctx.moveTo(points[0].x, h / 2);
  for (const p of points) ctx.lineTo(p.x, p.y);
  ctx.lineTo(points[points.length - 1].x, h / 2);
  ctx.closePath();
  ctx.fillStyle = 'rgba(16, 185, 129, 0.22)';
  ctx.fill();

  // Линия оценки
  ctx.beginPath();
  ctx.moveTo(points[0].x, points[0].y);
  for (const p of points) ctx.lineTo(p.x, p.y);
  ctx.strokeStyle = '#10b981';
  ctx.lineWidth = 2;
  ctx.stroke();

  // Маркер просматриваемого полухода
  if (state.timeline.length > 1) {
    const cur = points[state.viewPly];
    if (cur) {
      ctx.beginPath();
      ctx.arc(cur.x, cur.y, 4, 0, Math.PI * 2);
      ctx.fillStyle = '#f8fafc';
      ctx.fill();
      ctx.strokeStyle = '#10b981';
      ctx.lineWidth = 2;
      ctx.stroke();
    }
  }
}

// Обновление верхней статусной плашки и модалки завершения партии
function renderStatusAndControls() {
  statusBanner.classList.remove('check', 'finished');

  // Кнопки навигации по истории всегда доступны в зависимости от viewPly
  document.getElementById('navFirstBtn').disabled = state.viewPly === 0;
  document.getElementById('navPrevBtn').disabled = state.viewPly === 0;
  document.getElementById('navNextBtn').disabled = isLiveView();
  document.getElementById('navLastBtn').disabled = isLiveView();

  if (state.mode === 'online' && state.online.room) {
    const room = state.online.room;
    const isSpectator = room.role === 'spectator';

    document.getElementById('undoBtn').disabled = true;
    document.getElementById('resignBtn').disabled = room.status !== 'playing' || isSpectator;
    document.getElementById('hintBtn').disabled = room.status !== 'finished' || state.aiThinking || !isLiveView();

    if (room.status === 'waiting') {
      statusBanner.textContent = `Комната ${room.code} • Ожидание второго игрока…`;
      return;
    }

    if (room.status === 'finished' && room.result) {
      statusBanner.classList.add('finished');
      statusBanner.textContent = room.result.title;
      const resultKey = `${room.code}:${room.timeline.length}:${room.result.reason}:${room.result.winner}`;
      if (state.lastShownResultKey !== resultKey) {
        state.lastShownResultKey = resultKey;
        const icon = room.result.winner === 0 ? '🤝' : (room.result.winner === room.myColor ? '🏆' : '♚');
        playAgainBtn.textContent = isSpectator ? 'Закрыть' : '🔄 Предложить реванш';
        showGameOverBanner(icon, room.result.title, room.result.desc);
      }
      return;
    }

    const status = state.engine.getGameStatus();
    const sideStr = state.engine.turn === WHITE ? 'Ход Белых' : 'Ход Чёрных';
    const turnNote = isSpectator ? 'Режим зрителя' : (room.myColor === state.engine.turn ? 'Ваш ход!' : 'Ход соперника');

    if (status.inCheck) {
      statusBanner.textContent = `${sideStr} — ШАХ! (${turnNote})`;
      statusBanner.classList.add('check');
    } else if (!isLiveView()) {
      statusBanner.textContent = `Просмотр истории (полуход ${state.viewPly})`;
    } else {
      statusBanner.textContent = `${sideStr} • ${turnNote}`;
    }
    return;
  }

  playAgainBtn.textContent = 'Сыграть ещё раз';

  if (state.customGameOver) {
    statusBanner.textContent = state.customGameOver.title;
    statusBanner.classList.add('finished');
    document.getElementById('undoBtn').disabled = state.engine.history.length === 0;
    document.getElementById('resignBtn').disabled = true;
    document.getElementById('hintBtn').disabled = true;
    return;
  }

  const status = state.engine.getGameStatus();
  if (status.over) {
    statusBanner.classList.add('finished');
    let title = 'Ничья';
    let desc = '';
    let icon = '🤝';

    if (status.reason === 'checkmate') {
      const winnerName = status.winner === WHITE ? 'Белых' : 'Чёрных';
      title = `Мат! Победа ${winnerName}`;
      desc = `${status.winner === WHITE ? 'Белые' : 'Чёрные'} объявили мат королю соперника.`;
      icon = status.winner === state.humanColor || state.mode === 'pvp' ? '🏆' : '♚';
    } else if (status.reason === 'stalemate') {
      title = 'Пат — Ничья';
      desc = 'У ходящей стороны нет легальных ходов, но король не под шахом.';
    } else if (status.reason === 'repetition') {
      title = 'Ничья (Троекратное повторение)';
      desc = 'Одна и та же позиция повторилась трижды.';
    } else if (status.reason === 'fifty_moves') {
      title = 'Ничья (Правило 50 ходов)';
      desc = '50 ходов подряд без взятий и движения пешек.';
    } else if (status.reason === 'insufficient_material') {
      title = 'Ничья (Недостаток материала)';
      desc = 'На доске недостаточно фигур для постановки мата.';
    }

    statusBanner.textContent = title;
    document.getElementById('undoBtn').disabled = state.engine.history.length === 0;
    document.getElementById('resignBtn').disabled = true;
    document.getElementById('hintBtn').disabled = true;
    showGameOverBanner(icon, title, desc);
    return;
  }

  const sideStr = state.engine.turn === WHITE ? 'Ход Белых' : 'Ход Чёрных';
  if (status.inCheck) {
    statusBanner.textContent = `${sideStr} — ШАХ!`;
    statusBanner.classList.add('check');
  } else if (state.aiThinking) {
    statusBanner.textContent = `${sideStr} • ИИ анализирует позицию…`;
  } else if (!isLiveView()) {
    statusBanner.textContent = `Просмотр истории (полуход ${state.viewPly})`;
  } else {
    statusBanner.textContent = sideStr;
  }

  document.getElementById('undoBtn').disabled = state.engine.history.length === 0;
  document.getElementById('resignBtn').disabled = isGameOver() || state.mode === 'aivai';
  document.getElementById('hintBtn').disabled = isGameOver() || state.aiThinking || !isLiveView();
}

function showGameOverBanner(icon, title, desc) {
  gameOverIcon.textContent = icon;
  gameOverTitle.textContent = title;
  gameOverDesc.textContent = desc;
  gameOverOverlay.classList.remove('hidden');
}

function renderAll() {
  const curSnap = state.timeline[state.viewPly];
  if (curSnap && typeof curSnap.evalWhite === 'number') {
    updateEvalBar(curSnap.evalWhite);
    statEvalEl.textContent = formatEval(curSnap.evalWhite);
  }
  renderBoard();
  renderPlayerCards();
  renderMoveHistory();
  renderEvalChart();
  renderStatusAndControls();
}

// Выполнение легального хода на доске
function executeMoveOnBoard(moveInput, precomputedEvalWhite = null) {
  if (state.mode === 'online') {
    const room = state.online.room;
    if (!room || room.status !== 'playing') return false;
    const uci =
      typeof moveInput === 'string'
        ? moveInput
        : sqToAlgebraic(moveInput.from) +
          sqToAlgebraic(moveInput.to) +
          (moveInput.promotion ? ['', '', 'n', 'b', 'r', 'q'][Math.abs(moveInput.promotion)] || 'q' : '');

    state.selectedSq = -1;
    state.legalMovesForSelected = [];
    state.hintArrow = null;
    sendWs({ type: 'MAKE_MOVE', move: uci });
    renderBoard();
    return true;
  }

  const movingSide = state.engine.turn;
  const played = state.engine.playMove(moveInput);
  if (!played) return false;

  // Добавление инкремента часов
  if (state.hasClock && state.engine.history.length > 1) {
    if (movingSide === WHITE) state.whiteTimeMs += state.incrementMs;
    else state.blackTimeMs += state.incrementMs;
  }
  state.lastTickTs = performance.now();

  state.selectedSq = -1;
  state.legalMovesForSelected = [];
  state.hintArrow = null;
  state.userArrows = [];
  state.userMarkedSquares.clear();

  const evalWhite =
    typeof precomputedEvalWhite === 'number'
      ? precomputedEvalWhite
      : evaluateWhitePerspective(state.engine);

  state.timeline.push({
    fen: state.engine.toFen(),
    lastMove: played,
    san: played.san,
    uci: played.uci,
    evalWhite
  });
  state.viewPly = state.timeline.length - 1;

  // Обновляем название дебюта
  if (state.startFen === START_FEN) {
    const ucis = state.engine.history.map((h) => h.uci);
    openingNameEl.textContent = detectOpeningName(ucis);
  }

  // Звуковое сопровождение хода
  const status = state.engine.getGameStatus();
  if (status.over) {
    const won = status.winner === state.humanColor || state.mode === 'pvp';
    sound.playGameOver(won);
  } else if (status.inCheck) {
    sound.playCheck();
  } else if (played.flags === FLAG_PROMOTION) {
    sound.playPromote();
  } else if (played.flags === FLAG_CASTLE_K || played.flags === FLAG_CASTLE_Q) {
    sound.playCastle();
  } else if (played.captured !== EMPTY || played.flags === FLAG_EN_PASSANT) {
    sound.playCapture();
  } else {
    sound.playMove();
  }

  renderAll();
  maybeTriggerAIMove();
  return true;
}

// Проверка и запуск хода компьютера
function maybeTriggerAIMove() {
  if (isGameOver() || !isLiveView()) return;

  const turn = state.engine.turn;
  const shouldAiPlay =
    state.mode === 'aivai' ||
    ((state.mode === 'white' || state.mode === 'black') && turn !== state.humanColor);

  if (!shouldAiPlay) return;

  state.aiThinking = true;
  const reqId = ++state.activeSearchId;
  updateThinkingBadges();
  renderStatusAndControls();

  const uciMoves = state.engine.history.map((h) => h.uci);
  aiWorker.postMessage({
    type: 'SEARCH',
    requestId: reqId,
    kind: 'ai',
    startFen: state.startFen,
    uciMoves,
    currentFen: state.engine.toFen(),
    level: state.aiLevel
  });
}

// Запрос подсказки лучшего хода от ИИ
function requestAiHint() {
  if (state.mode === 'online' && state.online.room?.status !== 'finished') return;
  if (isGameOver() || state.aiThinking || !isLiveView()) return;

  state.aiThinking = true;
  const reqId = ++state.activeSearchId;
  updateThinkingBadges();
  renderStatusAndControls();

  const hintLevel = Math.max(4, state.aiLevel);
  const uciMoves = state.engine.history.map((h) => h.uci);
  aiWorker.postMessage({
    type: 'SEARCH',
    requestId: reqId,
    kind: 'hint',
    startFen: state.startFen,
    uciMoves,
    currentFen: state.engine.toFen(),
    level: hintLevel
  });
}

// Попытка совершить ход игрока с поля `from` на поле `to`
function tryHumanMove(from, to) {
  const candidates = state.legalMovesForSelected.filter((m) => m.from === from && m.to === to);
  if (candidates.length === 0) return false;

  // Если ход является превращением пешки — открываем выбор фигуры (Ферзь, Ладья, Слон, Конь)
  if (candidates[0].flags === FLAG_PROMOTION) {
    openPromotionDialog(from, to, state.engine.turn);
    return true;
  }

  return executeMoveOnBoard(candidates[0]);
}

function openPromotionDialog(from, to, color) {
  state.pendingPromotion = { from, to, color };
  promotionChoices.innerHTML = '';

  for (const pieceType of [QUEEN, ROOK, BISHOP, KNIGHT]) {
    const btn = document.createElement('button');
    btn.className = 'promo-btn';
    btn.innerHTML = getPieceSvg(pieceType * color);
    btn.addEventListener('click', () => {
      const pending = state.pendingPromotion;
      state.pendingPromotion = null;
      promotionPopup.classList.add('hidden');
      if (pending) {
        executeMoveOnBoard({ from: pending.from, to: pending.to, promotion: pieceType });
      }
    });
    promotionChoices.appendChild(btn);
  }

  promotionPopup.classList.remove('hidden');
}

// Определение поля под координатами курсора (clientX, clientY)
function getSquareFromPoint(clientX, clientY) {
  const rect = boardEl.getBoundingClientRect();
  if (clientX < rect.left || clientX >= rect.right || clientY < rect.top || clientY >= rect.bottom) {
    return -1;
  }
  const vc = Math.min(7, Math.max(0, Math.floor(((clientX - rect.left) / rect.width) * 8)));
  const vr = Math.min(7, Math.max(0, Math.floor(((clientY - rect.top) / rect.height) * 8)));
  return visualIdxToSq((vr << 3) | vc);
}

// Обработчики ввода на шахматной доске (Click + Pointer Drag & Drop + Right-Click Arrows)
boardEl.addEventListener('contextmenu', (e) => e.preventDefault());

boardEl.addEventListener('pointerdown', (e) => {
  const sq = getSquareFromPoint(e.clientX, e.clientY);
  if (sq === -1) return;

  // Правая кнопка мыши: рисование стрелок или выделение полей
  if (e.button === 2) {
    state.rightDrag.active = true;
    state.rightDrag.fromSq = sq;
    return;
  }

  if (e.button !== 0) return;

  // Сбрасываем пользовательские пометки левым кликом
  if (state.userArrows.length > 0 || state.userMarkedSquares.size > 0) {
    state.userArrows = [];
    state.userMarkedSquares.clear();
    renderBoard();
  }

  if (!isLiveView() || isGameOver() || state.aiThinking || state.pendingPromotion) return;

  const piece = state.engine.board[sq];

  // Если уже выбрана наша фигура и кликнули по легальному полю назначения — делаем ход сразу!
  if (state.selectedSq !== -1 && sq !== state.selectedSq) {
    if (tryHumanMove(state.selectedSq, sq)) {
      return;
    }
  }

  // Выбор своей фигуры и начало возможного перетаскивания
  if (piece !== EMPTY && canHumanMovePiece(piece)) {
    const allLegal = state.engine.generateLegalMoves();
    state.selectedSq = sq;
    state.legalMovesForSelected = allLegal.filter((m) => m.from === sq);

    state.drag.active = true;
    state.drag.pointerId = e.pointerId;
    state.drag.fromSq = sq;
    state.drag.moved = false;
    state.drag.startX = e.clientX;
    state.drag.startY = e.clientY;

    boardEl.setPointerCapture(e.pointerId);
    renderBoard();
  } else {
    state.selectedSq = -1;
    state.legalMovesForSelected = [];
    renderBoard();
  }
});

boardEl.addEventListener('pointermove', (e) => {
  if (!state.drag.active || e.pointerId !== state.drag.pointerId) return;

  const dist = Math.hypot(e.clientX - state.drag.startX, e.clientY - state.drag.startY);
  if (!state.drag.moved && dist > 6) {
    state.drag.moved = true;
    const piece = state.engine.board[state.drag.fromSq];
    dragGhost.innerHTML = getPieceSvg(piece);
    dragGhost.classList.remove('hidden');
    const srcCell = boardCells.find((c) => c.sqEl.dataset.sq === String(state.drag.fromSq));
    if (srcCell) srcCell.pieceDiv.classList.add('dragging-source');
  }

  if (state.drag.moved) {
    dragGhost.style.left = `${e.clientX}px`;
    dragGhost.style.top = `${e.clientY}px`;
  }
});

boardEl.addEventListener('pointercancel', (e) => {
  if (!state.drag.active || e.pointerId !== state.drag.pointerId) return;
  state.drag.active = false;
  state.drag.moved = false;
  dragGhost.classList.add('hidden');
  renderBoard();
});

boardEl.addEventListener('pointerup', (e) => {
  // Завершение правого клика (стрелка или выделение поля)
  if (e.button === 2 && state.rightDrag.active) {
    state.rightDrag.active = false;
    const toSq = getSquareFromPoint(e.clientX, e.clientY);
    const fromSq = state.rightDrag.fromSq;
    if (toSq !== -1 && fromSq !== -1) {
      if (fromSq === toSq) {
        if (state.userMarkedSquares.has(fromSq)) state.userMarkedSquares.delete(fromSq);
        else state.userMarkedSquares.add(fromSq);
      } else {
        const idx = state.userArrows.findIndex((a) => a.from === fromSq && a.to === toSq);
        if (idx >= 0) state.userArrows.splice(idx, 1);
        else state.userArrows.push({ from: fromSq, to: toSq });
      }
      renderBoard();
    }
    return;
  }

  if (!state.drag.active || e.pointerId !== state.drag.pointerId) return;

  const wasMoved = state.drag.moved;
  const fromSq = state.drag.fromSq;

  state.drag.active = false;
  state.drag.moved = false;
  dragGhost.classList.add('hidden');
  if (boardEl.hasPointerCapture(e.pointerId)) {
    boardEl.releasePointerCapture(e.pointerId);
  }

  if (wasMoved) {
    const dropSq = getSquareFromPoint(e.clientX, e.clientY);
    if (dropSq !== -1 && dropSq !== fromSq) {
      if (tryHumanMove(fromSq, dropSq)) {
        return;
      }
    }
    renderBoard();
  }
});

// Закрытие окна превращения при клике мимо кнопок
promotionPopup.addEventListener('click', (e) => {
  if (e.target === promotionPopup) {
    state.pendingPromotion = null;
    promotionPopup.classList.add('hidden');
    renderBoard();
  }
});

// Отмена хода (в игре против ИИ возвращает сразу пару полуходов до хода игрока)
function handleUndo() {
  if (state.mode === 'online') return;
  if (state.engine.history.length === 0) return;

  state.activeSearchId++;
  state.aiThinking = false;
  state.customGameOver = null;
  state.hintArrow = null;
  gameOverOverlay.classList.add('hidden');

  let undoCount = 1;
  if (state.mode === 'white' || state.mode === 'black') {
    // Если сейчас ход человека и есть минимум 2 полухода — откатываем ответ ИИ и ход человека
    if (state.engine.turn === state.humanColor && state.engine.history.length >= 2) {
      undoCount = 2;
    } else {
      undoCount = 1;
    }
  }

  for (let i = 0; i < undoCount; i++) {
    if (state.engine.undoMove()) {
      state.timeline.pop();
    }
  }

  state.viewPly = state.timeline.length - 1;
  state.selectedSq = -1;
  state.legalMovesForSelected = [];

  if (state.startFen === START_FEN) {
    openingNameEl.textContent = detectOpeningName(state.engine.history.map((h) => h.uci));
  }

  renderAll();
  maybeTriggerAIMove();
}

// Продолжить игру с выбранного в истории хода
document.getElementById('resumeFromHereBtn').addEventListener('click', () => {
  if (isLiveView()) return;
  const targetPly = state.viewPly;
  state.activeSearchId++;
  state.aiThinking = false;
  state.customGameOver = null;
  gameOverOverlay.classList.add('hidden');

  while (state.engine.history.length > targetPly) {
    state.engine.undoMove();
    state.timeline.pop();
  }
  state.viewPly = state.timeline.length - 1;
  renderAll();
  maybeTriggerAIMove();
});

// Клик по списку ходов
movesListEl.addEventListener('click', (e) => {
  const cell = e.target.closest('.move-cell[data-ply]');
  if (!cell) return;
  const ply = parseInt(cell.dataset.ply, 10);
  if (!Number.isNaN(ply) && ply >= 0 && ply < state.timeline.length) {
    state.viewPly = ply;
    state.selectedSq = -1;
    renderAll();
  }
});

// Клик по графику оценки для быстрого перехода к моменту партии
evalChart.addEventListener('click', (e) => {
  if (state.timeline.length <= 1) return;
  const rect = evalChart.getBoundingClientRect();
  const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
  state.viewPly = Math.round(ratio * (state.timeline.length - 1));
  state.selectedSq = -1;
  renderAll();
});

// Навигационные кнопки
document.getElementById('navFirstBtn').addEventListener('click', () => {
  state.viewPly = 0;
  state.selectedSq = -1;
  renderAll();
});
document.getElementById('navPrevBtn').addEventListener('click', () => {
  if (state.viewPly > 0) {
    state.viewPly--;
    state.selectedSq = -1;
    renderAll();
  }
});
document.getElementById('navNextBtn').addEventListener('click', () => {
  if (state.viewPly < state.timeline.length - 1) {
    state.viewPly++;
    state.selectedSq = -1;
    renderAll();
  }
});
document.getElementById('navLastBtn').addEventListener('click', () => {
  state.viewPly = state.timeline.length - 1;
  state.selectedSq = -1;
  renderAll();
});

// Кнопки управления
document.getElementById('newGameTopBtn').addEventListener('click', () => startNewGame());
document.getElementById('applyNewGameBtn').addEventListener('click', () => startNewGame());
playAgainBtn.addEventListener('click', () => {
  if (state.mode === 'online' && state.online.room) {
    gameOverOverlay.classList.add('hidden');
    if (state.online.room.role !== 'spectator') {
      sendWs({ type: 'REQUEST_REMATCH' });
    }
    return;
  }
  startNewGame();
});
document.getElementById('closeOverlayBtn').addEventListener('click', () => {
  gameOverOverlay.classList.add('hidden');
});

document.getElementById('hintBtn').addEventListener('click', requestAiHint);
document.getElementById('undoBtn').addEventListener('click', handleUndo);
document.getElementById('flipBtn').addEventListener('click', () => {
  state.flipped = !state.flipped;
  renderAll();
});

document.getElementById('resignBtn').addEventListener('click', () => {
  if (state.mode === 'online' && state.online.room) {
    if (state.online.room.status === 'playing' && state.online.room.role !== 'spectator') {
      sendWs({ type: 'RESIGN' });
    }
    return;
  }
  if (isGameOver() || state.mode === 'aivai') return;
  state.activeSearchId++;
  state.aiThinking = false;
  const loserColor = state.mode === 'pvp' ? state.engine.turn : state.humanColor;
  const winnerName = loserColor === WHITE ? 'Чёрных' : 'Белых';
  const title = `Сдача — Победа ${winnerName}`;
  const desc = `${loserColor === WHITE ? 'Белые' : 'Чёрные'} признали поражение.`;
  state.customGameOver = { reason: 'resign', winner: -loserColor, title, desc };
  sound.playGameOver(false);
  renderAll();
  showGameOverBanner('🏳', title, desc);
});

// Переключатель темы и звука
themeSelect.addEventListener('change', () => {
  document.body.dataset.theme = themeSelect.value;
});

soundToggleBtn.addEventListener('click', () => {
  sound.setEnabled(!sound.enabled);
  soundIcon.textContent = sound.enabled ? '🔊' : '🔇';
});

// Изменение уровня сложности налету (даже во время текущей партии)
difficultySelect.addEventListener('change', () => {
  state.aiLevel = parseInt(difficultySelect.value, 10) || 4;
  renderPlayerCards();
});

// Модальное окно FEN / PGN
document.getElementById('fenModalBtn').addEventListener('click', () => {
  const dispEngine = getDisplayedEngine();
  fenInput.value = dispEngine.toFen();
  const preset = DIFFICULTY_PRESETS[state.aiLevel] || DIFFICULTY_PRESETS[4];
  pgnOutput.value = state.engine.toPgn({
    White: getSideMeta(WHITE, preset).name,
    Black: getSideMeta(BLACK, preset).name
  });
  fenFeedback.textContent = '';
  fenFeedback.classList.remove('error');
  fenModal.classList.remove('hidden');
});

document.getElementById('closeFenModalBtn').addEventListener('click', () => {
  fenModal.classList.add('hidden');
});

fenModal.addEventListener('click', (e) => {
  if (e.target === fenModal) fenModal.classList.add('hidden');
});

document.getElementById('copyFenBtn').addEventListener('click', async () => {
  await navigator.clipboard.writeText(fenInput.value);
  fenFeedback.classList.remove('error');
  fenFeedback.textContent = 'FEN скопирован в буфер обмена!';
});

document.getElementById('copyPgnBtn').addEventListener('click', async () => {
  await navigator.clipboard.writeText(pgnOutput.value);
  fenFeedback.classList.remove('error');
  fenFeedback.textContent = 'PGN партии скопирован!';
});

document.getElementById('loadFenBtn').addEventListener('click', () => {
  try {
    const raw = fenInput.value.trim();
    const testEngine = new ChessEngine(raw);
    fenModal.classList.add('hidden');
    startNewGame(testEngine.toFen());
  } catch (err) {
    fenFeedback.classList.add('error');
    fenFeedback.textContent = err.message || 'Ошибка разбора строки FEN';
  }
});

// Горячие клавиши клавиатуры
window.addEventListener('keydown', (e) => {
  if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.tagName === 'SELECT') {
    return;
  }
  if (e.key === 'ArrowLeft') {
    if (state.viewPly > 0) { state.viewPly--; state.selectedSq = -1; renderAll(); }
  } else if (e.key === 'ArrowRight') {
    if (state.viewPly < state.timeline.length - 1) { state.viewPly++; state.selectedSq = -1; renderAll(); }
  } else if (e.key === 'Home') {
    state.viewPly = 0; state.selectedSq = -1; renderAll();
  } else if (e.key === 'End') {
    state.viewPly = state.timeline.length - 1; state.selectedSq = -1; renderAll();
  } else if (e.key === 'f' || e.key === 'F' || e.key === 'а' || e.key === 'А') {
    state.flipped = !state.flipped; renderAll();
  } else if (e.key === 'h' || e.key === 'H' || e.key === 'р' || e.key === 'Р') {
    requestAiHint();
  } else if ((e.key === 'z' || e.key === 'Z' || e.key === 'я' || e.key === 'Я') && !e.ctrlKey && !e.metaKey) {
    handleUndo();
  } else if (e.key === 'm' || e.key === 'M' || e.key === 'ь' || e.key === 'Ь') {
    sound.setEnabled(!sound.enabled);
    soundIcon.textContent = sound.enabled ? '🔊' : '🔇';
  }
});

// Тик шахматных часов (каждые 100 мс)
setInterval(() => {
  if (!state.hasClock || isGameOver() || state.engine.history.length === 0) {
    state.lastTickTs = performance.now();
    return;
  }

  const now = performance.now();
  const dt = now - state.lastTickTs;
  state.lastTickTs = now;

  if (state.mode === 'online') {
    if (state.engine.turn === WHITE) state.whiteTimeMs = Math.max(0, state.whiteTimeMs - dt);
    else state.blackTimeMs = Math.max(0, state.blackTimeMs - dt);
    renderClocks();
    return;
  }

  if (state.engine.turn === WHITE) {
    state.whiteTimeMs = Math.max(0, state.whiteTimeMs - dt);
    if (state.whiteTimeMs <= 0) {
      state.activeSearchId++;
      state.aiThinking = false;
      const title = 'Время Белых истекло — Победа Чёрных';
      const desc = 'Флаг Белых упал при контроле времени.';
      state.customGameOver = { reason: 'timeout', winner: BLACK, title, desc };
      sound.playGameOver(state.humanColor === BLACK);
      renderAll();
      showGameOverBanner('⏱', title, desc);
      return;
    }
  } else {
    state.blackTimeMs = Math.max(0, state.blackTimeMs - dt);
    if (state.blackTimeMs <= 0) {
      state.activeSearchId++;
      state.aiThinking = false;
      const title = 'Время Чёрных истекло — Победа Белых';
      const desc = 'Флаг Чёрных упал при контроле времени.';
      state.customGameOver = { reason: 'timeout', winner: WHITE, title, desc };
      sound.playGameOver(state.humanColor === WHITE);
      renderAll();
      showGameOverBanner('⏱', title, desc);
      return;
    }
  }

  renderClocks();
}, 100);

// === СЕТЕВОЙ МОДУЛЬ ОНЛАЙН-ИГРЫ (WEBSOCKET) ===

function showOnlineError(text) {
  if (!text) {
    onlineErrorMsg.textContent = '';
    onlineErrorMsg.classList.add('hidden');
    return;
  }
  onlineErrorMsg.textContent = text;
  onlineErrorMsg.classList.remove('hidden');
}

async function refreshNetworkInfo() {
  try {
    const { apiBase } = getBackendUrls();
    const res = await fetch(`${apiBase}/api/network-info`);
    if (res.ok) {
      state.online.networkInfo = await res.json();
      renderOnlinePanel();
    }
  } catch {
    // Сервер временно недоступен или ещё просыпается
  }
}

function buildInviteUrl(code) {
  const net = state.online.networkInfo;
  const { isCloud } = getBackendUrls();
  let base = window.location.origin;
  const isLocalHost =
    window.location.hostname === '127.0.0.1' || window.location.hostname === 'localhost';

  if (!isCloud) {
    if (net?.publicUrl) {
      base = net.publicUrl;
    } else if (isLocalHost && Array.isArray(net?.lanUrls) && net.lanUrls.length > 0) {
      base = net.lanUrls[0];
    }
  }
  const pathPrefix = window.location.pathname || '/';
  return `${base}${pathPrefix}?room=${encodeURIComponent(code)}`;
}

function updateNetworkIndicators() {
  const connected = state.online.connected;
  const inRoom = Boolean(state.online.room);
  netStatusDot.className = 'net-dot' + (inRoom ? ' in-room' : connected ? ' connected' : '');

  if (!connected) {
    pingBadge.textContent = 'Офлайн';
    onlineConnStatus.textContent = 'Переподключение…';
    onlineConnStatus.classList.remove('live');
  } else if (inRoom) {
    const p = state.online.pingMs;
    pingBadge.textContent = p !== null ? `${p} мс` : 'В комнате';
    onlineConnStatus.textContent = `Комната ${state.online.room.code}`;
    onlineConnStatus.classList.add('live');
  } else {
    const p = state.online.pingMs;
    pingBadge.textContent = p !== null ? `${p} мс` : 'В сети';
    onlineConnStatus.textContent = 'Сервер готов';
    onlineConnStatus.classList.add('live');
  }
}

function renderChat(messages) {
  if (!Array.isArray(messages) || messages.length === 0) {
    chatMessagesEl.innerHTML =
      '<div class="chat-line system">Чат комнаты пуст. Отправьте приветствие сопернику!</div>';
    return;
  }
  chatMessagesEl.innerHTML = messages
    .map((m) => {
      if (m.system) {
        return `<div class="chat-line system">${escapeHtml(m.text)}</div>`;
      }
      const roleCls = m.role === 'white' ? 'white' : m.role === 'black' ? 'black' : '';
      return `<div class="chat-line"><span class="chat-sender ${roleCls}">${escapeHtml(m.sender)}:</span>${escapeHtml(m.text)}</div>`;
    })
    .join('');
  chatMessagesEl.scrollTop = chatMessagesEl.scrollHeight;
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function renderOnlinePanel() {
  updateNetworkIndicators();
  const room = state.online.room;
  onlineCard.classList.toggle('active-session', Boolean(room));

  if (!room) {
    onlineLobbyView.classList.remove('hidden');
    onlineRoomView.classList.add('hidden');
    return;
  }

  onlineLobbyView.classList.add('hidden');
  onlineRoomView.classList.remove('hidden');
  roomCodeBadge.textContent = room.code;

  const roleText =
    room.role === 'white'
      ? 'Вы: Белые'
      : room.role === 'black'
        ? 'Вы: Чёрные'
        : 'Вы: Зритель';
  const specText = room.spectatorsCount > 0 ? ` • 👁 ${room.spectatorsCount}` : '';
  roomRoleBadge.textContent = `${roleText}${specText}`;

  inviteUrlInput.value = buildInviteUrl(room.code);
  const { isCloud } = getBackendUrls();
  const hasPublicTunnel = Boolean(state.online.networkInfo?.publicUrl);
  const onHttps = window.location.protocol === 'https:';
  if (isCloud || hasPublicTunnel || onHttps) {
    tunnelTypeBadge.textContent = 'Интернет (GitHub Pages + Fly.io)';
    tunnelTypeBadge.classList.add('internet');
  } else {
    tunnelTypeBadge.textContent = 'Локальная / LAN сеть';
    tunnelTypeBadge.classList.remove('internet');
  }

  // Входящее предложение ничьей
  const hasIncomingDraw =
    room.status === 'playing' &&
    room.myColor !== 0 &&
    room.drawOfferBy &&
    room.drawOfferBy === -room.myColor;
  drawOfferBanner.classList.toggle('hidden', !hasIncomingDraw);

  const isSpectator = room.role === 'spectator';
  offerDrawBtn.classList.toggle('hidden', room.status !== 'playing' || isSpectator);
  offerDrawBtn.disabled = room.drawOfferBy === room.myColor;
  offerDrawBtn.textContent =
    room.drawOfferBy === room.myColor ? '⏳ Ничья предложена' : '🤝 Предложить ничью';

  rematchOnlineBtn.classList.toggle('hidden', room.status !== 'finished' || isSpectator);
  const iVotedRematch = Array.isArray(room.rematchVotes) && room.rematchVotes.includes(room.myColor);
  rematchOnlineBtn.disabled = iVotedRematch;
  rematchOnlineBtn.textContent = iVotedRematch ? '⏳ Ожидание реванша…' : '🔄 Предложить реванш';

  renderChat(room.chat || []);
}

function syncRoomFromServer(room) {
  const prevRoom = state.online.room;
  const wasInSameRoom = prevRoom && prevRoom.code === room.code;
  const prevPlyCount = wasInSameRoom ? state.online.lastSyncedPlyCount : 0;
  const wasFinished = wasInSameRoom ? state.online.lastFinishedStatus : false;

  state.online.room = room;
  state.mode = 'online';
  if (gameModeSelect.value !== 'online') {
    gameModeSelect.value = 'online';
  }
  activeModeTag.textContent = `Онлайн • ${room.code}`;

  // Автоматически поворачиваем доску за цвет игрока при первом входе или реванше
  const orientationKey = `${room.code}:${room.myColor}`;
  if (state.online.autoOrientedForRoom !== orientationKey && room.myColor !== 0) {
    state.flipped = room.myColor === BLACK;
    state.online.autoOrientedForRoom = orientationKey;
  }

  // Восстанавливаем ChessEngine из истории ходов сервера
  const newEngine = new ChessEngine(room.startFen || START_FEN);
  const newTimeline = [
    {
      fen: newEngine.toFen(),
      lastMove: null,
      san: null,
      uci: null,
      evalWhite: room.timeline?.[0]?.evalWhite ?? evaluateWhitePerspective(newEngine)
    }
  ];

  let lastPlayedMove = null;
  if (Array.isArray(room.timeline)) {
    for (let i = 1; i < room.timeline.length; i++) {
      const item = room.timeline[i];
      const played = newEngine.playMove(item.uci);
      if (played) {
        lastPlayedMove = played;
        newTimeline.push({
          fen: newEngine.toFen(),
          lastMove: played,
          san: item.san || played.san,
          uci: item.uci,
          evalWhite: item.evalWhite ?? 0
        });
      }
    }
  }

  const wasAtLive = isLiveView();
  state.engine = newEngine;
  state.startFen = room.startFen || START_FEN;
  state.timeline = newTimeline;
  if (wasAtLive || !wasInSameRoom || newTimeline.length === 1) {
    state.viewPly = newTimeline.length - 1;
  } else {
    state.viewPly = Math.min(state.viewPly, newTimeline.length - 1);
  }

  state.hasClock = Boolean(room.hasClock);
  state.incrementMs = room.incrementMs || 0;
  state.whiteTimeMs = room.whiteTimeMs || 0;
  state.blackTimeMs = room.blackTimeMs || 0;
  state.lastTickTs = performance.now();
  state.customGameOver = null;

  if (room.status !== 'finished') {
    state.lastShownResultKey = null;
    gameOverOverlay.classList.add('hidden');
  }

  openingNameEl.textContent = room.opening || 'Начальная позиция';
  if (room.timeline.length <= 1) {
    pvLineEl.textContent =
      room.status === 'waiting'
        ? 'Отправьте ссылку другу, чтобы начать партию'
        : 'Сетевая партия началась — сделайте ход!';
  } else {
    pvLineEl.textContent = `Последний ход: ${lastPlayedMove ? lastPlayedMove.san : ''}`;
  }

  // Звук при новом ходе или завершении партии
  const newPlyCount = newTimeline.length - 1;
  state.online.lastSyncedPlyCount = newPlyCount;
  state.online.lastFinishedStatus = room.status === 'finished';

  if (wasInSameRoom) {
    if (room.status === 'finished' && !wasFinished && room.result) {
      const won = room.result.winner === room.myColor;
      sound.playGameOver(won);
    } else if (newPlyCount > prevPlyCount && lastPlayedMove) {
      const st = state.engine.getGameStatus();
      if (st.inCheck) sound.playCheck();
      else if (lastPlayedMove.flags === FLAG_PROMOTION) sound.playPromote();
      else if (lastPlayedMove.flags === FLAG_CASTLE_K || lastPlayedMove.flags === FLAG_CASTLE_Q) sound.playCastle();
      else if (lastPlayedMove.captured !== EMPTY || lastPlayedMove.flags === FLAG_EN_PASSANT) sound.playCapture();
      else sound.playMove();
    }
  }

  // Обновляем URL без перезагрузки страницы, чтобы F5 сохранил комнату
  try {
    const url = new URL(window.location.href);
    if (url.searchParams.get('room') !== room.code) {
      url.searchParams.set('room', room.code);
      window.history.replaceState({}, '', url.toString());
    }
  } catch {
    // ignore
  }

  showOnlineError('');
  renderOnlinePanel();
  renderAll();
}

function sendWs(payload) {
  const ws = state.online.ws;
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(payload));
    return true;
  }
  state.online.pendingAction = payload;
  connectWebSocket();
  return false;
}

function connectWebSocket() {
  if (
    state.online.ws &&
    (state.online.ws.readyState === WebSocket.OPEN ||
      state.online.ws.readyState === WebSocket.CONNECTING)
  ) {
    return;
  }

  const { wsUrl } = getBackendUrls();
  const ws = new WebSocket(wsUrl);
  state.online.ws = ws;

  ws.onopen = () => {
    state.online.connected = true;
    ws.send(JSON.stringify({ type: 'PING', clientTs: performance.now() }));
    updateNetworkIndicators();

    if (state.online.pendingAction) {
      const act = state.online.pendingAction;
      state.online.pendingAction = null;
      ws.send(JSON.stringify(act));
    } else if (state.online.room) {
      // Переподключение к комнате после обрыва связи
      ws.send(
        JSON.stringify({
          type: 'JOIN_ROOM',
          code: state.online.room.code,
          name: getCurrentPlayerName(),
          token: state.online.token
        })
      );
    }
  };

  ws.onmessage = (event) => {
    let msg;
    try {
      msg = JSON.parse(event.data);
    } catch {
      return;
    }

    if (msg.type === 'PONG') {
      state.online.pingMs = Math.max(1, Math.round(performance.now() - msg.clientTs));
      updateNetworkIndicators();
      return;
    }

    if (msg.type === 'ROOM_STATE') {
      syncRoomFromServer(msg.room);
      return;
    }

    if (msg.type === 'CHAT_NEW' && state.online.room) {
      state.online.room.chat = state.online.room.chat || [];
      state.online.room.chat.push(msg.message);
      if (state.online.room.chat.length > 60) state.online.room.chat.shift();
      renderChat(state.online.room.chat);
      return;
    }

    if (msg.type === 'LEFT_ROOM') {
      state.online.room = null;
      state.online.autoOrientedForRoom = null;
      try {
        const url = new URL(window.location.href);
        url.searchParams.delete('room');
        window.history.replaceState({}, '', url.toString());
      } catch {
        // ignore
      }
      renderOnlinePanel();
      if (gameModeSelect.value === 'online') gameModeSelect.value = 'white';
      startNewGame(null, true);
      return;
    }

    if (msg.type === 'ERROR') {
      showOnlineError(msg.message || 'Ошибка сетевой операции');
    }
  };

  ws.onclose = () => {
    state.online.connected = false;
    updateNetworkIndicators();
    setTimeout(connectWebSocket, 2200);
  };

  ws.onerror = () => {
    state.online.connected = false;
    updateNetworkIndicators();
  };
}

function getCurrentPlayerName() {
  const val = (onlineNameInput.value || '').trim();
  const finalName = val || 'Игрок';
  try {
    localStorage.setItem('chess_arena_name', finalName);
  } catch {
    // ignore
  }
  return finalName;
}

// Обработчики UI онлайн-панели
onlineNameInput.value = getSavedPlayerName();

openOnlineTopBtn.addEventListener('click', () => {
  onlineCard.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  if (!state.online.room) onlineNameInput.focus();
});

createRoomBtn.addEventListener('click', () => {
  showOnlineError('');
  sendWs({
    type: 'CREATE_ROOM',
    name: getCurrentPlayerName(),
    token: state.online.token,
    colorPref: onlineColorSelect.value,
    timeControl: timeControlSelect.value
  });
});

quickMatchBtn.addEventListener('click', () => {
  showOnlineError('');
  sendWs({
    type: 'QUICK_MATCH',
    name: getCurrentPlayerName(),
    token: state.online.token,
    timeControl: timeControlSelect.value
  });
});

joinRoomBtn.addEventListener('click', () => {
  const code = joinRoomCodeInput.value.trim().toUpperCase();
  if (!code) {
    showOnlineError('Введите код комнаты (например: K7M9P2)');
    return;
  }
  showOnlineError('');
  sendWs({
    type: 'JOIN_ROOM',
    code,
    name: getCurrentPlayerName(),
    token: state.online.token
  });
});

joinRoomCodeInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') joinRoomBtn.click();
});

copyInviteBtn.addEventListener('click', async () => {
  try {
    await navigator.clipboard.writeText(inviteUrlInput.value);
    const oldText = copyInviteBtn.textContent;
    copyInviteBtn.textContent = '✓ Скопировано';
    setTimeout(() => {
      copyInviteBtn.textContent = oldText;
    }, 1800);
  } catch {
    inviteUrlInput.select();
  }
});

offerDrawBtn.addEventListener('click', () => {
  sendWs({ type: 'OFFER_DRAW' });
});
acceptDrawBtn.addEventListener('click', () => {
  sendWs({ type: 'RESPOND_DRAW', accept: true });
});
declineDrawBtn.addEventListener('click', () => {
  sendWs({ type: 'RESPOND_DRAW', accept: false });
});
rematchOnlineBtn.addEventListener('click', () => {
  sendWs({ type: 'REQUEST_REMATCH' });
});
leaveRoomBtn.addEventListener('click', () => {
  sendWs({ type: 'LEAVE_ROOM' });
});

chatForm.addEventListener('submit', (e) => {
  e.preventDefault();
  const txt = chatInput.value.trim();
  if (!txt) return;
  sendWs({ type: 'CHAT_MESSAGE', text: txt });
  chatInput.value = '';
});

document.querySelectorAll('.react-chip').forEach((btn) => {
  btn.addEventListener('click', () => {
    const msg = btn.dataset.msg;
    if (msg) sendWs({ type: 'CHAT_MESSAGE', text: msg });
  });
});

setInterval(() => {
  if (state.online.ws && state.online.ws.readyState === WebSocket.OPEN) {
    state.online.ws.send(JSON.stringify({ type: 'PING', clientTs: performance.now() }));
  }
}, 8000);

// Запуск при загрузке
initWorker();
startNewGame();
connectWebSocket();
refreshNetworkInfo();

// Если открыта ссылка с ?room=CODE — сразу входим в онлайн-комнату
const initialRoomCode = new URLSearchParams(window.location.search).get('room');
if (initialRoomCode) {
  joinRoomCodeInput.value = initialRoomCode.trim().toUpperCase();
  sendWs({
    type: 'JOIN_ROOM',
    code: initialRoomCode.trim().toUpperCase(),
    name: getCurrentPlayerName(),
    token: state.online.token
  });
}
