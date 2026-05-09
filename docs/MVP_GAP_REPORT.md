## MVP Gap Report

This report compares the current repository with the target Zada MVP. The current codebase is a runnable foundation/app shell, not a complete production MVP.

| Module | Status | Evidence | What is missing | Priority |
|---|---|---|---|---|
| Auth | Partial | `apps/api/src/routes/auth.ts`, `apps/api/src/services/authService.ts`, `apps/web/src/App.tsx` | Register/login/refresh/me exist, but reset password is not implemented, logout UI only clears local tokens, and frontend auth flow is minimal. | High |
| User profile | Skeleton | `apps/api/src/routes/auth.ts` (`/me`), `apps/api/prisma/schema.prisma` (`User`) | No profile edit screen, avatar/preferences UI, or full account settings workflow. | Medium |
| Projects | Partial | `apps/api/src/routes/projects.ts`, `apps/web/src/App.tsx` | API has basic CRUD, UI shows project cards but does not manage real project records end to end. | High |
| Tasks | Partial | `apps/api/src/routes/projects.ts`, `apps/web/src/store/appStore.ts` | Local quick add/toggle works and API has basic CRUD, but task detail, subtasks, reminders, recurrence UI, and server sync application are incomplete. | High |
| Board / Kanban | Skeleton | `apps/web/src/App.tsx`, `apps/api/src/routes/projects.ts` | Board columns exist in API and preview UI, but there is no drag-and-drop persistence or real board workflow. | High |
| Calendar | Skeleton | `apps/web/src/App.tsx` | Calendar is a visual placeholder with agenda data from local tasks only; no month/week switching or real scheduling logic. | Medium |
| Habits | Skeleton | `apps/web/src/App.tsx`, `apps/api/prisma/schema.prisma` | Static habit cards only; no habit CRUD or logging UI/API route. | Medium |
| Notes | Partial | `apps/web/src/App.tsx`, `apps/web/src/store/appStore.ts`, `apps/api/src/routes/projects.ts` | Notes can be created locally and API has CRUD, but editor is basic and backend sync is not fully applied. | High |
| Notes offline/local-only/sync settings | Partial | `apps/web/src/lib/db.ts`, `apps/web/src/lib/syncEngine.ts`, `packages/shared/src/notes.ts` | Toggle affects local sync queue behavior, but enable prompt/upload workflow and full conflict handling are missing. | High |
| Focus timer | Skeleton | `apps/web/src/App.tsx`, `apps/api/prisma/schema.prisma` | UI timer is static; no running timer state or persisted focus sessions. | Medium |
| Statistics | Skeleton | `apps/web/src/App.tsx` | Chart renders sample/local counts only; no real analytics queries or premium advanced stats. | Medium |
| Import system | Partial | `packages/shared/src/taskOutlineParser.ts`, `apps/web/src/App.tsx`, `apps/api/src/routes/import.ts` | Preview and local confirm exist; API confirm creates tasks, but file upload, full validation UX, and conflict handling are incomplete. | High |
| Zada Task Outline parser | Partial | `packages/shared/src/taskOutlineParser.ts`, `packages/shared/src/__tests__/taskOutlineParser.test.ts` | Parses core outline syntax, but needs broader edge-case coverage and UI/API parity validation. | High |
| Game Dev Workspace | Skeleton | `packages/shared/src/gameDevTemplate.ts`, `apps/api/src/services/importService.ts`, `apps/web/src/App.tsx` | Template and gated UI exist, but the workspace is not a full project area with persistent GDD/concept workflows. | High |
| GDD / Game Concept | Skeleton | `packages/shared/src/gameDevTemplate.ts`, `apps/api/src/services/importService.ts` | Default note contents can be created by API, but there is no dedicated editor/viewer or section navigation. | High |
| Internal links | Partial | `packages/shared/src/internalLinks.ts`, `apps/web/src/App.tsx` | Parser and display exist, but autocomplete and click-to-open object navigation are missing. | Medium |
| References | Partial | `apps/api/src/routes/projects.ts`, `apps/api/prisma/schema.prisma` | API CRUD exists, but no complete references UI and no desktop-specific local reference workflow in web UI. | Medium |
| Code snippets | Partial | `apps/api/src/routes/projects.ts`, `apps/web/src/App.tsx`, `apps/api/prisma/schema.prisma` | Syntax-highlighted preview exists and API CRUD exists, but no snippets library UI with search/filter/copy persistence. | Medium |
| Bug tracker | Skeleton | `apps/api/prisma/schema.prisma`, `apps/api/src/routes/projects.ts` | Task bug fields exist, but no dedicated bug tracker workflow or advanced bug UI. | Medium |
| Milestones | Partial | `apps/api/src/routes/projects.ts`, `apps/web/src/App.tsx`, `apps/api/prisma/schema.prisma` | API CRUD and dashboard preview exist, but milestone progress is not linked to real task completion. | Medium |
| Premium/subscription gates | Partial | `packages/shared/src/premium.ts`, `apps/api/src/routes/billing.ts`, `apps/web/src/App.tsx` | Feature gates exist in shared/UI and checkout is unavailable by design, but frontend does not refresh billing status automatically in all flows. | High |
| Offline premium cache | Partial | `apps/web/src/lib/db.ts`, `packages/shared/src/premium.ts`, `apps/web/src/store/appStore.ts` | Subscription cache store and offline rules exist, but online verification/refresh lifecycle is incomplete. | High |
| Sync engine | Skeleton | `apps/web/src/lib/syncEngine.ts`, `apps/api/src/routes/sync.ts` | Sync queue can push change log entries, but server changes are not applied back to entities and conflict handling is minimal. | High |
| IndexedDB stores | Partial | `apps/web/src/lib/db.ts` | Stores cover MVP entities, but many stores are not yet used by UI flows. | High |
| API routes | Partial | `apps/api/src/routes/*` | Auth/import/billing/sync/core CRUD exist, but some modules lack full business logic, pagination, guards, and route tests. | High |
| Prisma schema | Partial | `apps/api/prisma/schema.prisma` | MVP models and important fields exist, but migrations need verification after schema changes and indexes may need tuning. | High |
| Desktop Electron bridge | Partial | `apps/desktop/src/main.ts`, `apps/desktop/src/preload.ts` | Secure bridge exists with context isolation, but installer/tray/notifications/local reference UX are not fully validated. | Medium |
| Mobile Capacitor shell | Skeleton | `apps/mobile/capacitor.config.ts`, `apps/mobile/README.md` | Capacitor config exists, but Android project/build is not generated and native notifications are not wired through UI. | Medium |
| PWA | Partial | `apps/web/public/manifest.webmanifest`, `apps/web/public/sw.js`, `apps/web/src/main.tsx` | Manifest and service worker exist, but app shell caching strategy and offline install behavior need browser validation. | Medium |
| Language/i18n | Partial | `apps/web/src/i18n/*`, `apps/web/src/App.tsx` | Russian default and English switching are implemented for visible current UI; future screens must continue using i18n keys. | High |
| README/run instructions | Partial | `README.md` | Windows run instructions exist; they should be updated whenever npm/Prisma/dev-server behavior changes. | Medium |
| Tests | Partial | `packages/shared/src/__tests__/*`, `apps/web/src/i18n/i18n.test.ts` | Parser/premium/i18n tests exist, but API, sync, UI, and E2E coverage are still missing. | High |

## UI Behavior Notes

- Login and register forms call the API through `@zada/api-client`.
- Logout currently clears local frontend tokens only; it does not call `/api/auth/logout`.
- Notes sync toggle changes the local note sync setting and prevents `local_only` notes from entering sync push.
- Premium gates use cached subscription state and shared offline entitlement rules, but billing refresh is not automatic.
- Upgrade shows the purchase-unavailable message and does not connect to a payment provider.
- Search is currently only an input; it does not filter or query data yet.
- Sidebar pages are distinct screens, but several are still Skeleton screens with static/demo data.
