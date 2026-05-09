# Zada

Zada — это offline-first рабочее пространство для продуктивности: задач, проектов, заметок, привычек, фокус-сессий и планирования разработки игр. Этот репозиторий теперь структурирован как monorepo, чтобы web, API, desktop, mobile и shared packages могли развиваться вместе. 

## Структура workspace

```txt
apps/
  web/       React + Vite app, PWA shell, локальные данные в IndexedDB
  api/       Express + TypeScript API, Prisma schema, auth, sync, billing gates
  desktop/   Electron wrapper для web build и безопасный bridge для локальных файлов
  mobile/    Capacitor shell для Android-first mobile packaging
packages/
  shared/    Domain types, parsers, premium gates, sync helpers
  api-client Typed browser API client
  ui/        Небольшие общие UI primitives
```

## Локальная разработка

1. Установите зависимости:

```powershell
npm install
```

2. Скопируйте значения окружения по умолчанию и обновите секреты:

```powershell
Copy-Item .env.example .env
```

3. Запустите Postgres:

```powershell
docker compose up -d postgres
```

4. Сгенерируйте Prisma client и выполните миграции:

```powershell
npm run prisma:generate
npm run prisma:migrate
```

5. Запустите API и web app в отдельных терминалах:

```powershell
npm run dev:api
npm run dev:web
```

URL по умолчанию:

* Web: `http://localhost:5173`
* API: `http://localhost:3000/api`
* Health: `http://localhost:3000/health`

## Реализованный фундамент

* Общий парсер outline задач для нумерованных задач, bullet-списков, checkboxes, tags, priority, dates, repeat/reminder metadata, task types и parent-child relations.
* Общий парсер внутренних ссылок для `[[Task: ...]]`, `[[GDD: ...]]`, snippets, bugs, milestones, notes, concepts и files.
* Общий каталог premium features и offline entitlement rules.
* Общая модель статуса синхронизации заметок для состояний local-only, pending, synced и error.
* Skeleton API routes для auth, core projects/tasks, sync, import preview/confirm, billing status, unavailable checkout и manual admin subscription/entitlement grants.
* React app shell с desktop sidebar, mobile bottom navigation, quick add, task list, import preview, notes sync controls, game dev dashboard, subscription screen, focus, stats и settings.
* Безопасный Electron preload bridge для ссылок на локальные файлы.
* Capacitor mobile shell и PWA manifest/service worker.

## Границы MVP

Интеграция платёжного провайдера, team roles, public sharing, AI features, third-party calendar imports, S3 file storage, полноценный iOS release и встроенный Git client намеренно вынесены за рамки MVP.
