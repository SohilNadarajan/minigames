import type { GameFlowState, RoomSettings, RoundPlan } from "../gameEngine/types";

export type FirestoreRoom = {
  code: string;
  hostId: string;
  hostName: string;
  createdAt: number;
  gameState: GameFlowState;
  currentRound: number;
  totalRounds: number;
  currentPuzzleId: string | null;
  roundStartedAt: number | null;
  roundEndsAt: number | null;
  submissionsLocked: boolean;
  usedPuzzleIds: string[];
  settings: RoomSettings;
  currentRoundPlan?: RoundPlan | null;
  lastAnswer: number | null;
};

export type FirestorePlayer = {
  name: string;
  guess: number;
  score: number;
  lives: number;
  isReady: boolean;
  /** True after the player taps Submit for the current round (lobby uses `isReady`). */
  roundSubmitted?: boolean;
};
