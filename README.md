# Задачник

Desktop/PWA задачник с локальной офлайн-БД, backend API, Postgres и серверным worker для напоминаний.

## Локальный запуск backend

1. Установите Docker Desktop.
2. Запустите `start-local.bat`.
3. Backend будет доступен на `http://localhost:3000`.

Сервисы:

- API: `http://localhost:3000/health`
- Postgres: `localhost:5432`

Опциональный web preview:

```powershell
docker compose --profile web up --build
```

Тогда web preview будет на `http://localhost:8080`.

## ПК-приложение

Desktop app находится в `desktop/`.

Разработка:

```powershell
cd E:\Задачник\desktop
npm install
npm start
```

Сборка установщика:

```powershell
cd E:\Задачник\desktop
npm install
npm run dist
```

Готовый установщик появится в `desktop\release`. Приложение устанавливается отдельно от Docker и подключается к `http://localhost:3000/api`.

## Напоминания

В desktop app напоминания показываются как нативные уведомления Windows: приложение опрашивает backend и подтверждает показ уведомления. Web/mobile push требует HTTPS и настоящие VAPID-ключи.

Сгенерировать ключи:

```powershell
docker compose run --rm api npm run vapid
```

Потом вставьте `publicKey` и `privateKey` в `backend/.env.docker` локально или в production env на сервере.

## Перенос на сервер

1. Скопируйте проект на сервер.
2. Настройте домен и HTTPS через nginx/Caddy/Traefik.
3. Скопируйте `deploy/server.env.example` в production env и замените пароли, домен, VAPID-ключи.
4. Поднимите контейнеры:

```bash
docker compose up -d --build
```

Для полноценного push на телефонах приложение должно открываться по HTTPS-домену. После этого установите его на телефон/ПК из браузера, включите уведомления в настройках приложения, и backend worker будет отправлять напоминания.

## Что хранится в Postgres

- полный snapshot приложения;
- нормализованные задачи, списки, теги, привычки, countdown;
- история действий;
- push-подписки;
- события напоминаний и лог отправки.

## Офлайн-режим

Если backend недоступен, приложение продолжает работать через IndexedDB. Когда API снова доступен, состояние синхронизируется в Postgres.
