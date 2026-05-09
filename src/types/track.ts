export type Track = {
  id: string;
  title: string;
  durationSec: number;
  color: "purple" | "blue" | "green" | "orange" | "pink";
  selected: boolean;
};