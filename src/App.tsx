import { useMemo, useState } from "react";
import { mockTracks } from "./data/mockTracks";
import { formatTime } from "./utils/time";
import "./styles/App.css";

function App() {
  const [tracks, setTracks] = useState(mockTracks);
  const [loopCount, setLoopCount] = useState(3);
  const [outputName, setOutputName] = useState("BGM_Booth_v1.mp3");

  const selectedTracks = tracks.filter((track) => track.selected);

  const totalSec = useMemo(
    () => selectedTracks.reduce((sum, track) => sum + track.durationSec, 0),
    [selectedTracks],
  );

  const finalSec = totalSec * loopCount;

  const toggleTrack = (id: string) => {
    setTracks((prev) =>
      prev.map((track) =>
        track.id === id ? { ...track, selected: !track.selected } : track,
      ),
    );
  };

  return (
    <div className="app">
      <header className="header">
        <div className="brand">
          <div className="logo">♫</div>
          <div>
            <h1>♫
              BGM Builder <span>v1</span>
            </h1>
            <p>ブースで販売するBGMを簡単に作成</p>
          </div>
        </div>

        <div className="header-card">
          <div className="wave">≋</div>
          <div>
            <strong>あなたのブースを彩る</strong>
            <p>オリジナルBGMを作ろう！</p>
          </div>
        </div>
      </header>

      <main className="layout">
        <section className="panel left-panel">
          <h2>1. フォルダを選択</h2>

          <button className="primary-button">□ フォルダを選択</button>

          <div className="folder-path">
            /Users/username/Music/BGM素材
            <span>↗</span>
          </div>

          <div className="info-card">
            <h3>フォルダ内の情報</h3>
            <div className="info-grid">
              <div>
                <div className="small-icon">◷</div>
                <p>合計再生時間</p>
                <strong>23:45</strong>
              </div>
              <div>
                <div className="small-icon">□</div>
                <p>ファイル数</p>
                <strong>12 ファイル</strong>
              </div>
            </div>
          </div>

          <h2>2. 利用可能なトラック</h2>

          <input className="search" placeholder="⌕  トラックを検索..." />

          <div className="track-list">
            {tracks.map((track) => (
              <label className="track-row" key={track.id}>
                <input
                  type="checkbox"
                  checked={track.selected}
                  onChange={() => toggleTrack(track.id)}
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
              style={{ width: `${Math.min((finalSec / 3600) * 100, 100)}%` }}
            />
          </div>

          <p className="drag-note">ドラッグで並び替えできます</p>

          <div className="selected-list">
            {selectedTracks.map((track) => (
              <div className="selected-card" key={track.id}>
                <span className="drag">⠿</span>
                <span className={`big-icon ${track.color}`}>♪</span>
                <div className="selected-info">
                  <strong>{track.title}</strong>
                  <p>{formatTime(track.durationSec)}</p>
                </div>
                <select>
                  <option>× 1</option>
                  <option>× 2</option>
                  <option>× 3</option>
                </select>
                <button onClick={() => toggleTrack(track.id)}>×</button>
              </div>
            ))}
          </div>

          <button className="drop-area">
            ＋ トラックをここにドラッグして追加
          </button>
        </section>

        <section className="panel right-panel">
          <h2>4. 出力サマリー</h2>

          <label className="field">
            出力ファイル名
            <div className="input-wrap">
              <input
                value={outputName}
                onChange={(e) => setOutputName(e.target.value)}
              />
              <span>✎</span>
            </div>
          </label>

          <div className="summary-card">
            <h3>時間の内訳</h3>

            <div className="summary-row">
              <span>↻ ループ回数</span>
              <strong>{loopCount} 回</strong>
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
            <button className="play">▶</button>
            <div>
              <strong>プレビュー再生</strong>
              <p>00:00 / {formatTime(finalSec)}</p>
            </div>
            <div className="volume">▮</div>
          </div>

          <button className="build-button">♪ ビルド開始</button>

          <div className="tip-card">
            <strong>💡 ヒント</strong>
            <p>
              ループ回数を変更することで、
              <br />
              ブースに最適な長さに調整できます
            </p>
          </div>
        </section>
      </main>

      <footer>© 2024 BGM Builder v1 - あなただけの特別なBGMを作ろう</footer>
    </div>
  );
}

export default App;
