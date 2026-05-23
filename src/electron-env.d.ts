import type { ScannedFile } from "./types/track";

export {};

declare global {
  interface Window {
    api: {
      test: () => string;
      selectFolder: () => Promise<string | null>;
      scanFolder: (folderPath: string) => Promise<ScannedFile[]>;
      getWavDuration: (filePath: string) => Promise<number | null>;
      fileExists: (folder: string, name: string) => Promise<boolean>;
      saveFile: (
        folder: string,
        name: string,
        data: Uint8Array,
      ) => Promise<{ success: boolean; path?: string; error?: string }>;
    };
  }
}
