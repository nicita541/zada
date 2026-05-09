# Zada Desktop

The desktop app wraps the shared web build with Electron and exposes local file references only through the preload bridge:

- `window.zadaDesktop.openLocalPath(path)`
- `window.zadaDesktop.revealInExplorer(path)`

The browser build never receives direct Node.js or filesystem access.

Development:

```powershell
npm run dev:web
npm run dev --workspace @zada/desktop
```

Installer:

```powershell
npm run build --workspace @zada/web
npm run dist --workspace @zada/desktop
```
