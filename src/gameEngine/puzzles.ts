import puzzleData from "../data/puzzles.json";
import type { PuzzleDataset, PuzzleDefinition } from "./types";

const dataset = puzzleData as PuzzleDataset;

export function getPuzzleDataset(): PuzzleDataset {
  return dataset;
}

export function getPuzzleById(id: string): PuzzleDefinition | undefined {
  return dataset.puzzles.find((p) => p.id === id);
}
