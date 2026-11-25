// Web Worker для фонового расчёта ходов и подсказок ИИ без блокировки UI

import { ChessEngine, START_FEN } from './engine.js';
import { ChessAI, evaluateWhitePerspective, detectOpeningName } from './ai.js';

const ai = new ChessAI();

self.onmessage = (event) => {
  const { type, requestId, startFen, uciMoves, currentFen, level, kind } = event.data || {};

  if (type === 'CLEAR') {
    ai.clearTables();
    return;
  }

  if (type === 'EVAL') {
    try {
      const engine = new ChessEngine(currentFen || START_FEN);
      const scoreWhite = evaluateWhitePerspective(engine);
      const opening = detectOpeningName(uciMoves || []);
      self.postMessage({
        type: 'EVAL_RESULT',
        requestId,
        scoreWhite,
        opening
      });
    } catch (err) {
      self.postMessage({
        type: 'ERROR',
        requestId,
        message: err?.message || 'Ошибка оценки позиции'
      });
    }
    return;
  }

  if (type === 'SEARCH') {
    try {
      const engine = new ChessEngine(startFen || START_FEN);
      if (Array.isArray(uciMoves) && uciMoves.length > 0) {
        let ok = true;
        for (const uci of uciMoves) {
          if (!engine.playMove(uci)) {
            ok = false;
            break;
          }
        }
        if (!ok && currentFen) {
          engine.loadFen(currentFen);
        }
      } else if (currentFen) {
        engine.loadFen(currentFen);
      }

      const result = ai.findBestMove(engine, level || 4, (progress) => {
        self.postMessage({
          type: 'PROGRESS',
          requestId,
          kind,
          ...progress
        });
      });

      self.postMessage({
        type: 'BEST_MOVE',
        requestId,
        kind, // 'ai' или 'hint'
        result
      });
    } catch (err) {
      self.postMessage({
        type: 'ERROR',
        requestId,
        message: err?.message || 'Ошибка поиска хода ИИ'
      });
    }
  }
};
