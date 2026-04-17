import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const raw = readFileSync(join(__dirname, "../src/data/puzzles.json"), "utf8");
const data = JSON.parse(raw);

let errors = 0;
for (const p of data.puzzles) {
  const { rows, cols } = p.gridSize;
  if (!Array.isArray(p.grid) || p.grid.length !== rows) {
    console.error(`[${p.id}] grid row count mismatch`);
    errors++;
    continue;
  }
  let sum = 0;
  for (let r = 0; r < rows; r++) {
    const row = p.grid[r];
    if (!Array.isArray(row) || row.length !== cols) {
      console.error(`[${p.id}] grid col mismatch at row ${r}`);
      errors++;
      sum = NaN;
      break;
    }
    for (let c = 0; c < cols; c++) {
      const v = row[c];
      if (!Number.isInteger(v) || v < 0) {
        console.error(`[${p.id}] invalid cell ${r},${c}: ${v}`);
        errors++;
      }
      sum += v;
    }
  }
  if (sum !== p.correctAnswer) {
    console.error(`[${p.id}] correctAnswer ${p.correctAnswer} !== sum ${sum}`);
    errors++;
  }
}

if (errors) {
  console.error(`Validation failed: ${errors} issue(s)`);
  process.exit(1);
}
console.log(`OK: ${data.puzzles.length} puzzles validated.`);
