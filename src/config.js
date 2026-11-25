// Конфигурация бэкенда WebSocket на Fly.io (организация: gary-gudiny)
// Фронтенд размещён на GitHub Pages: https://ahamoth.github.io/chess/
// Если при деплое на Fly.io вы выбрали другое имя приложения, замените только FLY_APP_HOST ниже.

export const FLY_APP_HOST = 'gary-gudiny-chess-ws.fly.dev';

export function getBackendUrls() {
  // Возможность временно переопределить сервер через параметр URL ?server=my-app.fly.dev
  try {
    const custom = new URLSearchParams(window.location.search).get('server');
    if (custom) {
      const cleaned = custom.replace(/^https?:\/\//i, '').replace(/^wss?:\/\//i, '').replace(/\/+$/, '');
      const isLocalCustom = /^(localhost|127\.0\.0\.1)(:\d+)?$/i.test(cleaned);
      const httpProto = isLocalCustom ? 'http:' : 'https:';
      const wsProto = isLocalCustom ? 'ws:' : 'wss:';
      return {
        wsUrl: `${wsProto}//${cleaned}/ws`,
        apiBase: `${httpProto}//${cleaned}`,
        isCloud: !isLocalCustom
      };
    }
  } catch {
    // ignore
  }

  const isLocalHost =
    window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';

  // Если локально открыт с node server.mjs (порт 4173/8080) — используем локальный WS;
  // если открыт на github.io или другом внешнем домене — подключаемся к Fly.io
  if (isLocalHost && window.location.port) {
    const protoWs = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    return {
      wsUrl: `${protoWs}//${window.location.host}/ws`,
      apiBase: window.location.origin,
      isCloud: false
    };
  }

  return {
    wsUrl: `wss://${FLY_APP_HOST}/ws`,
    apiBase: `https://${FLY_APP_HOST}`,
    isCloud: true
  };
}
