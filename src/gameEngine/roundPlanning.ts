import type {
  Difficulty,
  GameDifficulty,
  PuzzleDataset,
  PuzzleDefinition,
  RoomSettings,
  RoundModifierType,
  RoundPlan,
} from "./types";
import { puzzlesForDifficulty } from "./selectPuzzle";

const DIFF_ORDER: Difficulty[] = ["easy", "medium", "hard"];

function diffIndex(d: Difficulty): number {
  return DIFF_ORDER.indexOf(d);
}

function fromIndex(i: number): Difficulty {
  return DIFF_ORDER[Math.max(0, Math.min(2, i))]!;
}

function progress01(roundIndex1Based: number, totalRounds: number): number {
  return totalRounds <= 1 ? 1 : (roundIndex1Based - 1) / (totalRounds - 1);
}

function pickRandom<T>(items: T[]): T | null {
  if (items.length === 0) return null;
  const i = Math.floor(Math.random() * items.length);
  return items[i]!;
}

type Candidate = {
  base: Difficulty;
  modifier: RoundModifierType;
};

function pickByWeight<T>(items: { item: T; weight: number }[]): T | null {
  const total = items.reduce((s, x) => s + Math.max(0, x.weight), 0);
  if (total <= 0) return null;
  let roll = Math.random() * total;
  for (const it of items) {
    roll -= Math.max(0, it.weight);
    if (roll <= 0) return it.item;
  }
  return items[items.length - 1]?.item ?? null;
}

function weightedTargetEffectiveDifficulty(
  gameDifficulty: GameDifficulty,
  t: number
): Difficulty {
  const table =
    gameDifficulty === "easy"
      ? t < 0.33
        ? [
            { item: "easy" as Difficulty, weight: 0.7 },
            { item: "medium" as Difficulty, weight: 0.3 },
          ]
        : t < 0.75
          ? [
              { item: "easy" as Difficulty, weight: 0.2 },
              { item: "medium" as Difficulty, weight: 0.7 },
              { item: "hard" as Difficulty, weight: 0.1 },
            ]
          : [
              { item: "medium" as Difficulty, weight: 0.58 },
              { item: "hard" as Difficulty, weight: 0.42 },
            ]
      : gameDifficulty === "medium"
        ? t < 0.25
          ? [
              { item: "easy" as Difficulty, weight: 0.2 },
              { item: "medium" as Difficulty, weight: 0.8 },
            ]
          : t < 0.65
            ? [
                { item: "medium" as Difficulty, weight: 0.7 },
                { item: "hard" as Difficulty, weight: 0.3 },
              ]
            : [
                { item: "medium" as Difficulty, weight: 0.35 },
                { item: "hard" as Difficulty, weight: 0.65 },
              ]
        : t < 0.2
          ? [
              { item: "medium" as Difficulty, weight: 0.7 },
              { item: "hard" as Difficulty, weight: 0.3 },
            ]
          : [
              { item: "hard" as Difficulty, weight: 0.85 },
              { item: "medium" as Difficulty, weight: 0.15 },
            ];
  return pickByWeight(table) ?? "medium";
}

function candidateProfiles(
  target: Difficulty,
  gameDifficulty: GameDifficulty,
  t: number
): Candidate[] {
  if (target === "easy") {
    return [{ base: "easy", modifier: "none" }];
  }
  if (target === "medium") {
    if (gameDifficulty === "easy") {
      return t < 0.65
        ? [{ base: "medium", modifier: "none" }]
        : [
            { base: "medium", modifier: "none" },
            { base: "easy", modifier: "translate" },
          ];
    }
    if (gameDifficulty === "medium") {
      return t < 0.35
        ? [
            { base: "medium", modifier: "none" },
            { base: "easy", modifier: "translate" },
          ]
        : t < 0.72
          ? [
              { base: "easy", modifier: "translate" },
              { base: "medium", modifier: "none" },
              { base: "medium", modifier: "translate" },
            ]
          : [
              { base: "easy", modifier: "rotate" },
              { base: "medium", modifier: "translate" },
              { base: "medium", modifier: "none" },
            ];
    }
    return [
      { base: "medium", modifier: "none" },
      { base: "easy", modifier: "rotate" },
    ];
  }
  // target hard
  if (gameDifficulty === "easy") {
    return [
      { base: "medium", modifier: "translate" },
      { base: "medium", modifier: "rotate" },
      { base: "hard", modifier: "none" },
    ];
  }
  if (gameDifficulty === "medium") {
    return t < 0.75
      ? [
          { base: "medium", modifier: "translate" },
          { base: "medium", modifier: "rotate" },
          { base: "hard", modifier: "none" },
        ]
      : [
          { base: "medium", modifier: "rotate" },
          { base: "hard", modifier: "none" },
          { base: "hard", modifier: "translate" },
        ];
  }
  return [
    { base: "hard", modifier: "none" },
    { base: "medium", modifier: "rotate" },
    { base: "hard", modifier: "translate" },
  ];
}

function minAnswerForEffectiveDifficulty(
  effective: Difficulty,
  gameDifficulty: GameDifficulty
): number {
  if (effective === "easy") return gameDifficulty === "easy" ? 4 : 3;
  if (effective === "medium") return gameDifficulty === "easy" ? 6 : 6;
  return gameDifficulty === "hard" ? 12 : 11;
}

function pickPuzzle(
  dataset: PuzzleDataset,
  base: Difficulty,
  usedIds: string[],
  minAnswer: number
): PuzzleDefinition | null {
  const pool = puzzlesForDifficulty(dataset, base);
  for (let threshold = minAnswer; threshold >= 0; threshold--) {
    const eligible = pool.filter((p) => p.correctAnswer >= threshold);
    if (eligible.length === 0) continue;
    const fresh = eligible.filter((p) => !usedIds.includes(p.id));
    const chosen = pickRandom(fresh);
    if (chosen) return chosen;
    const fallback = pickRandom(eligible);
    if (fallback) return fallback;
  }
  return null;
}

function computePeekMs(
  effective: Difficulty,
  gameDifficulty: GameDifficulty,
  roundIndex1Based: number,
  totalRounds: number
): number {
  const t = totalRounds <= 1 ? 1 : (roundIndex1Based - 1) / (totalRounds - 1);
  const startEnd =
    effective === "easy"
      ? [3000, 2500]
      : effective === "medium"
        ? [3500, 2600]
        : [3000, 1800];
  const base = startEnd[0] + (startEnd[1] - startEnd[0]) * t;
  const adj = gameDifficulty === "easy" ? 220 : gameDifficulty === "hard" ? -150 : 0;
  return Math.round(Math.max(1600, Math.min(4200, base + adj)));
}

function computeModifierDurationMs(
  modifier: RoundModifierType,
  gameDifficulty: GameDifficulty,
  roundIndex1Based: number,
  totalRounds: number
): number {
  if (modifier === "none") return 0;
  const t = totalRounds <= 1 ? 1 : (roundIndex1Based - 1) / (totalRounds - 1);
  const intensityAdjust = gameDifficulty === "easy" ? -0.2 : gameDifficulty === "hard" ? 0.2 : 0;
  const intensity = Math.max(0, Math.min(1, t + intensityAdjust));
  if (modifier === "translate") {
    return Math.round(7000 - 3500 * intensity); // slow to faster
  }
  return Math.round(5200 - 2600 * intensity); // rotate
}

export function planRound(
  dataset: PuzzleDataset,
  settings: RoomSettings,
  roundIndex1Based: number,
  totalRounds: number,
  usedIds: string[]
): { puzzle: PuzzleDefinition; plan: RoundPlan } | null {
  const t = progress01(roundIndex1Based, totalRounds);
  const target = weightedTargetEffectiveDifficulty(settings.gameDifficulty, t);
  const candidates = candidateProfiles(target, settings.gameDifficulty, t);

  let selected:
    | {
        candidate: Candidate;
        puzzle: PuzzleDefinition;
        effective: Difficulty;
      }
    | null = null;

  for (const candidate of candidates) {
    const effective = fromIndex(
      diffIndex(candidate.base) + (candidate.modifier === "none" ? 0 : 1)
    );
    const minAnswer = minAnswerForEffectiveDifficulty(effective, settings.gameDifficulty);
    const puzzle = pickPuzzle(dataset, candidate.base, usedIds, minAnswer);
    if (!puzzle) continue;
    selected = { candidate, puzzle, effective };
    break;
  }
  if (!selected) return null;

  const { candidate, puzzle, effective } = selected;
  const plan: RoundPlan = {
    baseDifficulty: candidate.base,
    effectiveDifficulty: effective,
    peekMs: computePeekMs(effective, settings.gameDifficulty, roundIndex1Based, totalRounds),
    modifier: candidate.modifier,
    modifierDurationMs: computeModifierDurationMs(
      candidate.modifier,
      settings.gameDifficulty,
      roundIndex1Based,
      totalRounds
    ),
  };

  if (candidate.modifier === "translate") {
    plan.translateAxis = Math.random() < 0.5 ? "row" : "col";
    plan.translateDirection = Math.random() < 0.5 ? -1 : 1;
  }
  if (candidate.modifier === "rotate") {
    plan.rotateDirection = Math.random() < 0.5 ? -1 : 1;
  }

  return { puzzle, plan };
}
