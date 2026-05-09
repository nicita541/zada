const path = require("path");
const { app, BrowserWindow, Menu, Tray, Notification, ipcMain, shell, nativeImage } = require("electron");

const API_BASE = process.env.TASKBOOK_API_BASE || "http://localhost:3000/api";
const USER_ID = process.env.TASKBOOK_USER_ID || "local-user";
const REMINDER_INTERVAL_MS = Number(process.env.TASKBOOK_REMINDER_INTERVAL_MS || 30000);

let mainWindow;
let tray;
let reminderTimer;
let healthTimer;
let serverStatus = { online: false, checkedAt: "", message: "not checked" };
const shownReminders = new Set();

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
}

app.setAppUserModelId("local.taskbook.desktop");

app.on("second-instance", () => {
  showMainWindow();
});

app.whenReady().then(() => {
  createWindow();
  createTray();
  createMenu();
  startHealthPolling();
  startReminderPolling();
});

app.on("window-all-closed", () => {
  // The close handler hides the window, so this usually does not fire during normal use.
});

app.on("before-quit", () => {
  clearInterval(reminderTimer);
  clearInterval(healthTimer);
});

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 980,
    minHeight: 640,
    show: false,
    title: "Задачник",
    backgroundColor: "#ffffff",
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  });

  const indexPath = path.join(__dirname, "app", "index.html");
  mainWindow.loadFile(indexPath, { query: { desktop: "1" } });
  mainWindow.once("ready-to-show", () => mainWindow.show());

  mainWindow.on("close", (event) => {
    if (!app.isQuitting) {
      event.preventDefault();
      mainWindow.hide();
    }
  });
}

function createTray() {
  const iconPath = path.join(__dirname, "app", "icons", "icon-192.svg");
  const image = nativeImage.createFromPath(iconPath);
  tray = new Tray(image.resize({ width: 16, height: 16 }));
  tray.setToolTip("Задачник");
  tray.setContextMenu(
    Menu.buildFromTemplate([
      { label: "Открыть", click: showMainWindow },
      { label: "Проверить сервер", click: checkServerHealth },
      { type: "separator" },
      { label: "Выход", click: quitApp }
    ])
  );
  tray.on("click", showMainWindow);
}

function createMenu() {
  Menu.setApplicationMenu(
    Menu.buildFromTemplate([
      {
        label: "Задачник",
        submenu: [
          { label: "Открыть", click: showMainWindow },
          { label: "Проверить сервер", click: checkServerHealth },
          { type: "separator" },
          { label: "Выход", click: quitApp }
        ]
      },
      {
        label: "Вид",
        submenu: [
          { role: "reload", label: "Перезагрузить" },
          { role: "toggleDevTools", label: "Инструменты разработчика" },
          { type: "separator" },
          { role: "resetZoom", label: "Сбросить масштаб" },
          { role: "zoomIn", label: "Увеличить" },
          { role: "zoomOut", label: "Уменьшить" }
        ]
      }
    ])
  );
}

function showMainWindow() {
  if (!mainWindow) return;
  if (mainWindow.isMinimized()) mainWindow.restore();
  mainWindow.show();
  mainWindow.focus();
}

function quitApp() {
  app.isQuitting = true;
  app.quit();
}

function startHealthPolling() {
  checkServerHealth();
  healthTimer = setInterval(checkServerHealth, 15000);
}

async function checkServerHealth() {
  try {
    const response = await fetch(`${API_BASE.replace(/\/api$/, "")}/health`);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    serverStatus = { online: true, checkedAt: new Date().toISOString(), message: "online" };
  } catch (error) {
    serverStatus = { online: false, checkedAt: new Date().toISOString(), message: error.message };
  }
  mainWindow?.webContents.send("desktop:server-status", serverStatus);
  tray?.setToolTip(`Задачник · сервер ${serverStatus.online ? "online" : "offline"}`);
  return serverStatus;
}

function startReminderPolling() {
  pollReminders();
  reminderTimer = setInterval(pollReminders, REMINDER_INTERVAL_MS);
}

async function pollReminders() {
  try {
    const response = await fetch(`${API_BASE}/reminders`, {
      headers: { "x-user-id": USER_ID }
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const data = await response.json();
    const now = Date.now();
    for (const reminder of data.reminders || []) {
      if (reminder.sent_at) continue;
      const dueAt = new Date(reminder.due_at).getTime();
      if (Number.isNaN(dueAt)) continue;
      if (dueAt > now || now - dueAt > 6 * 60 * 60 * 1000) continue;
      if (shownReminders.has(reminder.id)) continue;
      shownReminders.add(reminder.id);
      showReminder(reminder);
      ackReminder(reminder.id).catch(() => {});
    }
  } catch {
    // Server can be offline; the app still works with local IndexedDB.
  }
}

function showReminder(reminder) {
  const title = "Задачник";
  const body = reminder.payload?.title || "Напоминание";
  const notification = new Notification({
    title,
    body,
    silent: false
  });
  notification.on("click", () => {
    showMainWindow();
    if (reminder.task_id) {
      mainWindow.webContents.send("desktop:open-task", reminder.task_id);
    }
  });
  notification.show();
}

async function ackReminder(id) {
  await fetch(`${API_BASE}/reminders/${encodeURIComponent(id)}/ack`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-user-id": USER_ID
    },
    body: JSON.stringify({ message: "Desktop notification shown" })
  });
}

ipcMain.handle("desktop:get-config", () => ({
  apiBase: API_BASE,
  userId: USER_ID,
  startOnLogin: app.getLoginItemSettings().openAtLogin
}));

ipcMain.handle("desktop:server-status", checkServerHealth);

ipcMain.handle("desktop:notify", (_event, payload = {}) => {
  const notification = new Notification({
    title: payload.title || "Задачник",
    body: payload.body || "Напоминание",
    silent: Boolean(payload.silent)
  });
  notification.show();
  return { ok: true };
});

ipcMain.handle("desktop:start-on-login", (_event, enabled) => {
  app.setLoginItemSettings({ openAtLogin: Boolean(enabled) });
  return app.getLoginItemSettings();
});

ipcMain.handle("desktop:open-external", (_event, url) => {
  if (typeof url === "string" && /^https?:\/\//.test(url)) shell.openExternal(url);
});
