import { app, BrowserWindow, dialog, ipcMain, protocol } from "electron";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import ffmpegPathImport from "ffmpeg-static";

const ffmpegPath = (ffmpegPathImport as unknown as string) || "";

const MIME_TYPES: Record<string, string> = {
  ".mp3": "audio/mpeg",
  ".wav": "audio/wav",
  ".m4a": "audio/mp4",
  ".ogg": "audio/ogg",
  ".oga": "audio/ogg",
  ".flac": "audio/flac",
  ".aac": "audio/aac",
};

const preloadPath = fileURLToPath(new URL("./preload.cjs", import.meta.url));

const AUDIO_EXTENSIONS = new Set([".mp3", ".wav"]);

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

protocol.registerSchemesAsPrivileged([
  {
    scheme: "media",
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
      stream: true,
      bypassCSP: true,
      corsEnabled: true,
    },
  },
]);

const isDev = !app.isPackaged;

const createWindow = () => {
  const win = new BrowserWindow({
    title: "BGM Builder v1",
    width: 1366,
    height: 768,
    minWidth: 1366,
    minHeight: 768,
    webPreferences: {
      preload: preloadPath,
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  if (isDev) {
    win.loadURL("http://localhost:5173");
  } else {
    win.loadFile(path.join(app.getAppPath(), "dist", "index.html"));
  }
};

const MEDIA_HOST = "app";

const toMediaUrl = (fullPath: string) => {
  const segments = fullPath.split(/[\\/]/);
  const encoded = segments.map((s) => encodeURIComponent(s)).join("/");
  const pathPart = encoded.startsWith("/") ? encoded : "/" + encoded;
  return `media://${MEDIA_HOST}${pathPart}`;
};

const parseMediaUrl = (url: string): string | null => {
  try {
    const parsed = new URL(url);
    let raw = decodeURIComponent(parsed.pathname);
    if (process.platform === "win32" && raw.startsWith("/")) {
      raw = raw.slice(1);
    }
    return raw;
  } catch {
    return null;
  }
};

ipcMain.handle("select-folder", async () => {
  const result = await dialog.showOpenDialog({
    properties: ["openDirectory"],
    title: "BGM素材フォルダを選択",
  });

  if (result.canceled || result.filePaths.length === 0) {
    return null;
  }

  return result.filePaths[0];
});

const parseWavDuration = async (filePath: string): Promise<number | null> => {
  let handle: Awaited<ReturnType<typeof fs.open>> | undefined;
  try {
    handle = await fs.open(filePath, "r");

    const header = Buffer.alloc(12);
    await handle.read(header, 0, 12, 0);
    if (header.toString("ascii", 0, 4) !== "RIFF") return null;
    if (header.toString("ascii", 8, 12) !== "WAVE") return null;

    let offset = 12;
    let sampleRate = 0;
    let numChannels = 0;
    let bitsPerSample = 0;
    let byteRate = 0;
    let dataSize = 0;

    const chunkHeader = Buffer.alloc(8);
    for (let safety = 0; safety < 1024; safety++) {
      const { bytesRead } = await handle.read(chunkHeader, 0, 8, offset);
      if (bytesRead < 8) break;

      const chunkId = chunkHeader.toString("ascii", 0, 4);
      const chunkSize = chunkHeader.readUInt32LE(4);

      if (chunkId === "fmt ") {
        const fmt = Buffer.alloc(Math.min(chunkSize, 40));
        await handle.read(fmt, 0, fmt.length, offset + 8);
        numChannels = fmt.readUInt16LE(2);
        sampleRate = fmt.readUInt32LE(4);
        byteRate = fmt.readUInt32LE(8);
        bitsPerSample = fmt.readUInt16LE(14);
      } else if (chunkId === "data") {
        dataSize = chunkSize;
        if (dataSize === 0 || dataSize === 0xffffffff) {
          const stat = await handle.stat();
          dataSize = stat.size - (offset + 8);
        }
        break;
      }

      offset += 8 + chunkSize + (chunkSize % 2);
    }

    if (byteRate === 0 && sampleRate && numChannels && bitsPerSample) {
      byteRate = sampleRate * numChannels * (bitsPerSample / 8);
    }

    if (byteRate === 0 || dataSize === 0) return null;

    return Math.floor(dataSize / byteRate);
  } catch (err) {
    console.error("Failed to parse WAV duration:", filePath, err);
    return null;
  } finally {
    await handle?.close();
  }
};

ipcMain.handle("get-wav-duration", async (_event, filePath: string) => {
  return parseWavDuration(filePath);
});

ipcMain.handle(
  "file-exists",
  async (_event, folder: string, name: string): Promise<boolean> => {
    try {
      await fs.access(path.join(folder, name));
      return true;
    } catch {
      return false;
    }
  },
);

const encodeWithFfmpeg = (
  wavData: Uint8Array,
  outputPath: string,
): Promise<void> =>
  new Promise((resolve, reject) => {
    if (!ffmpegPath) {
      reject(new Error("ffmpeg バイナリが見つかりません"));
      return;
    }

    const ff = spawn(ffmpegPath, [
      "-y",
      "-f",
      "wav",
      "-i",
      "pipe:0",
      outputPath,
    ]);

    let stderr = "";
    ff.stderr.on("data", (chunk: Buffer) => {
      stderr += chunk.toString();
    });

    ff.on("error", (err) => reject(err));

    ff.on("close", (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(
          new Error(
            `ffmpeg exit ${code}: ${stderr.split("\n").slice(-3).join("\n")}`,
          ),
        );
      }
    });

    ff.stdin.on("error", (err) => reject(err));
    ff.stdin.write(Buffer.from(wavData));
    ff.stdin.end();
  });

ipcMain.handle(
  "save-file",
  async (
    _event,
    folder: string,
    name: string,
    data: Uint8Array,
  ): Promise<{ success: boolean; path?: string; error?: string }> => {
    try {
      const filePath = path.join(folder, name);
      const ext = path.extname(name).toLowerCase();

      if (ext === ".wav" || ext === "") {
        await fs.writeFile(filePath, Buffer.from(data));
      } else {
        await encodeWithFfmpeg(data, filePath);
      }

      return { success: true, path: filePath };
    } catch (err) {
      console.error("save-file failed:", err);
      return {
        success: false,
        error: err instanceof Error ? err.message : String(err),
      };
    }
  },
);

ipcMain.handle("scan-folder", async (_event, folderPath: string) => {
  try {
    const entries = await fs.readdir(folderPath, { withFileTypes: true });
    return entries
      .filter((entry) => entry.isFile())
      .filter((entry) =>
        AUDIO_EXTENSIONS.has(path.extname(entry.name).toLowerCase()),
      )
      .map((entry) => {
        const fullPath = path.join(folderPath, entry.name);
        return {
          id: fullPath,
          name: path.parse(entry.name).name,
          path: fullPath,
          url: toMediaUrl(fullPath),
        };
      });
  } catch (err) {
    console.error("Failed to scan folder:", err);
    return [];
  }
});

app.whenReady().then(() => {
  protocol.handle("media", async (request) => {
    const filePath = parseMediaUrl(request.url);
    console.log("[media] request:", request.url, "->", filePath);
    if (!filePath) {
      return new Response(null, { status: 400 });
    }
    try {
      const data = await fs.readFile(filePath);
      const contentType =
        MIME_TYPES[path.extname(filePath).toLowerCase()] ||
        "application/octet-stream";
      return new Response(new Uint8Array(data), {
        headers: {
          "Content-Type": contentType,
          "Content-Length": String(data.byteLength),
          "Access-Control-Allow-Origin": "*",
        },
      });
    } catch (err) {
      console.error("[media] read failed:", filePath, err);
      return new Response(null, { status: 404 });
    }
  });

  createWindow();
});
