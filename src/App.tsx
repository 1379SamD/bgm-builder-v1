import { useEffect, useMemo, useRef, useState } from "react";
import { formatTime } from "./utils/time";
import type { ScannedFile, Track } from "./types/track";
import "./styles/App.css";

const TRACK_COLORS: Track["color"][] = [
  "purple",
  "blue",
  "green",
  "orange",
  "pink",
];

const DURATION_TIMEOUT_MS = 10000;

const loadDurationViaAudio = (url: string): Promise<number> =>
  new Promise((resolve) => {
    const audio = new Audio(url);
    let settled = false;
    const finish = (sec: number) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(sec);
    };
    const timer = setTimeout(() => finish(0), DURATION_TIMEOUT_MS);
    audio.addEventListener("loadedmetadata", () => {
      const sec = Number.isFinite(audio.duration) ? audio.duration : 0;
      finish(Math.floor(sec));
    });
    audio.addEventListener("error", () => {
      console.warn("Failed to load audio:", url, audio.error);
      finish(0);
    });
  });

const loadDuration = async (file: ScannedFile): Promise<number> => {
  if (file.path.toLowerCase().endsWith(".wav")) {
    const sec = await window.api.getWavDuration(file.path);
    if (sec !== null && sec > 0) return sec;
  }
  return loadDurationViaAudio(file.url);
};

const encodeWav = (buffer: AudioBuffer): Uint8Array => {
  const numChannels = buffer.numberOfChannels;
  const sampleRate = buffer.sampleRate;
  const length = buffer.length;
  const bytesPerSample = 2;
  const dataSize = length * numChannels * bytesPerSample;
  const totalSize = 44 + dataSize;

  const ab = new ArrayBuffer(totalSize);
  const view = new DataView(ab);

  const writeStr = (offset: number, str: string) => {
    for (let i = 0; i < str.length; i++) {
      view.setUint8(offset + i, str.charCodeAt(i));
    }
  };

  writeStr(0, "RIFF");
  view.setUint32(4, totalSize - 8, true);
  writeStr(8, "WAVE");
  writeStr(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, numChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * numChannels * bytesPerSample, true);
  view.setUint16(32, numChannels * bytesPerSample, true);
  view.setUint16(34, bytesPerSample * 8, true);
  writeStr(36, "data");
  view.setUint32(40, dataSize, true);

  const channels: Float32Array[] = [];
  for (let c = 0; c < numChannels; c++) {
    channels.push(buffer.getChannelData(c));
  }

  let offset = 44;
  for (let i = 0; i < length; i++) {
    for (let c = 0; c < numChannels; c++) {
      const sample = Math.max(-1, Math.min(1, channels[c][i]));
      const int16 = sample < 0 ? sample * 0x8000 : sample * 0x7fff;
      view.setInt16(offset, int16, true);
      offset += 2;
    }
  }

  return new Uint8Array(ab);
};

const buildInitialTrack = (file: ScannedFile, index: number): Track => ({
  id: file.id,
  title: file.name,
  durationSec: 0,
  color: TRACK_COLORS[index % TRACK_COLORS.length],
  selected: false,
  path: file.path,
  url: file.url,
});

type DropPosition = "before" | "after";

function App() {
  const [tracks, setTracks] = useState<Track[]>([]);
  const [loopCount, setLoopCount] = useState(1);
  const [outputName, setOutputName] = useState("");
  const [folderPath, setFolderPath] = useState<string | null>(null);
  const [outputFolder, setOutputFolder] = useState<string | null>(null);
  const [scanning, setScanning] = useState(false);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [dropTarget, setDropTarget] = useState<{
    id: string;
    position: DropPosition;
  } | null>(null);
  const [playingId, setPlayingId] = useState<string | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [playPosition, setPlayPosition] = useState(0);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const [previewPlaying, setPreviewPlaying] = useState(false);
  const [previewPosition, setPreviewPosition] = useState(0);
  const [previewVolume, setPreviewVolume] = useState(1);
  const previewAudioRef = useRef<HTMLAudioElement | null>(null);
  const previewIndexRef = useRef<number>(0);

  const [building, setBuilding] = useState(false);
  const [buildStatus, setBuildStatus] = useState<string | null>(null);

  useEffect(() => {
    return () => {
      audioRef.current?.pause();
      audioRef.current = null;
      previewAudioRef.current?.pause();
      previewAudioRef.current = null;
    };
  }, []);

  const handleSelectOutputFolder = async () => {
    const selected = await window.api.selectFolder();
    if (!selected) return;
    setOutputFolder(selected);
  };

  const performScan = async (target: string, preserveSelection: boolean) => {
    stopPlayback();
    stopPreview();
    const prevSelectedIds = preserveSelection
      ? new Set(tracks.filter((t) => t.selected).map((t) => t.id))
      : new Set<string>();
    setScanning(true);
    try {
      const files = await window.api.scanFolder(target);
      setTracks(
        files.map((file, index) => ({
          ...buildInitialTrack(file, index),
          selected: prevSelectedIds.has(file.id),
        })),
      );
      files.forEach((file) => {
        loadDuration(file).then((durationSec) => {
          setTracks((prev) =>
            prev.map((track) =>
              track.id === file.id ? { ...track, durationSec } : track,
            ),
          );
        });
      });
    } finally {
      setScanning(false);
    }
  };

  const handleSelectFolder = async () => {
    const selected = await window.api.selectFolder();
    if (!selected) return;
    setFolderPath(selected);
    await performScan(selected, false);
  };

  const handleRefresh = () => {
    if (!folderPath || scanning) return;
    void performScan(folderPath, true);
  };

  const selectedTracks = tracks.filter((track) => track.selected);

  const totalSec = useMemo(
    () => selectedTracks.reduce((sum, track) => sum + track.durationSec, 0),
    [selectedTracks],
  );

  const totalFolderSec = useMemo(
    () => tracks.reduce((sum, track) => sum + track.durationSec, 0),
    [tracks],
  );

  const finalSec = totalSec * loopCount;

  const previewPlaylist = useMemo(() => {
    const items: { track: Track; startSec: number }[] = [];
    let cursor = 0;
    for (let i = 0; i < loopCount; i++) {
      for (const track of selectedTracks) {
        if (track.durationSec > 0 && track.url) {
          items.push({ track, startSec: cursor });
          cursor += track.durationSec;
        }
      }
    }
    return items;
  }, [selectedTracks, loopCount]);

  const toggleTrack = (id: string) => {
    setTracks((prev) =>
      prev.map((track) =>
        track.id === id ? { ...track, selected: !track.selected } : track,
      ),
    );
  };

  const clearDragState = () => {
    setDraggingId(null);
    setDropTarget(null);
  };

  const stopPlayback = () => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current = null;
    }
    setPlayingId(null);
    setIsPlaying(false);
    setPlayPosition(0);
  };

  const stopPreview = () => {
    if (previewAudioRef.current) {
      previewAudioRef.current.pause();
      previewAudioRef.current.src = "";
      previewAudioRef.current = null;
    }
    setPreviewPlaying(false);
  };

  const loadAndPlayItem = (idx: number, offsetSec: number) => {
    const item = previewPlaylist[idx];
    if (!item || !item.track.url) {
      stopPreview();
      return;
    }

    if (previewAudioRef.current) {
      previewAudioRef.current.pause();
      previewAudioRef.current.src = "";
    }

    const audio = new Audio(item.track.url);
    audio.volume = previewVolume;
    previewIndexRef.current = idx;
    previewAudioRef.current = audio;

    const onLoadedMetadata = () => {
      if (offsetSec > 0 && offsetSec < (audio.duration || Infinity)) {
        audio.currentTime = offsetSec;
      }
      audio
        .play()
        .then(() => setPreviewPlaying(true))
        .catch(() => stopPreview());
    };

    audio.addEventListener("loadedmetadata", onLoadedMetadata, { once: true });
    audio.addEventListener("timeupdate", () => {
      setPreviewPosition(item.startSec + audio.currentTime);
    });
    audio.addEventListener("ended", () => {
      if (idx + 1 < previewPlaylist.length) {
        loadAndPlayItem(idx + 1, 0);
      } else {
        setPreviewPosition(finalSec);
        stopPreview();
      }
    });
    audio.addEventListener("error", () => {
      console.warn("Preview error on:", item.track.url, audio.error);
      stopPreview();
    });
  };

  const handlePreviewToggle = () => {
    if (previewPlaylist.length === 0) return;

    if (previewPlaying) {
      previewAudioRef.current?.pause();
      setPreviewPlaying(false);
      return;
    }

    if (previewAudioRef.current && previewAudioRef.current.src) {
      previewAudioRef.current
        .play()
        .then(() => setPreviewPlaying(true))
        .catch(() => stopPreview());
      return;
    }

    stopPlayback();
    const startPos = previewPosition >= finalSec ? 0 : previewPosition;
    const idx = findPlaylistIndexAt(startPos);
    const item = previewPlaylist[idx];
    loadAndPlayItem(idx, startPos - item.startSec);
  };

  const findPlaylistIndexAt = (sec: number): number => {
    if (previewPlaylist.length === 0) return 0;
    for (let i = previewPlaylist.length - 1; i >= 0; i--) {
      if (previewPlaylist[i].startSec <= sec) return i;
    }
    return 0;
  };

  const handlePreviewSeek = (e: React.MouseEvent<HTMLDivElement>) => {
    if (previewPlaylist.length === 0 || finalSec === 0) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const ratio = Math.max(
      0,
      Math.min((e.clientX - rect.left) / rect.width, 1),
    );
    const targetSec = ratio * finalSec;
    setPreviewPosition(targetSec);

    const wasPlaying = previewPlaying || Boolean(previewAudioRef.current);
    if (wasPlaying) {
      stopPlayback();
      const idx = findPlaylistIndexAt(targetSec);
      const item = previewPlaylist[idx];
      loadAndPlayItem(idx, targetSec - item.startSec);
    }
  };

  const handleVolumeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const v = Number(e.target.value);
    setPreviewVolume(v);
    if (previewAudioRef.current) {
      previewAudioRef.current.volume = v;
    }
    if (audioRef.current) {
      audioRef.current.volume = v;
    }
  };

  const handleTrackSeek =
    (track: Track) => (e: React.MouseEvent<HTMLDivElement>) => {
      e.preventDefault();
      e.stopPropagation();
      if (
        playingId !== track.id ||
        !audioRef.current ||
        track.durationSec === 0
      ) {
        return;
      }
      const rect = e.currentTarget.getBoundingClientRect();
      const ratio = Math.max(
        0,
        Math.min((e.clientX - rect.left) / rect.width, 1),
      );
      const target = ratio * track.durationSec;
      audioRef.current.currentTime = target;
      setPlayPosition(target);
    };

  const handleBuild = async () => {
    if (selectedTracks.length === 0) {
      setBuildStatus("エラー: 選択トラックがありません");
      return;
    }
    if (!outputFolder) {
      setBuildStatus("エラー: 保存先フォルダを選択してください");
      return;
    }
    if (!outputName.trim()) {
      setBuildStatus("エラー: 出力ファイル名を入力してください");
      return;
    }

    const trimmedName = outputName.trim();
    const extMatch = trimmedName.toLowerCase().match(/\.([^.]+)$/);
    const ext = extMatch?.[1] ?? "";
    if (ext !== "wav" && ext !== "mp3") {
      setBuildStatus(
        "✗ 出力ファイルの拡張子は .wav または .mp3 にしてください",
      );
      return;
    }

    const exists = await window.api.fileExists(outputFolder, trimmedName);
    if (exists) {
      setBuildStatus(`✗ 同名のファイルが既に存在します: ${trimmedName}`);
      return;
    }

    stopPlayback();
    stopPreview();
    setBuilding(true);
    setBuildStatus("デコード中...");

    try {
      const uniqueIds = Array.from(new Set(selectedTracks.map((t) => t.id)));
      const trackById = new Map(selectedTracks.map((t) => [t.id, t]));

      const audioCtx = new AudioContext();
      const buffers = new Map<string, AudioBuffer>();
      const failed: string[] = [];

      for (const id of uniqueIds) {
        const track = trackById.get(id);
        if (!track?.url) continue;
        let stage: "fetch" | "decode" = "fetch";
        try {
          const response = await fetch(track.url);
          if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
          }
          const ab = await response.arrayBuffer();
          stage = "decode";
          const buf = await audioCtx.decodeAudioData(ab);
          buffers.set(id, buf);
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          console.warn(`Build ${stage} failed:`, track.title, err);
          failed.push(`${track.title} [${stage}] ${msg}`);
        }
      }
      await audioCtx.close();

      if (buffers.size === 0) {
        throw new Error(
          `すべてのトラックのデコードに失敗しました\n${failed.join("\n")}`,
        );
      }

      setBuildStatus("レンダリング中...");

      let totalDur = 0;
      for (let loop = 0; loop < loopCount; loop++) {
        for (const track of selectedTracks) {
          const buf = buffers.get(track.id);
          if (buf) totalDur += buf.duration;
        }
      }

      const targetSampleRate = 44100;
      const targetChannels = 2;
      const totalSamples = Math.max(1, Math.ceil(totalDur * targetSampleRate));
      const offlineCtx = new OfflineAudioContext(
        targetChannels,
        totalSamples,
        targetSampleRate,
      );

      let cursorSec = 0;
      for (let loop = 0; loop < loopCount; loop++) {
        for (const track of selectedTracks) {
          const buf = buffers.get(track.id);
          if (!buf) continue;
          const src = offlineCtx.createBufferSource();
          src.buffer = buf;
          src.connect(offlineCtx.destination);
          src.start(cursorSec);
          cursorSec += buf.duration;
        }
      }

      const rendered = await offlineCtx.startRendering();

      const wavData = encodeWav(rendered);
      const filename = outputName.trim();
      const ext = filename.toLowerCase().split(".").pop();
      setBuildStatus(
        ext && ext !== "wav"
          ? `${ext.toUpperCase()} にエンコード中...`
          : "ファイル書き出し中...",
      );
      const result = await window.api.saveFile(outputFolder, filename, wavData);

      if (!result.success) {
        throw new Error(result.error ?? "保存に失敗しました");
      }

      const skipped =
        failed.length > 0 ? `（スキップ: ${failed.join(", ")}）` : "";
      setBuildStatus(`✓ 完了: ${result.path}${skipped}`);
    } catch (err) {
      console.error("Build failed:", err);
      const msg = err instanceof Error ? err.message : String(err);
      setBuildStatus(`✗ 失敗: ${msg}`);
    } finally {
      setBuilding(false);
    }
  };

  const handlePlayTrack =
    (track: Track) => (e: React.MouseEvent<HTMLButtonElement>) => {
      e.preventDefault();
      e.stopPropagation();
      if (!track.url) return;

      stopPreview();

      if (playingId === track.id && audioRef.current) {
        if (isPlaying) {
          audioRef.current.pause();
          setIsPlaying(false);
        } else {
          audioRef.current.play().catch(() => setIsPlaying(false));
          setIsPlaying(true);
        }
        return;
      }

      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current = null;
      }

      const audio = new Audio(track.url);
      audio.volume = previewVolume;
      audio.addEventListener("timeupdate", () => {
        setPlayPosition(audio.currentTime);
      });
      audio.addEventListener("ended", () => {
        setIsPlaying(false);
        setPlayPosition(0);
      });
      audio.addEventListener("error", () => {
        console.warn("Failed to play:", track.url, audio.error);
        stopPlayback();
      });

      audioRef.current = audio;
      setPlayingId(track.id);
      setPlayPosition(0);
      audio
        .play()
        .then(() => setIsPlaying(true))
        .catch(() => stopPlayback());
    };

  const handleDragStart =
    (id: string) => (e: React.DragEvent<HTMLDivElement>) => {
      setDraggingId(id);
      e.dataTransfer.effectAllowed = "move";
      e.dataTransfer.setData("text/plain", id);
    };

  const handleDragOver =
    (id: string) => (e: React.DragEvent<HTMLDivElement>) => {
      if (!draggingId || draggingId === id) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = "move";
      const rect = e.currentTarget.getBoundingClientRect();
      const position: DropPosition =
        e.clientY < rect.top + rect.height / 2 ? "before" : "after";
      if (dropTarget?.id !== id || dropTarget?.position !== position) {
        setDropTarget({ id, position });
      }
    };

  const handleDrop =
    (targetId: string) => (e: React.DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      const sourceId = draggingId;
      const position =
        dropTarget?.id === targetId ? dropTarget.position : "before";
      clearDragState();
      if (!sourceId || sourceId === targetId) return;

      setTracks((prev) => {
        const sourceIdx = prev.findIndex((t) => t.id === sourceId);
        if (sourceIdx === -1) return prev;
        const next = [...prev];
        const [moved] = next.splice(sourceIdx, 1);
        let insertIdx = next.findIndex((t) => t.id === targetId);
        if (insertIdx === -1) return prev;
        if (position === "after") insertIdx += 1;
        next.splice(insertIdx, 0, moved);
        return next;
      });
    };

  return (
    <div className="app">
      <header className="header">
        <div className="brand">
          <div className="logo">♫</div>
          <div>
            <div className="title">
              体験版 BGM Builder <span>v1</span>
            </div>
          </div>
        </div>
        <button
          type="button"
          className={`refresh-button${scanning ? " spinning" : ""}`}
          onClick={handleRefresh}
          disabled={!folderPath || scanning}
          title={folderPath ? "フォルダを再スキャン" : "フォルダ未選択"}
          aria-label="フォルダを更新"
        >
          ↻
        </button>
      </header>

      <main className="layout">
        <section className="panel left-panel">
          <h2>1. フォルダを選択</h2>

          <button className="primary-button" onClick={handleSelectFolder}>
            フォルダを選択
          </button>

          {folderPath && (
            <div className="folder-path">
              <span className="folder-path-text" title={folderPath}>
                {folderPath}
              </span>
              <span className="folder-path-icon">↗</span>
            </div>
          )}

          <div className="info-card">
            <h3>フォルダ内の情報</h3>
            <div className="info-grid">
              <div>
                <div className="small-icon">◷</div>
                <p>合計再生時間</p>
                <h2>{formatTime(totalFolderSec)}</h2>
              </div>
              <div>
                <div className="small-icon">♫</div>
                <p>ファイル数</p>
                <h2>{tracks.length} ファイル</h2>
              </div>
            </div>
          </div>

          <h2>2. 利用可能なトラック</h2>

          <div className="track-list">
            {scanning && <p className="hint">読み込み中...</p>}
            {!scanning && tracks.length === 0 && (
              <p className="hint">
                {folderPath
                  ? "対応する音声ファイルが見つかりません"
                  : "フォルダを選択するとトラックが表示されます"}
              </p>
            )}
            {tracks.map((track) => (
              <label className="track-row" key={track.id}>
                <input
                  type="checkbox"
                  checked={track.selected}
                  onChange={() => {
                    const selectedCount = tracks.filter(
                      (t) => t.selected,
                    ).length;

                    // 未選択 → 選択しようとしている時だけ制限
                    if (!track.selected && selectedCount >= 3) {
                      alert("体験版では3曲まで選択できます。");
                      return;
                    }

                    toggleTrack(track.id);
                  }}
                />

                <span className={`music-icon ${track.color}`}>♪</span>
                <span className="track-title">{track.title}</span>

                <span className="duration">
                  {formatTime(track.durationSec)}
                </span>
              </label>
            ))}
          </div>

          <p className="hint">ⓘ チェックしたトラックが中央に表示されます</p>
        </section>

        <section className="panel center-panel">
          <div className="section-head">
            <h2>
              3. 選択したトラック <span>({selectedTracks.length}曲)</span>
            </h2>
            <div className="head-controls">
              <p>合計 {formatTime(totalSec)}</p>
              <label>
                ループ回数
                <select
                  value={loopCount}
                  onChange={(e) => setLoopCount(Number(e.target.value))}
                >
                  <option value={1}>1</option>
                  <option value={2}>2</option>
                  <option value={3}>3</option>
                  <option value={4}>4</option>
                  <option value={5}>5</option>
                </select>
              </label>
            </div>
          </div>

          <div className="progress">
            <span
              style={{
                width:
                  totalFolderSec > 0
                    ? `${Math.min((totalSec / totalFolderSec) * 100, 100)}%`
                    : "0%",
              }}
            />
          </div>

          <div className="drag-note">
            <span>ドラッグで並び替えできます</span>
            <div className="drag-note-volume">
              <span aria-hidden="true">
                {previewVolume === 0 ? "🔇" : "🔊"}
              </span>
              <input
                type="range"
                min={0}
                max={1}
                step={0.01}
                value={previewVolume}
                onChange={handleVolumeChange}
                aria-label="音量"
              />
            </div>
          </div>

          <div className="selected-list">
            {selectedTracks.map((track) => {
              const isDragging = draggingId === track.id;
              const isDropTarget = dropTarget?.id === track.id && !isDragging;
              const isActive = playingId === track.id;
              const progress =
                isActive && track.durationSec > 0
                  ? Math.min((playPosition / track.durationSec) * 100, 100)
                  : 0;
              const canPlay = Boolean(track.url);
              const cardClass = [
                "selected-card",
                isDragging ? "dragging" : "",
                isDropTarget && dropTarget?.position === "before"
                  ? "drop-before"
                  : "",
                isDropTarget && dropTarget?.position === "after"
                  ? "drop-after"
                  : "",
              ]
                .filter(Boolean)
                .join(" ");

              return (
                <div
                  className={cardClass}
                  key={track.id}
                  draggable
                  onDragStart={handleDragStart(track.id)}
                  onDragOver={handleDragOver(track.id)}
                  onDrop={handleDrop(track.id)}
                  onDragEnd={clearDragState}
                  onDragLeave={(e) => {
                    if (e.currentTarget.contains(e.relatedTarget as Node)) {
                      return;
                    }
                    if (dropTarget?.id === track.id) setDropTarget(null);
                  }}
                >
                  <span className="drag">⠿</span>
                  <span className={`big-icon ${track.color}`}>♪</span>
                  <div className="selected-info">
                    <strong>{track.title}</strong>
                    <p>{formatTime(track.durationSec)}</p>
                  </div>
                  <button
                    type="button"
                    className={`track-play${isActive && isPlaying ? " playing" : ""}`}
                    onClick={handlePlayTrack(track)}
                    disabled={!canPlay}
                    draggable={false}
                    aria-label={isActive && isPlaying ? "一時停止" : "再生"}
                  >
                    {isActive && isPlaying ? "⏸" : "▶"}
                  </button>
                  <div
                    className="track-progress"
                    onClick={handleTrackSeek(track)}
                    onMouseDown={(e) => e.stopPropagation()}
                    role="slider"
                    aria-valuemin={0}
                    aria-valuemax={track.durationSec}
                    aria-valuenow={isActive ? playPosition : 0}
                  >
                    <span style={{ width: `${progress}%` }} />
                  </div>
                  <button
                    className="close-button"
                    onClick={() => toggleTrack(track.id)}
                    draggable={false}
                  >
                    ×
                  </button>
                </div>
              );
            })}
          </div>
        </section>

        <section className="panel right-panel">
          <h2 className="panelH2">4. 出力サマリー</h2>

          <label className="field1">
            保存先フォルダ
            <button
              type="button"
              className="input-wrap folder-button"
              onClick={handleSelectOutputFolder}
              title={outputFolder ?? undefined}
            >
              <span
                className={`folder-button-text${outputFolder ? "" : " placeholder"}`}
              >
                {outputFolder ?? "クリックしてフォルダを選択"}
              </span>
              <span>📁</span>
            </button>
          </label>
          <label className="field2">
            出力ファイル名
            <div className="input-wrap">
              <input
                value={outputName}
                onChange={(e) => setOutputName(e.target.value)}
                placeholder="出力ファイル名を入力"
              />
              <span>✎</span>
            </div>
          </label>

          <div className="summary-card">
            <h3>時間の内訳</h3>

            <div className="summary-row">
              <span>↻ ループ回数</span>
              <strong>{loopCount === 1 ? "なし" : `${loopCount} 回`}</strong>
            </div>

            <div className="summary-row">
              <span>◷ 素材の合計時間</span>
              <strong>{formatTime(totalSec)}</strong>
            </div>

            <div className="summary-row final">
              <span>♪ 最終の合計時間</span>
              <strong>{formatTime(finalSec)}</strong>
            </div>
          </div>

          <div className="preview-card">
            <button
              type="button"
              className="play"
              onClick={handlePreviewToggle}
              disabled={previewPlaylist.length === 0}
              aria-label={previewPlaying ? "一時停止" : "プレビュー再生"}
            >
              {previewPlaying ? "⏸" : "▶"}
            </button>
            <div className="preview-body">
              <strong>プレビュー再生</strong>
              <div
                className="preview-progress"
                onClick={handlePreviewSeek}
                role="slider"
                aria-valuemin={0}
                aria-valuemax={finalSec}
                aria-valuenow={previewPosition}
              >
                <span
                  style={{
                    width:
                      finalSec > 0
                        ? `${Math.min((previewPosition / finalSec) * 100, 100)}%`
                        : "0%",
                  }}
                />
              </div>
              <p>
                {formatTime(Math.floor(previewPosition))} /{" "}
                {formatTime(finalSec)}
              </p>
            </div>
            <div className="preview-volume">
              <span aria-hidden="true">
                {previewVolume === 0 ? "🔇" : "🔊"}
              </span>
              <input
                type="range"
                min={0}
                max={1}
                step={0.01}
                value={previewVolume}
                onChange={handleVolumeChange}
                aria-label="音量"
              />
            </div>
          </div>

          <button
            type="button"
            className="build-button"
            onClick={handleBuild}
            disabled={building || selectedTracks.length === 0}
          >
            {building ? "生成中..." : "ファイルを書き出す"}
          </button>
          {buildStatus && (
            <p
              className={`build-status${
                buildStatus.startsWith("✗") || buildStatus.startsWith("エラー")
                  ? " error"
                  : buildStatus.startsWith("✓")
                    ? " success"
                    : ""
              }`}
            >
              {buildStatus}
            </p>
          )}
        </section>
      </main>
    </div>
  );
}

export default App;
