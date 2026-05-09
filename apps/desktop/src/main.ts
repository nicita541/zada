import { app, BrowserWindow, ipcMain, nativeImage, shell, Tray, Menu } from "electron";
import isDev from "electron-is-dev";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
let mainWindow: BrowserWindow | null = null;
let tray: Tray | null = null;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1320,
    height: 860,
    minWidth: 940,
    minHeight: 680,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  });

  mainWindow.once("ready-to-show", () => mainWindow?.show());

  if (isDev) {
    mainWindow.loadURL("http://localhost:5173");
  } else {
    mainWindow.loadFile(path.join(__dirname, "../../web/dist/index.html"));
  }
}

function createTray() {
  const icon = nativeImage.createEmpty();
  tray = new Tray(icon);
  tray.setToolTip("Zada");
  tray.setContextMenu(
    Menu.buildFromTemplate([
      { label: "Open Zada", click: () => mainWindow?.show() },
      { type: "separator" },
      { label: "Quit", click: () => app.quit() }
    ])
  );
}

app.whenReady().then(() => {
  createWindow();
  createTray();
});

app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});

ipcMain.handle("zada:open-local-path", async (_event, targetPath: string) => {
  assertLocalPath(targetPath);
  return shell.openPath(targetPath);
});

ipcMain.handle("zada:reveal-in-explorer", async (_event, targetPath: string) => {
  assertLocalPath(targetPath);
  shell.showItemInFolder(targetPath);
  return true;
});

function assertLocalPath(targetPath: string) {
  if (typeof targetPath !== "string" || targetPath.trim().length === 0) {
    throw new Error("Local path is required");
  }
}
