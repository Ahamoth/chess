// Полноценный шахматный движок по правилам FIDE
// Поддерживает: все легальные ходы, рокировку, взятие на проходе, превращение пешек,
// Zobrist-хеширование (2x32-bit без аллокаций в поиске), троекратное повторение,
// правило 50 ходов, недостаток материала, импорт/экспорт FEN, SAN и PGN.

export const EMPTY = 0;
export const PAWN = 1;
export const KNIGHT = 2;
export const BISHOP = 3;
export const ROOK = 4;
export const QUEEN = 5;
export const KING = 6;

export const WHITE = 1;
export const BLACK = -1;

export const CASTLE_WK = 1;
export const CASTLE_WQ = 2;
export const CASTLE_BK = 4;
export const CASTLE_BQ = 8;

export const FLAG_NORMAL = 0;
export const FLAG_DOUBLE_PAWN = 1;
export const FLAG_EN_PASSANT = 2;
export const FLAG_CASTLE_K = 3;
export const FLAG_CASTLE_Q = 4;
export const FLAG_PROMOTION = 5;

export const START_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

const FILES = 'abcdefgh';
const RANKS = '87654321';

const PIECE_CHARS = {
  1: 'P', 2: 'N', 3: 'B', 4: 'R', 5: 'Q', 6: 'K',
  '-1': 'p', '-2': 'n', '-3': 'b', '-4': 'r', '-5': 'q', '-6': 'k'
};

const CHAR_TO_PIECE = {
  P: 1, N: 2, B: 3, R: 4, Q: 5, K: 6,
  p: -1, n: -2, b: -3, r: -4, q: -5, k: -6
};

const SAN_PIECE_LETTER = ['', '', 'N', 'B', 'R', 'Q', 'K'];

// Таблица сброса прав на рокировку при ходе с поля или на поле
const CASTLE_SPOIL = new Uint8Array(64).fill(15);
CASTLE_SPOIL[0] = 15 & ~CASTLE_BQ;  // a8
CASTLE_SPOIL[4] = 15 & ~(CASTLE_BK | CASTLE_BQ); // e8
CASTLE_SPOIL[7] = 15 & ~CASTLE_BK;  // h8
CASTLE_SPOIL[56] = 15 & ~CASTLE_WQ; // a1
CASTLE_SPOIL[60] = 15 & ~(CASTLE_WK | CASTLE_WQ); // e1
CASTLE_SPOIL[63] = 15 & ~CASTLE_WK; // h1

// Предвычисленные атаки коня и короля для каждого из 64 полей
const KNIGHT_ATTACKS = Array.from({ length: 64 }, () => []);
const KING_ATTACKS = Array.from({ length: 64 }, () => []);
// Лучи для слона/ладьи/ферзя: 8 направлений [dr, dc]
const RAY_DIRS = [
  [-1, 0], [1, 0], [0, -1], [0, 1],     // 0..3: ортогонали (ладья/ферзь)
  [-1, -1], [-1, 1], [1, -1], [1, 1]    // 4..7: диагонали (слон/ферзь)
];
const RAYS = Array.from({ length: 64 }, () => Array.from({ length: 8 }, () => []));

for (let sq = 0; sq < 64; sq++) {
  const r = sq >> 3;
  const c = sq & 7;

  const knightSteps = [
    [-2, -1], [-2, 1], [-1, -2], [-1, 2],
    [1, -2], [1, 2], [2, -1], [2, 1]
  ];
  for (const [dr, dc] of knightSteps) {
    const nr = r + dr, nc = c + dc;
    if (nr >= 0 && nr < 8 && nc >= 0 && nc < 8) {
      KNIGHT_ATTACKS[sq].push((nr << 3) | nc);
    }
  }

  for (let dr = -1; dr <= 1; dr++) {
    for (let dc = -1; dc <= 1; dc++) {
      if (dr === 0 && dc === 0) continue;
      const nr = r + dr, nc = c + dc;
      if (nr >= 0 && nr < 8 && nc >= 0 && nc < 8) {
        KING_ATTACKS[sq].push((nr << 3) | nc);
      }
    }
  }

  for (let d = 0; d < 8; d++) {
    const [dr, dc] = RAY_DIRS[d];
    let nr = r + dr, nc = c + dc;
    while (nr >= 0 && nr < 8 && nc >= 0 && nc < 8) {
      RAYS[sq][d].push((nr << 3) | nc);
      nr += dr;
      nc += dc;
    }
  }
}

// Детерминированный генератор Zobrist-ключей (2 x 32-bit Uint)
function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0);
  };
}

const rng = mulberry32(0xC0FFEE42);
// Индекс фигуры 0..12 (p + 6): -6..+6
const ZOBRIST_PIECE_LO = Array.from({ length: 13 }, () => new Uint32Array(64));
const ZOBRIST_PIECE_HI = Array.from({ length: 13 }, () => new Uint32Array(64));
for (let p = 0; p < 13; p++) {
  for (let sq = 0; sq < 64; sq++) {
    ZOBRIST_PIECE_LO[p][sq] = rng();
    ZOBRIST_PIECE_HI[p][sq] = rng();
  }
}
const ZOBRIST_CASTLE_LO = new Uint32Array(16);
const ZOBRIST_CASTLE_HI = new Uint32Array(16);
for (let i = 0; i < 16; i++) {
  ZOBRIST_CASTLE_LO[i] = rng();
  ZOBRIST_CASTLE_HI[i] = rng();
}
const ZOBRIST_EP_LO = new Uint32Array(65); // 0..63, 64 = нет взятия на проходе
const ZOBRIST_EP_HI = new Uint32Array(65);
for (let i = 0; i < 65; i++) {
  ZOBRIST_EP_LO[i] = rng();
  ZOBRIST_EP_HI[i] = rng();
}
const ZOBRIST_SIDE_LO = rng();
const ZOBRIST_SIDE_HI = rng();

export function sqToAlgebraic(sq) {
  if (sq < 0 || sq > 63) return '-';
  return FILES[sq & 7] + RANKS[sq >> 3];
}

export function algebraicToSq(str) {
  if (!str || str.length < 2 || str === '-') return -1;
  const c = FILES.indexOf(str[0]);
  const r = RANKS.indexOf(str[1]);
  if (c === -1 || r === -1) return -1;
  return (r << 3) | c;
}

export function moveToUci(move) {
  let uci = sqToAlgebraic(move.from) + sqToAlgebraic(move.to);
  if (move.promotion) {
    const letters = ['', '', 'n', 'b', 'r', 'q'];
    uci += letters[Math.abs(move.promotion)] || 'q';
  }
  return uci;
}

export class ChessEngine {
  constructor(fen = START_FEN) {
    this.board = new Int8Array(64);
    this.turn = WHITE;
    this.castling = 15;
    this.epSquare = -1;
    this.halfMoves = 0;
    this.fullMoves = 1;
    this.whiteKingSq = 60;
    this.blackKingSq = 4;
    this.hashLo = 0;
    this.hashHi = 0;
    this.history = [];
    this.loadFen(fen);
  }

  clone() {
    const copy = new ChessEngine(this.toFen());
    copy.history = this.history.map((h) => ({ ...h, move: { ...h.move } }));
    return copy;
  }

  computeHash() {
    let lo = 0;
    let hi = 0;
    for (let sq = 0; sq < 64; sq++) {
      const p = this.board[sq];
      if (p !== EMPTY) {
        lo ^= ZOBRIST_PIECE_LO[p + 6][sq];
        hi ^= ZOBRIST_PIECE_HI[p + 6][sq];
      }
    }
    lo ^= ZOBRIST_CASTLE_LO[this.castling];
    hi ^= ZOBRIST_CASTLE_HI[this.castling];
    const epIdx = this.epSquare === -1 ? 64 : this.epSquare;
    lo ^= ZOBRIST_EP_LO[epIdx];
    hi ^= ZOBRIST_EP_HI[epIdx];
    if (this.turn === BLACK) {
      lo ^= ZOBRIST_SIDE_LO;
      hi ^= ZOBRIST_SIDE_HI;
    }
    this.hashLo = lo >>> 0;
    this.hashHi = hi >>> 0;
  }

  getHashKey() {
    return `${this.hashHi.toString(16).padStart(8, '0')}${this.hashLo.toString(16).padStart(8, '0')}`;
  }

  loadFen(fen) {
    const parts = fen.trim().split(/\s+/);
    if (parts.length < 4) {
      throw new Error('Некорректная строка FEN: недостаточно полей');
    }

    const rows = parts[0].split('/');
    if (rows.length !== 8) {
      throw new Error('Некорректная строка FEN: должно быть 8 горизонталей');
    }

    const newBoard = new Int8Array(64);
    let wKing = -1;
    let bKing = -1;

    for (let r = 0; r < 8; r++) {
      let c = 0;
      for (const ch of rows[r]) {
        if (ch >= '1' && ch <= '8') {
          c += Number(ch);
        } else if (CHAR_TO_PIECE[ch] !== undefined) {
          if (c >= 8) throw new Error('Некорректная ширина горизонтали в FEN');
          const sq = (r << 3) | c;
          const piece = CHAR_TO_PIECE[ch];
          newBoard[sq] = piece;
          if (piece === KING) wKing = sq;
          if (piece === -KING) bKing = sq;
          c++;
        } else {
          throw new Error(`Неизвестный символ в FEN: ${ch}`);
        }
      }
      if (c !== 8) throw new Error('Некорректное число полей в горизонтали FEN');
    }

    if (wKing === -1 || bKing === -1) {
      throw new Error('В позиции должны присутствовать оба короля');
    }

    this.board = newBoard;
    this.whiteKingSq = wKing;
    this.blackKingSq = bKing;
    this.turn = parts[1] === 'b' ? BLACK : WHITE;

    let castling = 0;
    if (parts[2] !== '-') {
      if (parts[2].includes('K')) castling |= CASTLE_WK;
      if (parts[2].includes('Q')) castling |= CASTLE_WQ;
      if (parts[2].includes('k')) castling |= CASTLE_BK;
      if (parts[2].includes('q')) castling |= CASTLE_BQ;
    }
    this.castling = castling;
    this.epSquare = parts[3] === '-' ? -1 : algebraicToSq(parts[3]);
    this.halfMoves = parts[4] ? Math.max(0, parseInt(parts[4], 10) || 0) : 0;
    this.fullMoves = parts[5] ? Math.max(1, parseInt(parts[5], 10) || 1) : 1;
    this.history = [];
    this.computeHash();

    // Проверка: король не ходящей стороны не может находиться под шахом
    const opp = -this.turn;
    const oppKing = opp === WHITE ? this.whiteKingSq : this.blackKingSq;
    if (this.isSquareAttacked(oppKing, this.turn)) {
      throw new Error('Нелегальная позиция FEN: король соперника уже под боем');
    }
    return true;
  }

  toFen() {
    let boardStr = '';
    for (let r = 0; r < 8; r++) {
      let emptyCount = 0;
      for (let c = 0; c < 8; c++) {
        const p = this.board[(r << 3) | c];
        if (p === EMPTY) {
          emptyCount++;
        } else {
          if (emptyCount > 0) {
            boardStr += emptyCount;
            emptyCount = 0;
          }
          boardStr += PIECE_CHARS[p];
        }
      }
      if (emptyCount > 0) boardStr += emptyCount;
      if (r < 7) boardStr += '/';
    }

    const turnStr = this.turn === WHITE ? 'w' : 'b';
    let castleStr = '';
    if (this.castling & CASTLE_WK) castleStr += 'K';
    if (this.castling & CASTLE_WQ) castleStr += 'Q';
    if (this.castling & CASTLE_BK) castleStr += 'k';
    if (this.castling & CASTLE_BQ) castleStr += 'q';
    if (!castleStr) castleStr = '-';

    const epStr = this.epSquare === -1 ? '-' : sqToAlgebraic(this.epSquare);
    return `${boardStr} ${turnStr} ${castleStr} ${epStr} ${this.halfMoves} ${this.fullMoves}`;
  }

  // Проверяет, атаковано ли поле `sq` фигурами стороны `byColor` (WHITE = 1 или BLACK = -1)
  isSquareAttacked(sq, byColor) {
    const board = this.board;
    const r = sq >> 3;
    const c = sq & 7;

    // 1. Атаки пешек
    if (byColor === WHITE) {
      // Белые пешки атакуют снизу вверх (из r + 1 в r)
      if (r < 7) {
        if (c > 0 && board[((r + 1) << 3) | (c - 1)] === PAWN) return true;
        if (c < 7 && board[((r + 1) << 3) | (c + 1)] === PAWN) return true;
      }
    } else {
      // Чёрные пешки атакуют сверху вниз (из r - 1 в r)
      if (r > 0) {
        if (c > 0 && board[((r - 1) << 3) | (c - 1)] === -PAWN) return true;
        if (c < 7 && board[((r - 1) << 3) | (c + 1)] === -PAWN) return true;
      }
    }

    // 2. Атаки коней
    const targetKnight = KNIGHT * byColor;
    const kAttacks = KNIGHT_ATTACKS[sq];
    for (let i = 0; i < kAttacks.length; i++) {
      if (board[kAttacks[i]] === targetKnight) return true;
    }

    // 3. Атаки короля
    const targetKing = KING * byColor;
    const kingAttacks = KING_ATTACKS[sq];
    for (let i = 0; i < kingAttacks.length; i++) {
      if (board[kingAttacks[i]] === targetKing) return true;
    }

    // 4. Ортогональные лучи (ладья / ферзь)
    const targetRook = ROOK * byColor;
    const targetQueen = QUEEN * byColor;
    const sqRays = RAYS[sq];
    for (let d = 0; d < 4; d++) {
      const ray = sqRays[d];
      for (let i = 0; i < ray.length; i++) {
        const p = board[ray[i]];
        if (p !== EMPTY) {
          if (p === targetRook || p === targetQueen) return true;
          break;
        }
      }
    }

    // 5. Диагональные лучи (слон / ферзь)
    const targetBishop = BISHOP * byColor;
    for (let d = 4; d < 8; d++) {
      const ray = sqRays[d];
      for (let i = 0; i < ray.length; i++) {
        const p = board[ray[i]];
        if (p !== EMPTY) {
          if (p === targetBishop || p === targetQueen) return true;
          break;
        }
      }
    }

    return false;
  }

  inCheck(color = this.turn) {
    const kingSq = color === WHITE ? this.whiteKingSq : this.blackKingSq;
    return this.isSquareAttacked(kingSq, -color);
  }

  // Генерация псевдолегальных ходов (при capturesOnly = true — взятия и превращения для Quiescence Search)
  generatePseudoMoves(capturesOnly = false) {
    const moves = [];
    const board = this.board;
    const side = this.turn;

    for (let sq = 0; sq < 64; sq++) {
      const piece = board[sq];
      if (piece === EMPTY || (piece > 0 ? WHITE : BLACK) !== side) continue;

      const absPiece = piece > 0 ? piece : -piece;

      if (absPiece === PAWN) {
        const r = sq >> 3;
        const c = sq & 7;
        const dir = side === WHITE ? -1 : 1;
        const startRank = side === WHITE ? 6 : 1;
        const promoRank = side === WHITE ? 0 : 7;
        const nextR = r + dir;

        if (nextR >= 0 && nextR < 8) {
          const oneStep = (nextR << 3) | c;
          // Продвижение вперёд
          if (board[oneStep] === EMPTY) {
            if (nextR === promoRank) {
              for (const promo of [QUEEN, ROOK, BISHOP, KNIGHT]) {
                moves.push({
                  from: sq,
                  to: oneStep,
                  piece,
                  captured: EMPTY,
                  promotion: promo * side,
                  flags: FLAG_PROMOTION
                });
              }
            } else if (!capturesOnly) {
              moves.push({
                from: sq,
                to: oneStep,
                piece,
                captured: EMPTY,
                promotion: 0,
                flags: FLAG_NORMAL
              });
              // Двойной шаг со стартовой горизонтали
              if (r === startRank) {
                const twoStep = ((r + dir * 2) << 3) | c;
                if (board[twoStep] === EMPTY) {
                  moves.push({
                    from: sq,
                    to: twoStep,
                    piece,
                    captured: EMPTY,
                    promotion: 0,
                    flags: FLAG_DOUBLE_PAWN
                  });
                }
              }
            }
          }

          // Диагональные взятия и взятие на проходе
          for (const dc of [-1, 1]) {
            const nc = c + dc;
            if (nc < 0 || nc > 7) continue;
            const capSq = (nextR << 3) | nc;
            const target = board[capSq];
            if (target !== EMPTY && (target > 0 ? WHITE : BLACK) !== side) {
              if (nextR === promoRank) {
                for (const promo of [QUEEN, ROOK, BISHOP, KNIGHT]) {
                  moves.push({
                    from: sq,
                    to: capSq,
                    piece,
                    captured: target,
                    promotion: promo * side,
                    flags: FLAG_PROMOTION
                  });
                }
              } else {
                moves.push({
                  from: sq,
                  to: capSq,
                  piece,
                  captured: target,
                  promotion: 0,
                  flags: FLAG_NORMAL
                });
              }
            } else if (capSq === this.epSquare) {
              moves.push({
                from: sq,
                to: capSq,
                piece,
                captured: -PAWN * side,
                promotion: 0,
                flags: FLAG_EN_PASSANT
              });
            }
          }
        }
      } else if (absPiece === KNIGHT) {
        const targets = KNIGHT_ATTACKS[sq];
        for (let i = 0; i < targets.length; i++) {
          const to = targets[i];
          const target = board[to];
          if (target === EMPTY) {
            if (!capturesOnly) {
              moves.push({ from: sq, to, piece, captured: EMPTY, promotion: 0, flags: FLAG_NORMAL });
            }
          } else if ((target > 0 ? WHITE : BLACK) !== side) {
            moves.push({ from: sq, to, piece, captured: target, promotion: 0, flags: FLAG_NORMAL });
          }
        }
      } else if (absPiece === KING) {
        const targets = KING_ATTACKS[sq];
        for (let i = 0; i < targets.length; i++) {
          const to = targets[i];
          const target = board[to];
          if (target === EMPTY) {
            if (!capturesOnly) {
              moves.push({ from: sq, to, piece, captured: EMPTY, promotion: 0, flags: FLAG_NORMAL });
            }
          } else if ((target > 0 ? WHITE : BLACK) !== side) {
            moves.push({ from: sq, to, piece, captured: target, promotion: 0, flags: FLAG_NORMAL });
          }
        }

        // Рокировка (только если не ищем только взятия)
        if (!capturesOnly) {
          if (side === WHITE && sq === 60) {
            if (
              (this.castling & CASTLE_WK) &&
              board[61] === EMPTY &&
              board[62] === EMPTY &&
              board[63] === ROOK &&
              !this.isSquareAttacked(60, BLACK) &&
              !this.isSquareAttacked(61, BLACK) &&
              !this.isSquareAttacked(62, BLACK)
            ) {
              moves.push({ from: 60, to: 62, piece, captured: EMPTY, promotion: 0, flags: FLAG_CASTLE_K });
            }
            if (
              (this.castling & CASTLE_WQ) &&
              board[59] === EMPTY &&
              board[58] === EMPTY &&
              board[57] === EMPTY &&
              board[56] === ROOK &&
              !this.isSquareAttacked(60, BLACK) &&
              !this.isSquareAttacked(59, BLACK) &&
              !this.isSquareAttacked(58, BLACK)
            ) {
              moves.push({ from: 60, to: 58, piece, captured: EMPTY, promotion: 0, flags: FLAG_CASTLE_Q });
            }
          } else if (side === BLACK && sq === 4) {
            if (
              (this.castling & CASTLE_BK) &&
              board[5] === EMPTY &&
              board[6] === EMPTY &&
              board[7] === -ROOK &&
              !this.isSquareAttacked(4, WHITE) &&
              !this.isSquareAttacked(5, WHITE) &&
              !this.isSquareAttacked(6, WHITE)
            ) {
              moves.push({ from: 4, to: 6, piece, captured: EMPTY, promotion: 0, flags: FLAG_CASTLE_K });
            }
            if (
              (this.castling & CASTLE_BQ) &&
              board[3] === EMPTY &&
              board[2] === EMPTY &&
              board[1] === EMPTY &&
              board[0] === -ROOK &&
              !this.isSquareAttacked(4, WHITE) &&
              !this.isSquareAttacked(3, WHITE) &&
              !this.isSquareAttacked(2, WHITE)
            ) {
              moves.push({ from: 4, to: 2, piece, captured: EMPTY, promotion: 0, flags: FLAG_CASTLE_Q });
            }
          }
        }
      } else {
        // Слон, ладья, ферзь
        const startDir = absPiece === BISHOP ? 4 : 0;
        const endDir = absPiece === ROOK ? 4 : 8;
        const sqRays = RAYS[sq];
        for (let d = startDir; d < endDir; d++) {
          const ray = sqRays[d];
          for (let i = 0; i < ray.length; i++) {
            const to = ray[i];
            const target = board[to];
            if (target === EMPTY) {
              if (!capturesOnly) {
                moves.push({ from: sq, to, piece, captured: EMPTY, promotion: 0, flags: FLAG_NORMAL });
              }
            } else {
              if ((target > 0 ? WHITE : BLACK) !== side) {
                moves.push({ from: sq, to, piece, captured: target, promotion: 0, flags: FLAG_NORMAL });
              }
              break;
            }
          }
        }
      }
    }

    return moves;
  }

  // Выполняет ход и обновляет Zobrist-хеш за O(1); возвращает true, если ход легален (свой король не под боем)
  makeMove(move) {
    const board = this.board;
    const side = this.turn;
    const { from, to, piece, captured, promotion, flags } = move;

    const prevCastling = this.castling;
    const prevEp = this.epSquare;
    const prevHalfMoves = this.halfMoves;
    const prevFullMoves = this.fullMoves;
    const prevHashLo = this.hashLo;
    const prevHashHi = this.hashHi;

    let lo = prevHashLo;
    let hi = prevHashHi;

    // Убираем старый ep и старую рокировку из хеша
    const oldEpIdx = prevEp === -1 ? 64 : prevEp;
    lo ^= ZOBRIST_EP_LO[oldEpIdx] ^ ZOBRIST_CASTLE_LO[prevCastling];
    hi ^= ZOBRIST_EP_HI[oldEpIdx] ^ ZOBRIST_CASTLE_HI[prevCastling];

    // Снимаем фигуру с поля отправления
    board[from] = EMPTY;
    lo ^= ZOBRIST_PIECE_LO[piece + 6][from];
    hi ^= ZOBRIST_PIECE_HI[piece + 6][from];

    // Обработка взятий
    if (flags === FLAG_EN_PASSANT) {
      const capSq = side === WHITE ? to + 8 : to - 8;
      const capPiece = board[capSq];
      board[capSq] = EMPTY;
      lo ^= ZOBRIST_PIECE_LO[capPiece + 6][capSq];
      hi ^= ZOBRIST_PIECE_HI[capPiece + 6][capSq];
    } else if (captured !== EMPTY) {
      lo ^= ZOBRIST_PIECE_LO[captured + 6][to];
      hi ^= ZOBRIST_PIECE_HI[captured + 6][to];
    }

    // Ставим фигуру (или фигуру превращения) на поле назначения
    const placedPiece = flags === FLAG_PROMOTION ? promotion : piece;
    board[to] = placedPiece;
    lo ^= ZOBRIST_PIECE_LO[placedPiece + 6][to];
    hi ^= ZOBRIST_PIECE_HI[placedPiece + 6][to];

    // Обновляем позицию короля и перемещаем ладью при рокировке
    if (piece === KING) {
      this.whiteKingSq = to;
      if (flags === FLAG_CASTLE_K) {
        board[63] = EMPTY;
        board[61] = ROOK;
        lo ^= ZOBRIST_PIECE_LO[ROOK + 6][63] ^ ZOBRIST_PIECE_LO[ROOK + 6][61];
        hi ^= ZOBRIST_PIECE_HI[ROOK + 6][63] ^ ZOBRIST_PIECE_HI[ROOK + 6][61];
      } else if (flags === FLAG_CASTLE_Q) {
        board[56] = EMPTY;
        board[59] = ROOK;
        lo ^= ZOBRIST_PIECE_LO[ROOK + 6][56] ^ ZOBRIST_PIECE_LO[ROOK + 6][59];
        hi ^= ZOBRIST_PIECE_HI[ROOK + 6][56] ^ ZOBRIST_PIECE_HI[ROOK + 6][59];
      }
    } else if (piece === -KING) {
      this.blackKingSq = to;
      if (flags === FLAG_CASTLE_K) {
        board[7] = EMPTY;
        board[5] = -ROOK;
        lo ^= ZOBRIST_PIECE_LO[-ROOK + 6][7] ^ ZOBRIST_PIECE_LO[-ROOK + 6][5];
        hi ^= ZOBRIST_PIECE_HI[-ROOK + 6][7] ^ ZOBRIST_PIECE_HI[-ROOK + 6][5];
      } else if (flags === FLAG_CASTLE_Q) {
        board[0] = EMPTY;
        board[3] = -ROOK;
        lo ^= ZOBRIST_PIECE_LO[-ROOK + 6][0] ^ ZOBRIST_PIECE_LO[-ROOK + 6][3];
        hi ^= ZOBRIST_PIECE_HI[-ROOK + 6][0] ^ ZOBRIST_PIECE_HI[-ROOK + 6][3];
      }
    }

    // Проверяем, не остался ли наш король под шахом
    const ownKingSq = side === WHITE ? this.whiteKingSq : this.blackKingSq;
    if (this.isSquareAttacked(ownKingSq, -side)) {
      // Быстрый откат нелегального хода
      board[from] = piece;
      if (flags === FLAG_EN_PASSANT) {
        board[to] = EMPTY;
        const capSq = side === WHITE ? to + 8 : to - 8;
        board[capSq] = -PAWN * side;
      } else {
        board[to] = captured;
      }
      if (piece === KING) {
        this.whiteKingSq = from;
        if (flags === FLAG_CASTLE_K) { board[61] = EMPTY; board[63] = ROOK; }
        else if (flags === FLAG_CASTLE_Q) { board[59] = EMPTY; board[56] = ROOK; }
      } else if (piece === -KING) {
        this.blackKingSq = from;
        if (flags === FLAG_CASTLE_K) { board[5] = EMPTY; board[7] = -ROOK; }
        else if (flags === FLAG_CASTLE_Q) { board[3] = EMPTY; board[0] = -ROOK; }
      }
      return false;
    }

    // Обновляем права на рокировку и взятие на проходе
    const newCastling = prevCastling & CASTLE_SPOIL[from] & CASTLE_SPOIL[to];
    const newEp = flags === FLAG_DOUBLE_PAWN ? (from + to) >> 1 : -1;
    this.castling = newCastling;
    this.epSquare = newEp;

    if (Math.abs(piece) === PAWN || captured !== EMPTY) {
      this.halfMoves = 0;
    } else {
      this.halfMoves = prevHalfMoves + 1;
    }
    if (side === BLACK) {
      this.fullMoves = prevFullMoves + 1;
    }

    const newEpIdx = newEp === -1 ? 64 : newEp;
    lo ^= ZOBRIST_EP_LO[newEpIdx] ^ ZOBRIST_CASTLE_LO[newCastling] ^ ZOBRIST_SIDE_LO;
    hi ^= ZOBRIST_EP_HI[newEpIdx] ^ ZOBRIST_CASTLE_HI[newCastling] ^ ZOBRIST_SIDE_HI;

    this.turn = -side;
    this.hashLo = lo >>> 0;
    this.hashHi = hi >>> 0;

    this.history.push({
      move,
      castling: prevCastling,
      epSquare: prevEp,
      halfMoves: prevHalfMoves,
      fullMoves: prevFullMoves,
      hashLo: prevHashLo,
      hashHi: prevHashHi
    });

    return true;
  }

  undoMove() {
    const state = this.history.pop();
    if (!state) return null;

    const { move, castling, epSquare, halfMoves, fullMoves, hashLo, hashHi } = state;
    const { from, to, piece, captured, flags } = move;
    const side = -this.turn;
    const board = this.board;

    this.turn = side;
    this.castling = castling;
    this.epSquare = epSquare;
    this.halfMoves = halfMoves;
    this.fullMoves = fullMoves;
    this.hashLo = hashLo;
    this.hashHi = hashHi;

    board[from] = piece;
    if (flags === FLAG_EN_PASSANT) {
      board[to] = EMPTY;
      const capSq = side === WHITE ? to + 8 : to - 8;
      board[capSq] = -PAWN * side;
    } else {
      board[to] = captured;
    }

    if (piece === KING) {
      this.whiteKingSq = from;
      if (flags === FLAG_CASTLE_K) { board[61] = EMPTY; board[63] = ROOK; }
      else if (flags === FLAG_CASTLE_Q) { board[59] = EMPTY; board[56] = ROOK; }
    } else if (piece === -KING) {
      this.blackKingSq = from;
      if (flags === FLAG_CASTLE_K) { board[5] = EMPTY; board[7] = -ROOK; }
      else if (flags === FLAG_CASTLE_Q) { board[3] = EMPTY; board[0] = -ROOK; }
    }

    return move;
  }

  generateLegalMoves(capturesOnly = false) {
    const pseudo = this.generatePseudoMoves(capturesOnly);
    const legal = [];
    for (let i = 0; i < pseudo.length; i++) {
      const m = pseudo[i];
      if (this.makeMove(m)) {
        this.undoMove();
        legal.push(m);
      }
    }
    return legal;
  }

  // Форматирование легального хода в SAN (например: Nf3, exd5, O-O, R1e4, e8=Q#, Qh7+)
  moveToSan(move, precomputedLegal = null) {
    if (move.flags === FLAG_CASTLE_K) {
      let san = 'O-O';
      if (this.makeMove(move)) {
        if (this.inCheck()) {
          san += this.generateLegalMoves().length === 0 ? '#' : '+';
        }
        this.undoMove();
      }
      return san;
    }
    if (move.flags === FLAG_CASTLE_Q) {
      let san = 'O-O-O';
      if (this.makeMove(move)) {
        if (this.inCheck()) {
          san += this.generateLegalMoves().length === 0 ? '#' : '+';
        }
        this.undoMove();
      }
      return san;
    }

    const legalMoves = precomputedLegal || this.generateLegalMoves();
    const absPiece = Math.abs(move.piece);
    let san = '';

    if (absPiece === PAWN) {
      if (move.captured !== EMPTY || move.flags === FLAG_EN_PASSANT) {
        san += FILES[move.from & 7] + 'x';
      }
      san += sqToAlgebraic(move.to);
      if (move.flags === FLAG_PROMOTION) {
        san += '=' + SAN_PIECE_LETTER[Math.abs(move.promotion)];
      }
    } else {
      san += SAN_PIECE_LETTER[absPiece];
      // Разрешение неоднозначности между одноимёнными фигурами
      const ambiguous = legalMoves.filter(
        (m) => m.from !== move.from && m.to === move.to && m.piece === move.piece
      );
      if (ambiguous.length > 0) {
        const fromFile = move.from & 7;
        const fromRank = move.from >> 3;
        const sameFile = ambiguous.some((m) => (m.from & 7) === fromFile);
        const sameRank = ambiguous.some((m) => (m.from >> 3) === fromRank);
        if (!sameFile) {
          san += FILES[fromFile];
        } else if (!sameRank) {
          san += RANKS[fromRank];
        } else {
          san += FILES[fromFile] + RANKS[fromRank];
        }
      }
      if (move.captured !== EMPTY) {
        san += 'x';
      }
      san += sqToAlgebraic(move.to);
    }

    if (this.makeMove(move)) {
      if (this.inCheck()) {
        san += this.generateLegalMoves().length === 0 ? '#' : '+';
      }
      this.undoMove();
    }

    return san;
  }

  // Выполнить ход по координатам { from, to, promotion? } или UCI-строке ('e2e4', 'e7e8q') или SAN ('Nf3')
  playMove(input) {
    const legal = this.generateLegalMoves();
    let chosen = null;

    if (typeof input === 'string') {
      const cleaned = input.trim();
      // Сначала пробуем UCI
      chosen = legal.find((m) => moveToUci(m) === cleaned.toLowerCase());
      if (!chosen) {
        // Пробуем SAN (с учётом или без учёта символов +/#)
        const norm = cleaned.replace(/[+#!?]+$/g, '');
        for (const m of legal) {
          const san = this.moveToSan(m, legal);
          if (san === cleaned || san.replace(/[+#]+$/g, '') === norm) {
            chosen = m;
            break;
          }
        }
      }
    } else if (input && typeof input === 'object') {
      const from = typeof input.from === 'string' ? algebraicToSq(input.from) : input.from;
      const to = typeof input.to === 'string' ? algebraicToSq(input.to) : input.to;
      const promoAbs = input.promotion ? Math.abs(input.promotion) : QUEEN;
      chosen = legal.find((m) => {
        if (m.from !== from || m.to !== to) return false;
        if (m.flags === FLAG_PROMOTION) {
          return Math.abs(m.promotion) === promoAbs;
        }
        return true;
      });
    }

    if (!chosen) return null;
    const san = this.moveToSan(chosen, legal);
    const fenBefore = this.toFen();
    this.makeMove(chosen);
    const lastEntry = this.history[this.history.length - 1];
    lastEntry.san = san;
    lastEntry.uci = moveToUci(chosen);
    lastEntry.fenBefore = fenBefore;
    lastEntry.fenAfter = this.toFen();
    return { ...chosen, san, uci: lastEntry.uci };
  }

  // Подсчёт числа повторений текущей позиции (включая текущую: >= 3 означает троекратное повторение)
  countRepetitions() {
    let count = 1;
    const lo = this.hashLo;
    const hi = this.hashHi;
    // Позиция не может повториться до последнего хода пешкой или взятия (halfMoves)
    const minIdx = Math.max(0, this.history.length - this.halfMoves);
    for (let i = this.history.length - 2; i >= minIdx; i -= 2) {
      const h = this.history[i];
      if (h.hashLo === lo && h.hashHi === hi) {
        count++;
      }
    }
    return count;
  }

  isInsufficientMaterial() {
    let whiteBishops = [];
    let blackBishops = [];
    let whiteKnights = 0;
    let blackKnights = 0;

    for (let sq = 0; sq < 64; sq++) {
      const p = this.board[sq];
      if (p === EMPTY || p === KING || p === -KING) continue;
      const abs = Math.abs(p);
      // Любая пешка, ладья или ферзь даёт достаточный для мата материал
      if (abs === PAWN || abs === ROOK || abs === QUEEN) return false;
      if (p === KNIGHT) whiteKnights++;
      else if (p === -KNIGHT) blackKnights++;
      else if (p === BISHOP) whiteBishops.push(((sq >> 3) + (sq & 7)) & 1);
      else if (p === -BISHOP) blackBishops.push(((sq >> 3) + (sq & 7)) & 1);
    }

    const wMinor = whiteKnights + whiteBishops.length;
    const bMinor = blackKnights + blackBishops.length;
    const totalMinor = wMinor + bMinor;

    // K vs K, K+N vs K, K+B vs K
    if (totalMinor <= 1) return true;

    // K+B vs K+B с однопольными слонами
    if (
      totalMinor === 2 &&
      whiteBishops.length === 1 &&
      blackBishops.length === 1 &&
      whiteBishops[0] === blackBishops[0]
    ) {
      return true;
    }

    return false;
  }

  getGameStatus() {
    const legalMoves = this.generateLegalMoves();
    const check = this.inCheck();

    if (legalMoves.length === 0) {
      if (check) {
        return {
          over: true,
          reason: 'checkmate',
          winner: -this.turn,
          inCheck: true,
          legalMoves
        };
      }
      return {
        over: true,
        reason: 'stalemate',
        winner: 0,
        inCheck: false,
        legalMoves
      };
    }

    if (this.halfMoves >= 100) {
      return {
        over: true,
        reason: 'fifty_moves',
        winner: 0,
        inCheck: check,
        legalMoves
      };
    }

    if (this.countRepetitions() >= 3) {
      return {
        over: true,
        reason: 'repetition',
        winner: 0,
        inCheck: check,
        legalMoves
      };
    }

    if (this.isInsufficientMaterial()) {
      return {
        over: true,
        reason: 'insufficient_material',
        winner: 0,
        inCheck: check,
        legalMoves
      };
    }

    return {
      over: false,
      reason: 'playing',
      winner: 0,
      inCheck: check,
      legalMoves
    };
  }

  toPgn(headers = {}) {
    const date = new Date().toISOString().slice(0, 10).replace(/-/g, '.');
    const status = this.getGameStatus();
    let result = '*';
    if (status.over) {
      if (status.winner === WHITE) result = '1-0';
      else if (status.winner === BLACK) result = '0-1';
      else result = '1/2-1/2';
    }

    const mergedHeaders = {
      Event: headers.Event || 'Grandmaster Chess Arena',
      Site: headers.Site || 'Local Web Studio',
      Date: headers.Date || date,
      White: headers.White || 'Белые',
      Black: headers.Black || 'Чёрные',
      Result: headers.Result || result
    };

    if (this.history.length > 0 && this.history[0].fenBefore && this.history[0].fenBefore !== START_FEN) {
      mergedHeaders.SetUp = '1';
      mergedHeaders.FEN = this.history[0].fenBefore;
    }

    let pgn = '';
    for (const [k, v] of Object.entries(mergedHeaders)) {
      pgn += `[${k} "${v}"]\n`;
    }
    pgn += '\n';

    const tokens = [];
    for (let i = 0; i < this.history.length; i++) {
      const h = this.history[i];
      const san = h.san || moveToUci(h.move);
      const isWhiteMove = h.move.piece > 0;
      if (isWhiteMove) {
        tokens.push(`${h.fullMoves}. ${san}`);
      } else if (i === 0) {
        tokens.push(`${h.fullMoves}... ${san}`);
      } else {
        tokens.push(san);
      }
    }
    tokens.push(mergedHeaders.Result);
    pgn += tokens.join(' ');
    return pgn.trim();
  }
}
