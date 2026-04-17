import {
  arrayUnion,
  collection,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  query,
  runTransaction,
  setDoc,
  updateDoc,
  writeBatch,
  type Unsubscribe,
} from "firebase/firestore";
import {
  DEFAULT_ROOM_SETTINGS,
  getPuzzleById,
  getPuzzleDataset,
  golfRoundError,
  planRound,
} from "../gameEngine";
import { MAX_PLAYER_DISPLAY_NAME_LENGTH } from "../constants/player";
import { getDb } from "./config";
import type { FirestorePlayer, FirestoreRoom } from "./roomTypes";
import type { GameDifficulty, RoomSettings } from "../gameEngine/types";

const CODE_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

export function generatePlayerId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `p_${Math.random().toString(36).slice(2)}_${Date.now()}`;
}

export function generateRoomCode(): string {
  let s = "";
  for (let i = 0; i < 6; i++) {
    s += CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)];
  }
  return s;
}

function normalizeRoomSettings(input?: Partial<RoomSettings>): RoomSettings {
  const totalRoundsRaw = input?.totalRounds ?? DEFAULT_ROOM_SETTINGS.totalRounds;
  const totalRounds = [10, 20, 30].includes(totalRoundsRaw) ? totalRoundsRaw : 10;
  const gameDifficultyRaw = input?.gameDifficulty ?? DEFAULT_ROOM_SETTINGS.gameDifficulty;
  const gameDifficulty: GameDifficulty =
    gameDifficultyRaw === "easy" || gameDifficultyRaw === "medium" || gameDifficultyRaw === "hard"
      ? gameDifficultyRaw
      : DEFAULT_ROOM_SETTINGS.gameDifficulty;

  return {
    ...DEFAULT_ROOM_SETTINGS,
    ...input,
    totalRounds,
    gameDifficulty,
  };
}

function roomRef(code: string) {
  return doc(getDb(), "rooms", code);
}

function playersCol(code: string) {
  return collection(getDb(), "rooms", code, "players");
}

function playerRef(code: string, playerId: string) {
  return doc(getDb(), "rooms", code, "players", playerId);
}

export async function createRoom(
  hostId: string,
  settingsInput?: Partial<RoomSettings>
): Promise<string> {
  const settings = normalizeRoomSettings(settingsInput);
  for (let attempt = 0; attempt < 8; attempt++) {
    const code = generateRoomCode();
    const ref = roomRef(code);
    const snap = await getDoc(ref);
    if (snap.exists()) continue;
    const room: FirestoreRoom = {
      code,
      hostId,
      hostName: "",
      createdAt: Date.now(),
      gameState: "lobby",
      currentRound: 0,
      totalRounds: settings.totalRounds,
      currentPuzzleId: null,
      roundStartedAt: null,
      roundEndsAt: null,
      submissionsLocked: false,
      usedPuzzleIds: [],
      settings,
      currentRoundPlan: null,
      lastAnswer: null,
    };
    await setDoc(ref, room);
    return code;
  }
  throw new Error("Could not allocate a room code");
}

function normalizeDisplayName(raw: string): string {
  const t = raw.trim();
  if (!t) return "Player";
  return t.slice(0, MAX_PLAYER_DISPLAY_NAME_LENGTH);
}

export async function joinRoom(
  code: string,
  playerId: string,
  name: string
): Promise<void> {
  const normalized = code.trim().toUpperCase();
  const displayName = normalizeDisplayName(name);
  const ref = roomRef(normalized);
  const snap = await getDoc(ref);
  if (!snap.exists()) {
    throw new Error("Room not found");
  }
  const room = snap.data() as FirestoreRoom;
  if (room.hostId === playerId) {
    await setDoc(
      playerRef(normalized, playerId),
      {
        name: displayName,
        guess: 0,
        score: 0,
        lives: room.settings.startingLives,
        isReady: false,
        roundSubmitted: false,
      },
      { merge: true }
    );
    return;
  }
  await setDoc(playerRef(normalized, playerId), {
    name: displayName,
    guess: 0,
    score: 0,
    lives: room.settings.startingLives,
    isReady: false,
    roundSubmitted: false,
  });
}

export async function setPlayerReady(
  code: string,
  playerId: string,
  isReady: boolean
): Promise<void> {
  await updateDoc(playerRef(code, playerId), { isReady });
}

export async function updatePlayerDisplayName(
  code: string,
  playerId: string,
  rawName: string
): Promise<void> {
  const name = normalizeDisplayName(rawName);
  await updateDoc(playerRef(code, playerId), { name });
}

/** Writes final `guess` and `roundSubmitted` together (no per-tap Firestore writes). */
export async function submitRoundWithGuess(
  code: string,
  playerId: string,
  finalGuess: number
): Promise<void> {
  const ref = playerRef(code, playerId);
  const clamped = Math.max(0, Math.min(99, Math.round(finalGuess)));
  await runTransaction(getDb(), async (tx) => {
    const roomSnap = await tx.get(roomRef(code));
    if (!roomSnap.exists()) return;
    const room = roomSnap.data() as FirestoreRoom;
    if (room.gameState !== "playing") return;
    if (room.submissionsLocked) return;

    const pSnap = await tx.get(ref);
    if (!pSnap.exists()) return;
    const pl = pSnap.data() as FirestorePlayer;
    if (pl.roundSubmitted) return;
    tx.update(ref, { guess: clamped, roundSubmitted: true });
  });
}

export async function startGame(code: string, hostId: string): Promise<void> {
  const ref = roomRef(code);
  const snap = await getDoc(ref);
  if (!snap.exists()) throw new Error("Room missing");
  const room = snap.data() as FirestoreRoom;
  if (room.hostId !== hostId) throw new Error("Only the host can start");
  const playersSnap = await getDocs(playersCol(code));
  if (playersSnap.size < 1) throw new Error("Need at least one player");
  for (const d of playersSnap.docs) {
    if (d.id === room.hostId) continue;
    const pl = d.data() as FirestorePlayer;
    if (!pl.isReady) {
      throw new Error("All players must be ready before starting");
    }
  }

  const settings = normalizeRoomSettings(room.settings);
  const dataset = getPuzzleDataset();
  const planned = planRound(dataset, settings, 1, settings.totalRounds, []);
  if (!planned) throw new Error("No puzzles available");
  const { puzzle, plan } = planned;

  const now = Date.now();
  const batch = writeBatch(getDb());
  playersSnap.forEach((d) => {
    batch.update(d.ref, {
      guess: 0,
      score: 0,
      lives: room.settings.startingLives,
      isReady: false,
      roundSubmitted: false,
    });
  });
  batch.update(ref, {
    gameState: "playing",
    currentRound: 1,
    totalRounds: settings.totalRounds,
    currentPuzzleId: puzzle.id,
    roundStartedAt: now,
    roundEndsAt: null,
    submissionsLocked: false,
    usedPuzzleIds: arrayUnion(puzzle.id),
    settings,
    currentRoundPlan: plan,
    lastAnswer: puzzle.correctAnswer,
  });
  await batch.commit();
}

export async function lockRoundAndScore(
  code: string,
  hostId: string
): Promise<void> {
  const ref = roomRef(code);
  const snap = await getDoc(ref);
  if (!snap.exists()) return;
  const room = snap.data() as FirestoreRoom;
  if (room.hostId !== hostId) return;
  if (room.gameState !== "playing") return;
  if (room.submissionsLocked) return;
  const puzzleId = room.currentPuzzleId;
  if (!puzzleId) return;
  const puzzle = getPuzzleById(puzzleId);
  if (!puzzle) return;

  const playersSnap = await getDocs(playersCol(code));
  const batch = writeBatch(getDb());
  batch.update(ref, {
    submissionsLocked: true,
    gameState: "round_reveal",
    lastAnswer: puzzle.correctAnswer,
  });

  playersSnap.forEach((d) => {
    batch.update(d.ref, { isReady: false });
    if (d.id === room.hostId) return;
    const pl = d.data() as FirestorePlayer;
    const err = golfRoundError(pl.guess, puzzle.correctAnswer);
    batch.update(d.ref, {
      score: pl.score + err,
    });
  });
  await batch.commit();
}

export async function advanceFromReveal(code: string, hostId: string): Promise<void> {
  const ref = roomRef(code);
  const snap = await getDoc(ref);
  if (!snap.exists()) return;
  const room = snap.data() as FirestoreRoom;
  if (room.hostId !== hostId) return;
  if (room.gameState !== "round_reveal") return;

  const playersSnap = await getDocs(playersCol(code));
  const lastRound = room.currentRound >= room.totalRounds;

  if (lastRound) {
    await updateDoc(ref, {
      gameState: "results",
      submissionsLocked: true,
      currentPuzzleId: null,
      currentRoundPlan: null,
      roundStartedAt: null,
      roundEndsAt: null,
    });
    return;
  }

  const nextRound = room.currentRound + 1;
  const settings = normalizeRoomSettings(room.settings);
  const dataset = getPuzzleDataset();
  const planned = planRound(
    dataset,
    settings,
    nextRound,
    settings.totalRounds,
    room.usedPuzzleIds ?? []
  );
  if (!planned) {
    await updateDoc(ref, { gameState: "results", currentRoundPlan: null });
    return;
  }
  const { puzzle, plan } = planned;
  const now = Date.now();
  const batch = writeBatch(getDb());
  playersSnap.forEach((d) => {
    batch.update(d.ref, { guess: 0, roundSubmitted: false, isReady: false });
  });
  batch.update(ref, {
    gameState: "playing",
    currentRound: nextRound,
    totalRounds: settings.totalRounds,
    currentPuzzleId: puzzle.id,
    roundStartedAt: now,
    roundEndsAt: null,
    submissionsLocked: false,
    usedPuzzleIds: arrayUnion(puzzle.id),
    settings,
    currentRoundPlan: plan,
    lastAnswer: puzzle.correctAnswer,
  });
  await batch.commit();
}

export function subscribeRoom(
  code: string,
  onData: (room: FirestoreRoom | null) => void
): Unsubscribe {
  return onSnapshot(roomRef(code), (s) => {
    if (!s.exists()) {
      onData(null);
      return;
    }
    onData(s.data() as FirestoreRoom);
  });
}

export function subscribePlayers(
  code: string,
  onData: (players: { id: string; data: FirestorePlayer }[]) => void
): Unsubscribe {
  const q = query(playersCol(code));
  return onSnapshot(q, (snap) => {
    const list = snap.docs.map((d) => ({
      id: d.id,
      data: d.data() as FirestorePlayer,
    }));
    onData(list);
  });
}

export async function fetchRoom(code: string): Promise<FirestoreRoom | null> {
  const snap = await getDoc(roomRef(code));
  if (!snap.exists()) return null;
  return snap.data() as FirestoreRoom;
}
