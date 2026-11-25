# Grandmaster Chess Studio — Frontend (GitHub Pages)

Статический фронтенд шахматного веб-приложения для публикации на **https://ahamoth.github.io/chess/**.

- Игра против ИИ (Web Worker), локальный режим, анализ, звуки, FEN/PGN работают полностью автономно в браузере.
- Онлайн-игра для 2 игроков через интернет подключается к WebSocket-серверу на Fly.io (адрес настраивается в `src/config.js`).

## Настройка перед публикацией

Откройте `src/config.js` и проверьте домен вашего сервера Fly.io:
```js
export const FLY_APP_HOST = 'gary-gudiny-chess-ws.fly.dev';
```
*(Если при деплое на Fly.io вы выбрали другое имя приложения, замените строку выше на ваше `<app-name>.fly.dev`.)*

## Деплой на GitHub Pages (`ahamoth/chess`)

1. Скопируйте **содержимое** папки `chess-github-pages` в корень репозитория `https://github.com/ahamoth/chess` (файлы `index.html`, `.nojekyll`, `README.md` и папка `src/` должны лежать в корне ветки `main`).
2. Запушьте изменения:
   ```bash
   git add .
   git commit -m "Deploy Grandmaster Chess Studio"
   git push origin main
   ```
3. В настройках репозитория на GitHub откройте **Settings -> Pages**:
   - **Source:** `Deploy from a branch`
   - **Branch:** `main` / `/ (root)`
   - Нажмите **Save**.
4. Через 1–2 минуты приложение откроется по адресу **https://ahamoth.github.io/chess/**.
