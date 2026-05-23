export type Track = {
  id: string;
  title: string;
  durationSec: number;
  color: "purple" | "blue" | "green" | "orange" | "pink";
  selected: boolean;
  path?: string;
  url?: string;
};

export type ScannedFile = {
  id: string;
  name: string;
  path: string;
  url: string;
};
