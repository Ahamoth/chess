// Шахматный ИИ-движок: PeSTO Tapered Evaluation, Transposition Table,
// Iterative Deepening, Alpha-Beta (PVS), Killer & History Heuristics,
// Quiescence Search, Дебютная книга и Mop-Up оценка эндшпиля.

import {
  EMPTY, PAWN, KNIGHT, BISHOP, ROOK, QUEEN, KING,
  WHITE, BLACK, FLAG_PROMOTION, moveToUci
} from './engine.js';

const INF = 100000;
export const MATE_SCORE = 29000;

// Базовая стоимость материала (Middlegame / Endgame) в сантипешках
const MG_VALUE = [0, 82, 337, 365, 477, 1025, 0];
const EG_VALUE = [0, 94, 281, 297, 512, 936, 0];
const PHASE_WEIGHT = [0, 0, 1, 1, 2, 4, 0]; // Суммарно до 24 в начале партии

// PeSTO Piece-Square Tables (с точки зрения белых: sq = 0 -> a8, sq = 63 -> h1)
const MG_PAWN = [
   0,   0,   0,   0,   0,   0,   0,   0,
  98, 134,  61,  95,  68, 126,  34, -11,
  -6,   7,  26,  31,  65,  56,  25, -20,
 -14,  13,   6,  21,  23,  12,  17, -23,
 -27,  -2,  -5,  12,  17,   6,  10, -25,
 -26,  -4,  -4, -10,   3,   3,  33, -12,
 -35,  -1, -20, -23, -15,  24,  38, -22,
   0,   0,   0,   0,   0,   0,   0,   0
];

const EG_PAWN = [
   0,   0,   0,   0,   0,   0,   0,   0,
 178, 173, 158, 134, 147, 132, 165, 187,
  94, 100,  85,  67,  56,  53,  82,  84,
  32,  24,  13,   5,  -2,   4,  17,  17,
  13,   9,  -3,  -7,  -7,  -8,   3,  -1,
   4,   7,  -6,   1,   0,  -5,  -1,  -8,
  13,   8,   8,  10,  13,   0,   2,  -7,
   0,   0,   0,   0,   0,   0,   0,   0
];

const MG_KNIGHT = [
 -167, -89, -34, -49,  61, -97, -15, -107,
  -73, -41,  72,  36,  23,  62,   7,  -17,
  -47,  60,  37,  65,  84, 129,  73,   44,
   -9,  17,  19,  53,  37,  69,  18,   22,
  -13,   4,  16,  13,  28,  19,  21,   -8,
  -23,  -9,  12,  10,  19,  17,  25,  -16,
  -29, -53, -12,  -3,  -1,  18, -14,  -19,
 -105, -21, -58, -33, -17, -28, -19,  -23
];

const EG_KNIGHT = [
 -58, -38, -13, -28, -31, -27, -63, -99,
 -25,  -8, -25,  -2,  -9, -25, -24, -52,
 -24, -20,  10,   9,  -1,  -9, -19, -41,
 -17,   3,  22,  22,  22,  11,   8, -18,
 -18,  -6,  16,  25,  16,  17,   4, -18,
 -23,  -3,  -1,  15,  10,  -3, -20, -22,
 -42, -20, -10,  -5,  -2, -20, -23, -44,
 -29, -51, -23, -15, -22, -18, -50, -64
];

const MG_BISHOP = [
 -29,   4, -82, -37, -25, -42,   7,  -8,
 -26,  16, -18, -13,  30,  59,  18, -47,
 -16,  37,  43,  40,  35,  50,  37,  -2,
  -4,   5,  19,  50,  37,  37,   7,  -2,
  -6,  13,  13,  26,  34,  12,  10,   4,
   0,  15,  15,  15,  14,  27,  18,  10,
   4,  15,  16,   0,   7,  21,  33,   1,
 -33,  -3, -14, -21, -13, -12, -39, -21
];

const EG_BISHOP = [
 -14, -21, -11,  -8, -7,  -9, -17, -24,
  -8,  -4,   7, -12, -3, -13,  -4, -14,
   2,  -8,   0,  -1, -2,   6,   0,   4,
  -3,   9,  12,   9, 14,  10,   3,   2,
  -6,   3,  13,  19,  7,  10,  -3,  -9,
 -12,  -3,   8,  10, 13,   3,  -7, -15,
 -14, -18,  -7,  -1,  4,  -9, -15, -27,
 -23,  -9, -23,  -5, -9, -16,  -5, -17
];

const MG_ROOK = [
  32,  42,  32,  51, 63,  9,  31,  43,
  27,  32,  58,  62, 80, 67,  26,  44,
  -5,  19,  26,  36, 17, 45,  61,  16,
 -24, -11,   7,  26, 24, 35,  -8, -20,
 -36, -26, -12,  -1,  9, -7,   6, -23,
 -45, -25, -16, -17,  3,  0,  -5, -33,
 -44, -16, -20,  -9, -1, 11,  -6, -71,
 -19, -13,   1,  17, 16,  7, -37, -26
];

const EG_ROOK = [
  13, 10, 18, 15, 12,  12,   8,   5,
  11, 13, 13, 11, -3,   3,   8,   3,
   7,  7,  7,  5,  4,  -3,  -5,  -3,
   4,  3, 13,  1,  2,   1,  -1,   2,
   3,  5,  8,  4, -5,  -6,  -8, -11,
  -4,  0, -5, -1, -7, -12,  -8, -16,
  -6, -6,  0,  2, -9,  -9, -11,  -3,
  -9,  2,  3, -1, -5, -13,   4, -20
];

const MG_QUEEN = [
 -28,   0,  29,  12,  59,  44,  43,  45,
 -24, -39,  -5,   1, -16,  57,  28,  54,
 -13, -17,   7,   8,  29,  56,  47,  57,
 -27, -27, -16, -16,  -1,  17,  -2,   1,
  -9, -26,  -9, -10,  -2,  -4,   3,  -3,
 -14,   2, -11,  -2,  -5,   2,  14,   5,
 -35,  -8,  11,   2,   8,  15,  -3,   1,
  -1, -18,  -9,  10, -15, -25, -31, -50
];

const EG_QUEEN = [
  -9,  22,  22,  27,  27,  19,  10,  20,
 -17,  20,  32,  41,  58,  25,  30,   0,
 -20,   6,   9,  49,  47,  35,  19,   9,
   3,  22,  24,  45,  57,  40,  57,  36,
 -18,  28,  19,  47,  31,  34,  39,  23,
 -16, -27,  15,   6,   9,  17,  10,   5,
 -22, -23, -30, -16, -16, -23, -36, -32,
 -33, -28, -22, -43,  -5, -32, -20, -41
];

const MG_KING = [
 -65,  23,  16, -15, -56, -34,   2,  13,
  29,  -1, -20,  -7,  -8,  -4, -38, -29,
  -9,  24,   2, -16, -20,   6,  22, -22,
 -17, -20, -12, -27, -30, -25, -14, -36,
 -49,  -1, -27, -39, -46, -44, -33, -51,
 -14, -14, -22, -46, -44, -30, -15, -27,
   1,   7,  -8, -64, -43, -16,   9,   8,
 -15,  36,  12, -54,   8, -28,  24,  14
];

const EG_KING = [
 -74, -35, -18, -18, -11,  15,   4, -17,
 -12,  17,  14,  17,  17,  38,  23,  11,
  10,  17,  23,  15,  20,  45,  44,  13,
  -8,  22,  24,  27,  26,  33,  26,   3,
 -18,  -4,  21,  24,  27,  23,   9, -11,
 -19,  -3,  11,  21,  23,  16,   7,  -9,
 -27, -11,   4,  13,  14,   4,  -5, -17,
 -53, -34, -21, -11, -28, -14, -24, -43
];

const MG_TABLES = [null, MG_PAWN, MG_KNIGHT, MG_BISHOP, MG_ROOK, MG_QUEEN, MG_KING];
const EG_TABLES = [null, EG_PAWN, EG_KNIGHT, EG_BISHOP, EG_ROOK, EG_QUEEN, EG_KING];

// Предвычисленные таблицы для белых и чёрных фигур (индекс p + 6, sq 0..63)
const FULL_MG = Array.from({ length: 13 }, () => new Int16Array(64));
const FULL_EG = Array.from({ length: 13 }, () => new Int16Array(64));

for (let p = 1; p <= 6; p++) {
  for (let sq = 0; sq < 64; sq++) {
    // Белые: p + 6
    FULL_MG[p + 6][sq] = MG_VALUE[p] + MG_TABLES[p][sq];
    FULL_EG[p + 6][sq] = EG_VALUE[p] + EG_TABLES[p][sq];
    // Чёрные: -p + 6, зеркально по вертикали (sq ^ 56)
    const mirrorSq = sq ^ 56;
    FULL_MG[-p + 6][sq] = -(MG_VALUE[p] + MG_TABLES[p][mirrorSq]);
    FULL_EG[-p + 6][sq] = -(EG_VALUE[p] + EG_TABLES[p][mirrorSq]);
  }
}

// Расстояние до центра для Mop-Up в эндшпиле
const CENTER_MANHATTAN = new Uint8Array(64);
for (let sq = 0; sq < 64; sq++) {
  const r = sq >> 3;
  const c = sq & 7;
  const dr = r < 4 ? 3 - r : r - 4;
  const dc = c < 4 ? 3 - c : c - 4;
  CENTER_MANHATTAN[sq] = dr + dc;
}

// Богатая дебютная книга с распознаванием названия дебюта (по последовательности UCI ходов)
export const OPENING_LINES = [
  { name: 'Итальянская партия (Giuoco Piano)', moves: ['e2e4', 'e7e5', 'g1f3', 'b8c6', 'f1c4', 'f8c5', 'c2c3', 'g8f6', 'd2d4', 'e5d4', 'c3d4', 'c5b4'] },
  { name: 'Защита двух коней', moves: ['e2e4', 'e7e5', 'g1f3', 'b8c6', 'f1c4', 'g8f6', 'd2d3', 'f8e7', 'e1g1', 'e8g8'] },
  { name: 'Испанская партия (Рюи Лопес)', moves: ['e2e4', 'e7e5', 'g1f3', 'b8c6', 'f1b5', 'a7a6', 'b5a4', 'g8f6', 'e1g1', 'f8e7', 'f1e1', 'b7b5', 'a4b3', 'd7d6'] },
  { name: 'Берлинская защита', moves: ['e2e4', 'e7e5', 'g1f3', 'b8c6', 'f1b5', 'g8f6', 'e1g1', 'f6e4', 'd2d4', 'f8e7'] },
  { name: 'Шотландская партия', moves: ['e2e4', 'e7e5', 'g1f3', 'b8c6', 'd2d4', 'e5d4', 'f3d4', 'g8f6', 'b1c3', 'f8b4'] },
  { name: 'Русская партия (Защита Петрова)', moves: ['e2e4', 'e7e5', 'g1f3', 'g8f6', 'f3e5', 'd7d6', 'e5f3', 'f6e4', 'd2d4', 'd6d5'] },
  { name: 'Венская партия', moves: ['e2e4', 'e7e5', 'b1c3', 'g8f6', 'f2f4', 'd7d5', 'f4e5', 'f6e4'] },
  { name: 'Королевский гамбит', moves: ['e2e4', 'e7e5', 'f2f4', 'e5f4', 'g1f3', 'g7g5', 'f1c4', 'f8g7'] },
  { name: 'Сицилианская защита: Вариант Найдорфа', moves: ['e2e4', 'c7c5', 'g1f3', 'd7d6', 'd2d4', 'c5d4', 'f3d4', 'g8f6', 'b1c3', 'a7a6', 'f1e2', 'e7e5'] },
  { name: 'Сицилианская защита: Вариант Дракона', moves: ['e2e4', 'c7c5', 'g1f3', 'd7d6', 'd2d4', 'c5d4', 'f3d4', 'g8f6', 'b1c3', 'g7g6', 'f1e3', 'f8g7'] },
  { name: 'Сицилианская защита: Атака Россолимо', moves: ['e2e4', 'c7c5', 'g1f3', 'b8c6', 'f1b5', 'g7g6', 'e1g1', 'f8g7'] },
  { name: 'Сицилианская защита: Вариант Алапина', moves: ['e2e4', 'c7c5', 'c2c3', 'g8f6', 'e4e5', 'f6d5', 'd2d4', 'c5d4'] },
  { name: 'Французская защита', moves: ['e2e4', 'e7e6', 'd2d4', 'd7d5', 'b1c3', 'g8f6', 'c1g5', 'f8e7', 'e4e5', 'f6d7'] },
  { name: 'Французская защита: Продвинутый вариант', moves: ['e2e4', 'e7e6', 'd2d4', 'd7d5', 'e4e5', 'c7c5', 'c2c3', 'b8c6', 'g1f3', 'd8b6'] },
  { name: 'Защита Каро-Канн', moves: ['e2e4', 'c7c6', 'd2d4', 'd7d5', 'b1c3', 'd5e4', 'c3e4', 'c8f5', 'e4g3', 'f5g6'] },
  { name: 'Скандинавская защита', moves: ['e2e4', 'd7d5', 'e4d5', 'd8d5', 'b1c3', 'd5a5', 'd2d4', 'g8f6'] },
  { name: 'Защита Пирца-Уфимцева', moves: ['e2e4', 'd7d6', 'd2d4', 'g8f6', 'b1c3', 'g7g6', 'f1e2', 'f8g7'] },
  { name: 'Ферзевый гамбит (Отказанный)', moves: ['d2d4', 'd7d5', 'c2c4', 'e7e6', 'b1c3', 'g8f6', 'c1g5', 'f8e7', 'e2e3', 'e8g8'] },
  { name: 'Ферзевый гамбит (Принятый)', moves: ['d2d4', 'd7d5', 'c2c4', 'd5c4', 'g1f3', 'g8f6', 'e2e3', 'e7e6', 'f1c4', 'c7c5'] },
  { name: 'Славянская защита', moves: ['d2d4', 'd7d5', 'c2c4', 'c7c6', 'g1f3', 'g8f6', 'b1c3', 'd5c4', 'a2a4', 'c8f5'] },
  { name: 'Лондонская система', moves: ['d2d4', 'd7d5', 'c1f4', 'g8f6', 'e2e3', 'c7c5', 'c2c3', 'b8c6', 'b1d2', 'e7e6'] },
  { name: 'Защита Нимцовича', moves: ['d2d4', 'g8f6', 'c2c4', 'e7e6', 'b1c3', 'f8b4', 'e2e3', 'e8g8', 'f1d3', 'd7d5'] },
  { name: 'Староиндийская защита', moves: ['d2d4', 'g8f6', 'c2c4', 'g7g6', 'b1c3', 'f8g7', 'e2e4', 'd7d6', 'g1f3', 'e8g8', 'f1e2', 'e7e5'] },
  { name: 'Защита Грюнфельда', moves: ['d2d4', 'g8f6', 'c2c4', 'g7g6', 'b1c3', 'd7d5', 'c4d5', 'f6d5', 'e2e4', 'd5c3', 'b2c3', 'f8g7'] },
  { name: 'Английское начало', moves: ['c2c4', 'e7e5', 'b1c3', 'g8f6', 'g2g3', 'd7d5', 'c4d5', 'f6d5', 'f1g2', 'd5b6'] },
  { name: 'Дебют Рети', moves: ['g1f3', 'd7d5', 'c2c4', 'd5c4', 'e2e3', 'g8f6', 'f1c4', 'e7e6'] }
];

export function detectOpeningName(uciHistory) {
  if (!uciHistory || uciHistory.length === 0) return 'Начальная позиция';
  let bestMatch = null;
  let bestLen = 0;

  for (const line of OPENING_LINES) {
    const checkLen = Math.min(uciHistory.length, line.moves.length);
    let matches = true;
    let matchedCount = 0;
    for (let i = 0; i < checkLen; i++) {
      if (uciHistory[i] !== line.moves[i]) {
        matches = false;
        break;
      }
      matchedCount++;
    }
    if (matches && matchedCount > bestLen) {
      bestLen = matchedCount;
      bestMatch = line.name;
    } else if (!matches && matchedCount >= 3 && matchedCount > bestLen) {
      bestLen = matchedCount;
      bestMatch = line.name;
    }
  }

  if (bestMatch) return bestMatch;
  if (uciHistory[0] === 'e2e4') {
    if (uciHistory[1] === 'c7c5') return 'Сицилианская защита';
    if (uciHistory[1] === 'e7e5') return 'Открытый дебют';
    if (uciHistory[1] === 'e7e6') return 'Французская защита';
    if (uciHistory[1] === 'c7c6') return 'Защита Каро-Канн';
    return 'Дебют королевской пешки';
  }
  if (uciHistory[0] === 'd2d4') return 'Дебют ферзевой пешки';
  if (uciHistory[0] === 'c2c4') return 'Английское начало';
  if (uciHistory[0] === 'g1f3') return 'Дебют Зукерторта / Рети';
  return 'Нестандартный дебют';
}

function getBookMove(engine) {
  // Книга работает только если партия началась со стартовой позиции
  if (engine.history.length > 12) return null;
  if (engine.history.length > 0 && engine.history[0].fenBefore && !engine.history[0].fenBefore.startsWith('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR')) {
    return null;
  }

  const uciSeq = engine.history.map((h) => h.uci || moveToUci(h.move));
  const candidates = [];

  for (const line of OPENING_LINES) {
    if (line.moves.length <= uciSeq.length) continue;
    let match = true;
    for (let i = 0; i < uciSeq.length; i++) {
      if (line.moves[i] !== uciSeq[i]) {
        match = false;
        break;
      }
    }
    if (match) {
      candidates.push({ uci: line.moves[uciSeq.length], name: line.name });
    }
  }

  if (candidates.length === 0) return null;
  const pick = candidates[Math.floor(Math.random() * candidates.length)];
  const legal = engine.generateLegalMoves();
  const move = legal.find((m) => moveToUci(m) === pick.uci);
  return move ? { move, opening: pick.name } : null;
}

// Статическая оценка позиции с точки зрения Белых (в сантипешках)
export function evaluateWhitePerspective(engine) {
  const board = engine.board;
  let mgScore = 0;
  let egScore = 0;
  let phase = 0;

  let whiteBishops = 0;
  let blackBishops = 0;
  const whitePawnFiles = new Uint8Array(8);
  const blackPawnFiles = new Uint8Array(8);
  // Храним самую продвинутую (минимальный r для белых, максимальный r для чёрных) пешку на вертикали
  const whiteMinRank = new Uint8Array(8).fill(8);
  const blackMaxRank = new Int8Array(8).fill(-1);

  for (let sq = 0; sq < 64; sq++) {
    const p = board[sq];
    if (p === EMPTY) continue;

    const idx = p + 6;
    mgScore += FULL_MG[idx][sq];
    egScore += FULL_EG[idx][sq];

    const abs = p > 0 ? p : -p;
    phase += PHASE_WEIGHT[abs];

    if (p === BISHOP) whiteBishops++;
    else if (p === -BISHOP) blackBishops++;
    else if (p === PAWN) {
      const f = sq & 7;
      const r = sq >> 3;
      whitePawnFiles[f]++;
      if (r < whiteMinRank[f]) whiteMinRank[f] = r;
    } else if (p === -PAWN) {
      const f = sq & 7;
      const r = sq >> 3;
      blackPawnFiles[f]++;
      if (r > blackMaxRank[f]) blackMaxRank[f] = r;
    }
  }

  // Бонус за преимущество двух слонов
  if (whiteBishops >= 2) { mgScore += 32; egScore += 48; }
  if (blackBishops >= 2) { mgScore -= 32; egScore -= 48; }

  // Оценка пешечной структуры (сдвоенные, изолированные и проходные пешки)
  const PASSED_BONUS_EG = [0, 115, 72, 44, 24, 12, 6, 0];
  const PASSED_BONUS_MG = [0, 60, 38, 22, 12, 6, 0, 0];

  for (let f = 0; f < 8; f++) {
    if (whitePawnFiles[f] > 1) {
      const extra = whitePawnFiles[f] - 1;
      mgScore -= 12 * extra;
      egScore -= 20 * extra;
    }
    if (blackPawnFiles[f] > 1) {
      const extra = blackPawnFiles[f] - 1;
      mgScore += 12 * extra;
      egScore += 20 * extra;
    }

    // Изолированные пешки
    if (whitePawnFiles[f] > 0) {
      const hasNeighbor = (f > 0 && whitePawnFiles[f - 1] > 0) || (f < 7 && whitePawnFiles[f + 1] > 0);
      if (!hasNeighbor) {
        mgScore -= 14;
        egScore -= 18;
      }
      // Проверка проходной белой пешки на вертикали f
      const r = whiteMinRank[f];
      let blocked = false;
      for (let df = -1; df <= 1; df++) {
        const nf = f + df;
        if (nf < 0 || nf > 7 || blackPawnFiles[nf] === 0) continue;
        for (let checkR = 1; checkR < r; checkR++) {
          if (board[(checkR << 3) | nf] === -PAWN) {
            blocked = true;
            break;
          }
        }
        if (blocked) break;
      }
      if (!blocked) {
        mgScore += PASSED_BONUS_MG[r];
        egScore += PASSED_BONUS_EG[r];
      }
    }

    if (blackPawnFiles[f] > 0) {
      const hasNeighbor = (f > 0 && blackPawnFiles[f - 1] > 0) || (f < 7 && blackPawnFiles[f + 1] > 0);
      if (!hasNeighbor) {
        mgScore += 14;
        egScore += 18;
      }
      const r = blackMaxRank[f];
      let blocked = false;
      for (let df = -1; df <= 1; df++) {
        const nf = f + df;
        if (nf < 0 || nf > 7 || whitePawnFiles[nf] === 0) continue;
        for (let checkR = r + 1; checkR <= 6; checkR++) {
          if (board[(checkR << 3) | nf] === PAWN) {
            blocked = true;
            break;
          }
        }
        if (blocked) break;
      }
      if (!blocked) {
        const mirrorR = 7 - r;
        mgScore -= PASSED_BONUS_MG[mirrorR];
        egScore -= PASSED_BONUS_EG[mirrorR];
      }
    }
  }

  // Ладьи на открытых и полуоткрытых вертикалях
  for (let sq = 0; sq < 64; sq++) {
    const p = board[sq];
    if (p === ROOK) {
      const f = sq & 7;
      if (whitePawnFiles[f] === 0) {
        mgScore += blackPawnFiles[f] === 0 ? 22 : 12;
        egScore += blackPawnFiles[f] === 0 ? 16 : 10;
      }
    } else if (p === -ROOK) {
      const f = sq & 7;
      if (blackPawnFiles[f] === 0) {
        mgScore -= whitePawnFiles[f] === 0 ? 22 : 12;
        egScore -= whitePawnFiles[f] === 0 ? 16 : 10;
      }
    }
  }

  // Плавная интерполяция между миттельшпилем и эндшпилем
  const mgPhase = phase > 24 ? 24 : phase;
  const egPhase = 24 - mgPhase;
  let score = ((mgScore * mgPhase + egScore * egPhase) / 24) | 0;

  // Небольшой бонус за право хода (темп)
  score += engine.turn === WHITE ? 10 : -10;

  // Mop-Up в выигранном эндшпиле (оттеснение одинокого короля в угол и сближение королей)
  if (egPhase >= 16) {
    const wKing = engine.whiteKingSq;
    const bKing = engine.blackKingSq;
    const distKings =
      Math.abs((wKing >> 3) - (bKing >> 3)) + Math.abs((wKing & 7) - (bKing & 7));

    if (score > 280) {
      score += CENTER_MANHATTAN[bKing] * 14 + (14 - distKings) * 6;
    } else if (score < -280) {
      score -= CENTER_MANHATTAN[wKing] * 14 + (14 - distKings) * 6;
    }
  }

  return score;
}

// Константы флагов Transposition Table
const TT_EXACT = 1;
const TT_ALPHA = 2; // Upper bound
const TT_BETA = 3;  // Lower bound

const TT_SIZE = 1 << 18; // 262 144 записей (~6 МБ в типизированных массивах)
const TT_MASK = TT_SIZE - 1;

export const DIFFICULTY_PRESETS = {
  1: { name: 'Новичок', elo: '~800', maxDepth: 2, timeMs: 120, blunderNoise: 140, useBook: false },
  2: { name: 'Любитель', elo: '~1250', maxDepth: 3, timeMs: 260, blunderNoise: 38, useBook: true },
  3: { name: 'Клубный игрок', elo: '~1650', maxDepth: 5, timeMs: 550, blunderNoise: 8, useBook: true },
  4: { name: 'Кандидат в мастера', elo: '~1950', maxDepth: 7, timeMs: 1300, blunderNoise: 0, useBook: true },
  5: { name: 'Гроссмейстер ИИ', elo: '~2250+', maxDepth: 10, timeMs: 2600, blunderNoise: 0, useBook: true }
};

function packMove(move) {
  if (!move) return 0;
  const promo = move.promotion ? Math.abs(move.promotion) : 0;
  return (move.from & 63) | ((move.to & 63) << 6) | ((promo & 7) << 12);
}

export class ChessAI {
  constructor() {
    this.ttKeyHi = new Uint32Array(TT_SIZE);
    this.ttDepth = new Int8Array(TT_SIZE);
    this.ttFlag = new Uint8Array(TT_SIZE);
    this.ttScore = new Int16Array(TT_SIZE);
    this.ttMove = new Uint16Array(TT_SIZE);

    this.killers1 = new Uint16Array(64);
    this.killers2 = new Uint16Array(64);
    this.historyTable = new Int32Array(64 * 64);

    this.nodes = 0;
    this.startTime = 0;
    this.timeLimit = 1000;
    this.aborted = false;
  }

  clearTables() {
    this.ttKeyHi.fill(0);
    this.ttDepth.fill(-1);
    this.ttFlag.fill(0);
    this.ttScore.fill(0);
    this.ttMove.fill(0);
    this.killers1.fill(0);
    this.killers2.fill(0);
    this.historyTable.fill(0);
  }

  decayHistory() {
    for (let i = 0; i < this.historyTable.length; i++) {
      this.historyTable[i] >>= 2;
    }
    this.killers1.fill(0);
    this.killers2.fill(0);
  }

  evalRelative(engine) {
    const whiteScore = evaluateWhitePerspective(engine);
    return engine.turn === WHITE ? whiteScore : -whiteScore;
  }

  scoreMoves(moves, ttPacked, ply) {
    const scores = new Int32Array(moves.length);
    const k1 = ply < 64 ? this.killers1[ply] : 0;
    const k2 = ply < 64 ? this.killers2[ply] : 0;

    for (let i = 0; i < moves.length; i++) {
      const m = moves[i];
      const packed = packMove(m);
      if (packed === ttPacked && ttPacked !== 0) {
        scores[i] = 2000000;
      } else if (m.captured !== EMPTY || m.flags === FLAG_PROMOTION) {
        const victim = Math.abs(m.captured);
        const attacker = Math.abs(m.piece);
        const promoBonus = m.flags === FLAG_PROMOTION ? MG_VALUE[Math.abs(m.promotion)] : 0;
        // MVV-LVA (Most Valuable Victim - Least Valuable Attacker)
        scores[i] = 1000000 + victim * 100 - attacker + promoBonus;
      } else if (packed === k1) {
        scores[i] = 900000;
      } else if (packed === k2) {
        scores[i] = 850000;
      } else {
        scores[i] = this.historyTable[(m.from << 6) | m.to];
      }
    }
    return scores;
  }

  pickNextMove(moves, scores, startIdx) {
    let bestIdx = startIdx;
    let bestScore = scores[startIdx];
    for (let i = startIdx + 1; i < moves.length; i++) {
      if (scores[i] > bestScore) {
        bestScore = scores[i];
        bestIdx = i;
      }
    }
    if (bestIdx !== startIdx) {
      const tmpM = moves[startIdx];
      moves[startIdx] = moves[bestIdx];
      moves[bestIdx] = tmpM;
      const tmpS = scores[startIdx];
      scores[startIdx] = scores[bestIdx];
      scores[bestIdx] = tmpS;
    }
    return moves[startIdx];
  }

  quiescence(engine, alpha, beta, ply) {
    if ((this.nodes & 2047) === 0) {
      if (performance.now() - this.startTime >= this.timeLimit) {
        this.aborted = true;
        return 0;
      }
    }
    this.nodes++;

    const inCheck = engine.inCheck();

    if (!inCheck) {
      const standPat = this.evalRelative(engine);
      if (standPat >= beta) return beta;
      if (standPat > alpha) alpha = standPat;
    }

    if (ply >= 48) {
      return this.evalRelative(engine);
    }

    // Если под шахом — генерируем все уходы от шаха, иначе только взятия и превращения
    const pseudo = engine.generatePseudoMoves(!inCheck);
    const scores = this.scoreMoves(pseudo, 0, ply);
    let legalCount = 0;

    for (let i = 0; i < pseudo.length; i++) {
      const move = this.pickNextMove(pseudo, scores, i);
      if (!engine.makeMove(move)) continue;
      legalCount++;

      const score = -this.quiescence(engine, -beta, -alpha, ply + 1);
      engine.undoMove();

      if (this.aborted) return 0;
      if (score >= beta) return beta;
      if (score > alpha) alpha = score;
    }

    if (inCheck && legalCount === 0) {
      return -MATE_SCORE + ply;
    }

    return alpha;
  }

  negamax(engine, depth, alpha, beta, ply, isPv) {
    if ((this.nodes & 2047) === 0) {
      if (performance.now() - this.startTime >= this.timeLimit) {
        this.aborted = true;
        return 0;
      }
    }

    // Ничья по правилу 50 ходов или повторению в дереве поиска
    if (ply > 0) {
      if (engine.halfMoves >= 100 || engine.countRepetitions() >= 3 || engine.isInsufficientMaterial()) {
        return 0;
      }
    }

    const inCheck = engine.inCheck();
    // Check extension: продлеваем поиск на 1 полуход при шахе
    if (inCheck && ply < 40) {
      depth += 1;
    }

    if (depth <= 0) {
      return this.quiescence(engine, alpha, beta, ply);
    }

    this.nodes++;
    const origAlpha = alpha;

    // Чтение из Transposition Table
    const ttIdx = engine.hashLo & TT_MASK;
    let ttPacked = 0;
    if (this.ttFlag[ttIdx] !== 0 && this.ttKeyHi[ttIdx] === engine.hashHi) {
      ttPacked = this.ttMove[ttIdx];
      if (!isPv && this.ttDepth[ttIdx] >= depth) {
        let ttVal = this.ttScore[ttIdx];
        if (ttVal > MATE_SCORE - 100) ttVal -= ply;
        else if (ttVal < -MATE_SCORE + 100) ttVal += ply;

        const flag = this.ttFlag[ttIdx];
        if (flag === TT_EXACT) return ttVal;
        if (flag === TT_ALPHA && ttVal <= alpha) return alpha;
        if (flag === TT_BETA && ttVal >= beta) return beta;
      }
    }

    const pseudo = engine.generatePseudoMoves(false);
    const scores = this.scoreMoves(pseudo, ttPacked, ply);

    let legalCount = 0;
    let bestScore = -INF;
    let bestMove = null;

    for (let i = 0; i < pseudo.length; i++) {
      const move = this.pickNextMove(pseudo, scores, i);
      if (!engine.makeMove(move)) continue;
      legalCount++;

      let score;
      const isQuiet = move.captured === EMPTY && move.flags !== FLAG_PROMOTION;
      const givesCheck = engine.inCheck();

      if (legalCount === 1) {
        score = -this.negamax(engine, depth - 1, -beta, -alpha, ply + 1, isPv);
      } else {
        // Late Move Reductions (LMR) для спокойных поздних ходов
        let reduction = 0;
        if (depth >= 3 && legalCount >= 4 && isQuiet && !inCheck && !givesCheck && !isPv) {
          reduction = legalCount >= 10 ? 2 : 1;
        }

        score = -this.negamax(engine, depth - 1 - reduction, -alpha - 1, -alpha, ply + 1, false);

        if (score > alpha && reduction > 0 && !this.aborted) {
          score = -this.negamax(engine, depth - 1, -alpha - 1, -alpha, ply + 1, false);
        }
        if (score > alpha && score < beta && isPv && !this.aborted) {
          score = -this.negamax(engine, depth - 1, -beta, -alpha, ply + 1, true);
        }
      }

      engine.undoMove();
      if (this.aborted) return 0;

      if (score > bestScore) {
        bestScore = score;
        bestMove = move;
      }

      if (score > alpha) {
        alpha = score;
      }

      if (alpha >= beta) {
        // Сохраняем тихий ход, вызвавший отсечение, в Killer Moves и History
        if (isQuiet && ply < 64) {
          const packed = packMove(move);
          if (this.killers1[ply] !== packed) {
            this.killers2[ply] = this.killers1[ply];
            this.killers1[ply] = packed;
          }
          const hIdx = (move.from << 6) | move.to;
          this.historyTable[hIdx] += depth * depth;
          if (this.historyTable[hIdx] > 400000) {
            this.historyTable[hIdx] >>= 1;
          }
        }
        break;
      }
    }

    if (legalCount === 0) {
      return inCheck ? -MATE_SCORE + ply : 0;
    }

    // Запись в Transposition Table
    let storeScore = bestScore;
    if (storeScore > MATE_SCORE - 100) storeScore += ply;
    else if (storeScore < -MATE_SCORE + 100) storeScore -= ply;

    let flag = TT_EXACT;
    if (bestScore <= origAlpha) flag = TT_ALPHA;
    else if (bestScore >= beta) flag = TT_BETA;

    this.ttKeyHi[ttIdx] = engine.hashHi;
    this.ttDepth[ttIdx] = depth;
    this.ttFlag[ttIdx] = flag;
    this.ttScore[ttIdx] = Math.max(-32000, Math.min(32000, storeScore));
    if (bestMove) {
      this.ttMove[ttIdx] = packMove(bestMove);
    }

    return bestScore;
  }

  // Извлечение Principal Variation (лучшего расчётного варианта) в нотации SAN
  extractPvSan(engine, firstMove, maxLen = 6) {
    const pvSan = [];
    const applied = [];

    if (firstMove) {
      const legal = engine.generateLegalMoves();
      const match = legal.find(
        (m) => m.from === firstMove.from && m.to === firstMove.to && m.promotion === firstMove.promotion
      );
      if (match) {
        pvSan.push(engine.moveToSan(match, legal));
        engine.makeMove(match);
        applied.push(1);
      }
    }

    const seenHashes = new Set();
    while (pvSan.length < maxLen) {
      const hKey = engine.getHashKey();
      if (seenHashes.has(hKey)) break;
      seenHashes.add(hKey);

      const ttIdx = engine.hashLo & TT_MASK;
      if (this.ttFlag[ttIdx] === 0 || this.ttKeyHi[ttIdx] !== engine.hashHi) break;
      const packed = this.ttMove[ttIdx];
      if (!packed) break;

      const from = packed & 63;
      const to = (packed >> 6) & 63;
      const promo = (packed >> 12) & 7;

      const legal = engine.generateLegalMoves();
      const nextMove = legal.find(
        (m) => m.from === from && m.to === to && (promo === 0 || Math.abs(m.promotion) === promo)
      );
      if (!nextMove) break;

      pvSan.push(engine.moveToSan(nextMove, legal));
      engine.makeMove(nextMove);
      applied.push(1);
    }

    for (let i = 0; i < applied.length; i++) {
      engine.undoMove();
    }
    return pvSan;
  }

  findBestMove(engine, level = 4, onProgress = null) {
    const preset = DIFFICULTY_PRESETS[level] || DIFFICULTY_PRESETS[4];
    const legalMoves = engine.generateLegalMoves();
    if (legalMoves.length === 0) return null;

    const uciHistory = engine.history.map((h) => h.uci || moveToUci(h.move));
    const currentOpening = detectOpeningName(uciHistory);

    // 1. Проверка дебютной книги
    if (preset.useBook) {
      const bookHit = getBookMove(engine);
      if (bookHit) {
        const san = engine.moveToSan(bookHit.move, legalMoves);
        engine.makeMove(bookHit.move);
        const whiteEval = evaluateWhitePerspective(engine);
        engine.undoMove();
        return {
          move: bookHit.move,
          san,
          uci: moveToUci(bookHit.move),
          scoreWhite: whiteEval,
          depth: 0,
          nodes: 1,
          nps: 0,
          elapsedMs: 4,
          book: true,
          opening: bookHit.opening,
          pv: [san]
        };
      }
    }

    // Единственный возможный ход — отвечаем быстро, но считаем оценку
    this.decayHistory();
    this.nodes = 0;
    this.startTime = performance.now();
    this.timeLimit = legalMoves.length === 1 ? Math.min(180, preset.timeMs) : preset.timeMs;
    this.aborted = false;

    let bestMove = legalMoves[0];
    let bestScoreRel = -INF;
    let completedDepth = 1;
    let rootMoveScores = legalMoves.map((m) => ({ move: m, score: 0 }));

    for (let depth = 1; depth <= preset.maxDepth; depth++) {
      // Сортируем корневые ходы по результатам предыдущей итерации Iterative Deepening
      rootMoveScores.sort((a, b) => b.score - a.score);

      let alpha = -INF;
      const beta = INF;
      let iterBestMove = rootMoveScores[0].move;
      let iterBestScore = -INF;
      const newScores = [];

      for (let i = 0; i < rootMoveScores.length; i++) {
        const move = rootMoveScores[i].move;
        engine.makeMove(move);

        let score;
        if (i === 0) {
          score = -this.negamax(engine, depth - 1, -beta, -alpha, 1, true);
        } else {
          score = -this.negamax(engine, depth - 1, -alpha - 1, -alpha, 1, false);
          if (score > alpha && !this.aborted) {
            score = -this.negamax(engine, depth - 1, -beta, -alpha, 1, true);
          }
        }

        engine.undoMove();
        if (this.aborted) break;

        newScores.push({ move, score });
        if (score > iterBestScore) {
          iterBestScore = score;
          iterBestMove = move;
        }
        if (score > alpha) {
          alpha = score;
        }
      }

      if (this.aborted) {
        // Если успели рассмотреть часть ходов на этой глубине и нашли ход заметно лучше
        if (newScores.length > 0 && iterBestScore > bestScoreRel + 50) {
          bestMove = iterBestMove;
          bestScoreRel = iterBestScore;
        }
        break;
      }

      bestMove = iterBestMove;
      bestScoreRel = iterBestScore;
      completedDepth = depth;
      rootMoveScores = newScores;

      const elapsed = Math.max(1, performance.now() - this.startTime);
      const nps = Math.round((this.nodes * 1000) / elapsed);
      const scoreWhite = engine.turn === WHITE ? bestScoreRel : -bestScoreRel;
      const pv = this.extractPvSan(engine, bestMove, 6);

      if (onProgress) {
        onProgress({
          depth: completedDepth,
          nodes: this.nodes,
          nps,
          scoreWhite,
          pv,
          opening: currentOpening
        });
      }

      // Если найден форсированный мат — дальше не углубляемся
      if (Math.abs(bestScoreRel) > MATE_SCORE - 100) {
        break;
      }

      // Если прошло уже больше 60% лимита времени, следующая глубина вряд ли завершится
      if (elapsed > this.timeLimit * 0.62) {
        break;
      }
    }

    // Для низких уровней сложности добавляем контролируемую человеческую неточность
    if (preset.blunderNoise > 0 && rootMoveScores.length > 1) {
      const noisy = rootMoveScores.map((item) => ({
        move: item.move,
        noisyScore: item.score + (Math.random() * 2 - 1) * preset.blunderNoise
      }));
      noisy.sort((a, b) => b.noisyScore - a.noisyScore);
      bestMove = noisy[0].move;
      const pickedOrig = rootMoveScores.find((x) => x.move === bestMove);
      if (pickedOrig) bestScoreRel = pickedOrig.score;
    }

    const elapsedMs = Math.max(1, Math.round(performance.now() - this.startTime));
    const nps = Math.round((this.nodes * 1000) / elapsedMs);
    const scoreWhite = engine.turn === WHITE ? bestScoreRel : -bestScoreRel;
    const san = engine.moveToSan(bestMove, legalMoves);
    const pv = this.extractPvSan(engine, bestMove, 6);

    return {
      move: bestMove,
      san,
      uci: moveToUci(bestMove),
      scoreWhite,
      depth: completedDepth,
      nodes: this.nodes,
      nps,
      elapsedMs,
      book: false,
      opening: currentOpening,
      pv
    };
  }
}
