import type { PuzzleDefinition } from "./types";

export function countBlocksInGrid(grid: number[][]): number {
  let n = 0;
  for (const row of grid) {
    for (const cell of row) {
      n += Math.max(0, Math.floor(cell));
    }
  }
  return n;
}

export function validatePuzzleShape(p: PuzzleDefinition): string | null {
  const { rows, cols } = p.gridSize;
  if (!Array.isArray(p.grid) || p.grid.length !== rows) {
    return "grid row count does not match gridSize.rows";
  }
  for (let r = 0; r < rows; r++) {
    const row = p.grid[r];
    if (!Array.isArray(row) || row.length !== cols) {
      return `row ${r} length mismatch`;
    }
    for (let c = 0; c < cols; c++) {
      const v = row[c];
      if (!Number.isInteger(v) || v < 0) {
        return `invalid cell at ${r},${c}`;
      }
    }
  }
  return null;
}

export function validateCorrectAnswer(p: PuzzleDefinition): boolean {
  return countBlocksInGrid(p.grid) === p.correctAnswer;
}
