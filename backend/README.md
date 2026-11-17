# Бэкенд WebLarek.

## Используемые технологии и решения

- TypeScript в качестве основного языка проекта
- MongoDB и ODM Mongoose для хранения товаров и пользователей
- Node.js в качестве среды выполнения

Список принятых решений и расхождений между заданием, чек-листом и внешними
проверками находится в [REVIEW_NOTES.md](../REVIEW_NOTES.md).

## Локальный запуск

Скопируйте `.env.example` в `.env`, укажите адрес MongoDB в `DB_ADDRESS`
и задайте два разных случайных секрета: `AUTH_ACCESS_TOKEN_SECRET`
и `AUTH_REFRESH_TOKEN_SECRET`. Получить один секрет можно командой
`node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"`.
Повторите её для второго секрета. Файл `.env` не добавляется в Git.

После `npm ci` запустите сервер командой `npm run start` или `npm run dev`.
Срок access-токена по умолчанию — 10 минут, refresh-токена — 7 дней.
Настройки берутся из `AUTH_ACCESS_TOKEN_EXPIRY` и `AUTH_REFRESH_TOKEN_EXPIRY`.
Для фронтенда с cookie используется адрес из `ORIGIN_ALLOW`.

`npm test` собирает backend и проверяет API на отдельной временной базе MongoDB
и во временных папках. MongoDB должна быть запущена. Подробные решения по
авторизации, изображениям и расхождениям с внешними тестами описаны в
[REVIEW_NOTES.md](../REVIEW_NOTES.md).
