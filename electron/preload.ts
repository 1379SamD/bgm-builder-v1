import { contextBridge, ipcRenderer } from "electron";

export type ScannedFile = {
  id: string;
  name: string;
  path: string;
  url: string;
};

contextBridge.exposeInMainWorld("api", {
  test: () => "Electron API connected",
  selectFolder: (): Promise<string | null> =>
    ipcRenderer.invoke("select-folder"),
  scanFolder: (folderPath: string): Promise<ScannedFile[]> =>
    ipcRenderer.invoke("scan-folder", folderPath),
  getWavDuration: (filePath: string): Promise<number | null> =>
    ipcRenderer.invoke("get-wav-duration", filePath),
  fileExists: (folder: string, name: string): Promise<boolean> =>
    ipcRenderer.invoke("file-exists", folder, name),
  saveFile: (
    folder: string,
    name: string,
    data: Uint8Array,
  ): Promise<{ success: boolean; path?: string; error?: string }> =>
    ipcRenderer.invoke("save-file", folder, name, data),
});
