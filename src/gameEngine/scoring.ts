/**
 * Golf-style error for one round: absolute distance from the correct block count.
 * Cumulative `player.score` should sum these each round (lower total is better).
 */
export function golfRoundError(guess: number, correctAnswer: number): number {
  return Math.abs(guess - correctAnswer);
}
