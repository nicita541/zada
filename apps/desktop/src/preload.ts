import { contextBridge, ipcRenderer } from "electron";

contextBridge.exposeInMainWorld("zadaDesktop", {
  openLocalPath(path: string) {
    return ipcRenderer.invoke("zada:open-local-path", path);
  },
  revealInExplorer(path: string) {
    return ipcRenderer.invoke("zada:reveal-in-explorer", path);
  }
});
