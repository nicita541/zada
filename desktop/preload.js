const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("taskbookDesktop", {
  platform: process.platform,
  isDesktop: true,
  getConfig: () => ipcRenderer.invoke("desktop:get-config"),
  getServerStatus: () => ipcRenderer.invoke("desktop:server-status"),
  notify: (payload) => ipcRenderer.invoke("desktop:notify", payload),
  setStartOnLogin: (enabled) => ipcRenderer.invoke("desktop:start-on-login", enabled),
  openExternal: (url) => ipcRenderer.invoke("desktop:open-external", url),
  onServerStatus: (callback) => {
    ipcRenderer.on("desktop:server-status", (_event, payload) => callback(payload));
  },
  onOpenTask: (callback) => {
    ipcRenderer.on("desktop:open-task", (_event, taskId) => callback(taskId));
  }
});
