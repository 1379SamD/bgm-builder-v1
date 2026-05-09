import type { Track } from "../types/track";

export const mockTracks: Track[] = [
  { id: "1", title: "明るい日常のテーマ", durationSec: 252, color: "purple", selected: true },
  { id: "2", title: "穏やかな午後", durationSec: 338, color: "blue", selected: true },
  { id: "3", title: "森のささやき", durationSec: 415, color: "green", selected: true },
  { id: "4", title: "わくわくする冒険", durationSec: 435, color: "orange", selected: true },
  { id: "5", title: "切ないピアノ", durationSec: 394, color: "pink", selected: false },
  { id: "6", title: "カフェのBGM", durationSec: 225, color: "purple", selected: false },
  { id: "7", title: "エレクトロ・ポップ", durationSec: 241, color: "blue", selected: false },
  { id: "8", title: "夜の静けさ", durationSec: 322, color: "green", selected: false },
];