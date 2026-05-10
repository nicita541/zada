# Zada

Zada is an offline-first workspace for personal productivity and game development planning. The project is a monorepo with shared domain code, a React web app, an Express API, Electron desktop packaging, and a Capacitor mobile shell.

## Workspace

```txt
apps/
  web/       React + Vite app, PWA shell, IndexedDB local data
  api/       Express + TypeScript API, Prisma schema, auth, sync, billing gates
  desktop/   Electron wrapper and secure local file bridge
  mobile/    Capacitor Android-first shell
packages/
  shared/    Types, parsers, board helpers, premium gates, notes sync, game-dev template
  api-client Browser API client
  ui/        Shared React UI primitives
```

## Windows Local Run

Run from PowerShell:

```powershell
cd "E:\Задачник\zada"
npm install
Copy-Item .env.example .env
Copy-Item .env apps/api/.env -Force
docker compose up -d postgres
npm run prisma:generate
npm run prisma:migrate
npm run dev:api
```

In a second terminal:

```powershell
cd "E:\Задачник\zada"
npm run dev:web
```

Open:

- Web: `http://localhost:5173`
- API: `http://localhost:3000/api`
- Health: `http://localhost:3000/health`

## Validation Commands

```powershell
npm run prisma:generate
npm run prisma:migrate
npm run typecheck
npm test
npm run build
```

Prisma migration folders under `apps/api/prisma/migrations/` are source-controlled and should be committed with schema changes.

## Environment

The API loads `.env` from its current workspace first and then falls back to the root `.env`. Prisma CLI is most reliable when the root env is copied into `apps/api/.env`:

```powershell
Copy-Item .env apps/api/.env -Force
```

## Troubleshooting

### Prisma DATABASE_URL not found

Copy the root env file into the API workspace:

```powershell
Copy-Item .env apps/api/.env -Force
```

Then rerun:

```powershell
npm run prisma:generate
npm run prisma:migrate
```

### Vite failed to resolve @zada/shared, @zada/ui, or @zada/api-client

The workspace packages expose TypeScript source entrypoints and Vite has explicit aliases to:

- `packages/shared/src/index.ts`
- `packages/api-client/src/index.ts`
- `packages/ui/src/index.ts`

Run `npm install` again after package changes so workspace links are refreshed.

## Implemented MVP Foundation

- Shared task outline parser for numbered tasks, bullets, checkboxes, descriptions in parentheses, tags, priorities, dates, repeats, reminders, task types, and parent-child relations.
- Shared quick-add parser with tags, priorities, project refs, task types, explicit dates, repeat phrases/tokens, and Russian natural dates: `сегодня`, `завтра`, `послезавтра`.
- Shared recurrence helper for daily, weekly, monthly, yearly, and weekday repeats.
- Shared board helper for default project columns, column fallback, and task move position recalculation.
- Shared internal link parser for `[[Task: ...]]`, `[[GDD: ...]]`, `[[Snippet: ...]]`, notes, concepts, files, bugs, and milestones.
- Premium gates for online and offline entitlement checks, including `currentPeriodEnd`, `lifetime_dev`, and `admin`.
- Notes sync helpers for `local_only`, `pending`, `synced`, and `error`.
- API routes for auth/session restore/logout/dev password reset, import preview/confirm, billing status/features/checkout, admin grants/revokes, sync bootstrap/push/changes, core project/task/tag CRUD endpoints, project board columns, column/task reorder, subtasks, reminders, due reminders, and task-tag assignment.
- Prisma schema for users, sessions, workspaces, projects, board columns, tasks, tags, subtasks, reminders, habits, notes, references, code snippets, milestones, focus sessions, subscriptions, entitlements, devices, settings, and change log.
- React app shell with auth gate, login/register/recovery UI, desktop sidebar, mobile bottom navigation, quick add, grouped Today task list, search/filter controls, due reminder banner, project create/edit/delete/select, project List/Board tabs with drag-and-drop Kanban columns/tasks, task detail editing with description/subtasks/reminders/repeat/tags/additional sections, import preview, notes sync controls, subscription screen, premium-gated game-dev workspace, focus, stats, and settings.
- IndexedDB stores for projects, board columns, tasks, tags, task-tag links, subtasks, reminders, notes, references, code snippets, milestones, focus sessions, sync queue, sync metadata, subscription cache, and note sync settings. Project/board column/task/subtask/reminder/tag mutations write locally first and enqueue sync work; deleting a board column detaches its tasks instead of losing them and queues those task moves.
- Electron preload bridge for `window.zadaDesktop.openLocalPath(path)` and `window.zadaDesktop.revealInExplorer(path)` with `contextIsolation` enabled and `nodeIntegration` disabled.
- Capacitor config wired to the shared web build.

## Язык интерфейса

- По умолчанию интерфейс открывается на русском языке.
- Поддерживаются `ru` и `en`.
- Язык можно переключить в `Настройки -> Интерфейс -> Язык интерфейса`.
- Выбор применяется сразу, без перезагрузки страницы.
- Выбранный язык хранится локально в `localStorage` под ключом `zada.locale`.
- Если сохранён неизвестный язык, приложение использует fallback на `ru`.
- Новые языки можно добавить через словари в `apps/web/src/i18n/`.

## MVP Status

Текущий проект остаётся foundation/MVP-in-progress. Подробный аудит находится в `docs/MVP_GAP_REPORT.md`. Многие области уже имеют рабочие части, но значительная часть модулей всё ещё в состоянии `Partial` или `Skeleton`.

## Not Implemented Yet

- Real payment provider integration.
- Full production sync conflict handling and pull-side merge UI.
- Full Android/iOS native builds and store release setup.
- Public sharing, teams, AI, Google Calendar, S3 storage, built-in Git client.
- Deep production UX for every CRUD entity. The current goal is a runnable MVP foundation, not the final product.
