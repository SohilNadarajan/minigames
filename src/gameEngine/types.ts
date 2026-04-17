export type Difficulty = "easy" | "medium" | "hard";
export type GameDifficulty = "easy" | "medium" | "hard";

export type OcclusionStyle = "none" | "softVignette";

export type PuzzleModifiers = {
  displayMs: number;
  floatingAmplitude: number;
  rotationDeg: number;
  occlusion: OcclusionStyle;
  canvasShift: boolean;
  shiftAmplitude?: number;
  floatSpeed?: number;
};

export type PuzzleDefinition = {
  id: string;
  difficulty: Difficulty;
  gridSize: { rows: number; cols: number };
  grid: number[][];
  correctAnswer: number;
  modifiers: PuzzleModifiers;
};

export type RoundModifierType = "none" | "translate" | "rotate";

export type RoundPlan = {
  baseDifficulty: Difficulty;
  effectiveDifficulty: Difficulty;
  peekMs: number;
  modifier: RoundModifierType;
  modifierDurationMs: number;
  translateAxis?: "row" | "col";
  translateDirection?: 1 | -1;
  rotateDirection?: 1 | -1;
};

export type PuzzleDataset = {
  version: number;
  puzzles: PuzzleDefinition[];
};

export type GameFlowState =
  | "lobby"
  | "playing"
  | "round_reveal"
  | "results";

export type RoomSettings = {
  totalRounds: number;
  gameDifficulty: GameDifficulty;
  startingLives: number;
  farOffThreshold: number;
};

export const DEFAULT_ROOM_SETTINGS: RoomSettings = {
  totalRounds: 10,
  gameDifficulty: "medium",
  startingLives: 3,
  farOffThreshold: 3,
};
