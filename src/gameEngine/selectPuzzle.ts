import type { Difficulty, PuzzleDataset, PuzzleDefinition } from "./types";

export function difficultyForRound(roundIndex1Based: number, totalRounds: number): Difficulty {
  const t = totalRounds > 0 ? (roundIndex1Based - 1) / totalRounds : 0;
  if (t < 1 / 3) return "easy";
  if (t < 2 / 3) return "medium";
  return "hard";
}

export function puzzlesForDifficulty(
  dataset: PuzzleDataset,
  difficulty: Difficulty
): PuzzleDefinition[] {
  return dataset.puzzles.filter((p) => p.difficulty === difficulty);
}

function pickRandom<T>(items: T[]): T | null {
  if (items.length === 0) return null;
  const i = Math.floor(Math.random() * items.length);
  return items[i]!;
}

export function selectNextPuzzle(
  dataset: PuzzleDataset,
  roundIndex1Based: number,
  totalRounds: number,
  usedIds: string[]
): PuzzleDefinition | null {
  const difficulty = difficultyForRound(roundIndex1Based, totalRounds);
  const pool = puzzlesForDifficulty(dataset, difficulty).filter(
    (p) => !usedIds.includes(p.id)
  );
  const choice = pickRandom(pool);
  if (choice) return choice;
  const freshPool = puzzlesForDifficulty(dataset, difficulty);
  return pickRandom(freshPool);
}
