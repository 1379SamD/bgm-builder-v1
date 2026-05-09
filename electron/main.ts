import { app, BrowserWindow } from "electron";
import { fileURLToPath } from "url";

const preloadPath = fileURLToPath(new URL("./preload.cjs", import.meta.url));

const createWindow = () => {
  const win = new BrowserWindow({
    width: 1400,
    height: 900,
    webPreferences: {
      preload: preloadPath,
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  win.loadURL("http://localhost:5173");
};

app.whenReady().then(createWindow);
