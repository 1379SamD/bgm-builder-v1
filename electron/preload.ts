import { contextBridge } from "electron";

contextBridge.exposeInMainWorld("api", {
  test: () => "Electron API connected",
});