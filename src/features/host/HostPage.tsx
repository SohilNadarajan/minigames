import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { GameCanvas } from "../../components/GameCanvas";
import {
  advanceFromReveal,
  lockRoundAndScore,
  startGame,
  subscribePlayers,
  subscribeRoom,
} from "../../firebase/roomService";
import type { FirestorePlayer, FirestoreRoom } from "../../firebase/roomTypes";
import { getPuzzleById } from "../../gameEngine";
import { useLocalPlayerId } from "../../hooks/useLocalPlayerId";
import { playDingSfx } from "../../utils/sfx";

function countBlocksForPuzzleId(id: string): number {
  const p = getPuzzleById(id);
  if (!p) return 0;
  let n = 0;
  for (const row of p.grid) for (const c of row) n += Math.max(0, Math.floor(c));
  return n;
}

const PRE_LOCK_MS = 2000;
const REVEAL_STEP_MS = 320;
const POST_SUBMIT_HIDE_MS = 3000;
const READY_COUNTDOWN_S = 5;

type HostRevealStage = "guesses" | "reveal" | "awaiting_ready";

export function HostPage() {
  const { code = "" } = useParams();
  const roomCode = code.toUpperCase();
  const playerId = useLocalPlayerId();
  const [room, setRoom] = useState<FirestoreRoom | null | undefined>(undefined);
  const [players, setPlayers] = useState<{ id: string; data: FirestorePlayer }[]>(
    []
  );
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [revealFilled, setRevealFilled] = useState(0);
  const [revealTally, setRevealTally] = useState(0);
  const [hostRevealStage, setHostRevealStage] = useState<HostRevealStage>("guesses");
  const [animNowMs, setAnimNowMs] = useState(Date.now());
  const [readyCountdownS, setReadyCountdownS] = useState<number | null>(null);
  const [puzzlePeekVisible, setPuzzlePeekVisible] = useState(true);
  const lockedOnceRef = useRef(false);
  const revealAnimStartedForKeyRef = useRef<string | null>(null);
  const roomRef = useRef<FirestoreRoom | null>(null);
  const playersRef = useRef(players);
  const delayStartRef = useRef<number | null>(null);
  const advancingFromReadyRef = useRef(false);

  roomRef.current = room ?? null;
  playersRef.current = players;

  useEffect(() => {
    if (!roomCode) return;
    const unsubRoom = subscribeRoom(roomCode, setRoom);
    const unsubPlayers = subscribePlayers(roomCode, setPlayers);
    return () => {
      unsubRoom();
      unsubPlayers();
    };
  }, [roomCode]);

  useEffect(() => {
    const r = roomRef.current;
    if (r?.gameState === "playing" && !r.submissionsLocked) {
      lockedOnceRef.current = false;
      advancingFromReadyRef.current = false;
    }
  }, [room?.currentRound, room?.submissionsLocked, room?.gameState]);

  useEffect(() => {
    const id = window.setInterval(() => {
      const r = roomRef.current;
      if (!r || playerId !== r.hostId) {
        delayStartRef.current = null;
        return;
      }
      if (r.gameState !== "playing" || r.submissionsLocked) {
        delayStartRef.current = null;
        return;
      }
      const joiners = playersRef.current.filter((p) => p.id !== r.hostId);
      if (joiners.length === 0) {
        delayStartRef.current = null;
        return;
      }
      const allSubmitted = joiners.every((p) => p.data.roundSubmitted === true);
      if (!allSubmitted) {
        delayStartRef.current = null;
        return;
      }
      if (lockedOnceRef.current) return;
      if (delayStartRef.current == null) delayStartRef.current = Date.now();
      if (Date.now() - delayStartRef.current < PRE_LOCK_MS) return;
      delayStartRef.current = null;
      lockedOnceRef.current = true;
      void lockRoundAndScore(roomCode, playerId).catch((e) => {
        lockedOnceRef.current = false;
        setError(e instanceof Error ? e.message : "Lock failed");
      });
    }, 200);
    return () => window.clearInterval(id);
  }, [roomCode, playerId]);

  useEffect(() => {
    if (room?.gameState !== "playing" || !room.currentPuzzleId) return;
    const peekMs = room.currentRoundPlan?.peekMs ?? 3000;
    setPuzzlePeekVisible(true);
    const tid = window.setTimeout(() => setPuzzlePeekVisible(false), peekMs);
    return () => window.clearTimeout(tid);
  }, [room?.gameState, room?.currentRound, room?.currentPuzzleId, room?.currentRoundPlan?.peekMs]);

  useEffect(() => {
    if (room?.gameState !== "playing" || !puzzlePeekVisible) return;
    const id = window.setInterval(() => setAnimNowMs(Date.now()), 33);
    return () => window.clearInterval(id);
  }, [room?.gameState, puzzlePeekVisible]);

  const revealKey =
    room?.gameState === "round_reveal" && room.currentPuzzleId
      ? `${room.currentRound}|${room.currentPuzzleId}`
      : null;

  useEffect(() => {
    if (!revealKey) {
      revealAnimStartedForKeyRef.current = null;
      return;
    }
    revealAnimStartedForKeyRef.current = null;
    setHostRevealStage("guesses");
    setRevealFilled(0);
    setRevealTally(0);
    setReadyCountdownS(null);
    const tid = window.setTimeout(() => setHostRevealStage("reveal"), POST_SUBMIT_HIDE_MS);
    return () => window.clearTimeout(tid);
  }, [revealKey]);

  useEffect(() => {
    if (!revealKey || hostRevealStage !== "reveal") return;
    if (playerId !== roomRef.current?.hostId) return;
    if (revealAnimStartedForKeyRef.current === revealKey) return;
    revealAnimStartedForKeyRef.current = revealKey;

    const puzzleId = revealKey.split("|")[1] ?? "";
    const total = countBlocksForPuzzleId(puzzleId);
    setRevealFilled(0);
    setRevealTally(0);

    const goAwaitReadyOrFinish = () => {
      const r = roomRef.current;
      const hasNext = r != null && r.currentRound < r.totalRounds;
      if (hasNext) {
        setHostRevealStage("awaiting_ready");
      } else {
        void advanceFromReveal(roomCode, playerId).catch((e) =>
          setError(e instanceof Error ? e.message : "Advance failed")
        );
      }
    };

    if (total <= 0) {
      const r = roomRef.current;
      const hasNext = r != null && r.currentRound < r.totalRounds;
      const tid = window.setTimeout(() => {
        if (hasNext) {
          setHostRevealStage("awaiting_ready");
        } else {
          void advanceFromReveal(roomCode, playerId).catch((e) =>
            setError(e instanceof Error ? e.message : "Advance failed")
          );
        }
      }, 200);
      return () => {
        window.clearTimeout(tid);
        revealAnimStartedForKeyRef.current = null;
      };
    }

    let i = 0;
    let doneTimeout = 0;
    const step = window.setInterval(() => {
      i += 1;
      setRevealFilled(i);
      setRevealTally(i);
      playDingSfx();
      if (i >= total) {
        window.clearInterval(step);
        doneTimeout = window.setTimeout(goAwaitReadyOrFinish, 850);
      }
    }, REVEAL_STEP_MS);

    return () => {
      window.clearInterval(step);
      window.clearTimeout(doneTimeout);
      revealAnimStartedForKeyRef.current = null;
    };
  }, [revealKey, hostRevealStage, roomCode, playerId]);

  useEffect(() => {
    if (hostRevealStage !== "awaiting_ready") return;
    if (room?.gameState !== "round_reveal") return;
    if (playerId !== roomRef.current?.hostId) return;
    const r = roomRef.current;
    const joiners = playersRef.current.filter((p) => p.id !== r?.hostId);
    if (joiners.length < 1) {
      setReadyCountdownS(null);
      return;
    }
    const allReady = joiners.every((p) => p.data.isReady);
    if (!allReady) {
      setReadyCountdownS(null);
      return;
    }
    setReadyCountdownS((s) => (s == null ? READY_COUNTDOWN_S : s));
  }, [hostRevealStage, room?.gameState, players, roomCode, playerId]);

  useEffect(() => {
    if (hostRevealStage !== "awaiting_ready") return;
    if (readyCountdownS == null) return;
    if (readyCountdownS > 0) {
      const tid = window.setTimeout(() => setReadyCountdownS((s) => (s == null ? null : s - 1)), 1000);
      return () => window.clearTimeout(tid);
    }
    if (advancingFromReadyRef.current) return;
    advancingFromReadyRef.current = true;
    void advanceFromReveal(roomCode, playerId).catch((e) =>
      setError(e instanceof Error ? e.message : "Advance failed")
    );
  }, [hostRevealStage, readyCountdownS, roomCode, playerId]);

  const puzzle = useMemo(() => {
    const id = room?.currentPuzzleId;
    if (!id) return null;
    return getPuzzleById(id) ?? null;
  }, [room?.currentPuzzleId]);

  const isHost = room && playerId === room.hostId;

  const onStart = async () => {
    if (!room) return;
    setBusy(true);
    setError(null);
    try {
      await startGame(roomCode, playerId);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not start");
    } finally {
      setBusy(false);
    }
  };

  if (room === undefined) {
    return (
      <div className="flex min-h-full items-center justify-center text-slate-500">
        Connecting…
      </div>
    );
  }

  if (room === null) {
    return (
      <div className="mx-auto max-w-lg px-4 py-10 text-center text-slate-800">
        <p className="text-xl font-bold">Room not found</p>
        <Link className="mt-4 inline-block text-blue-600 underline" to="/">
          Back home
        </Link>
      </div>
    );
  }

  if (!isHost) {
    return (
      <div className="mx-auto max-w-lg px-4 py-10 text-center text-slate-800">
        <p className="text-xl font-bold">This browser is not the host</p>
        <p className="mt-2 text-slate-600">
          Open the host link on the device that created the room, or create a new room.
        </p>
        <Link className="mt-4 inline-block text-blue-600 underline" to="/">
          Back home
        </Link>
      </div>
    );
  }

  const joiners = players.filter((p) => p.id !== room.hostId);
  const joinersByGolf = joiners.slice().sort((a, b) => a.data.score - b.data.score);
  const joinersByName = joiners.slice().sort((a, b) => a.data.name.localeCompare(b.data.name));
  const submittedCount = joiners.filter((p) => p.data.roundSubmitted === true).length;
  const allPlayersReady =
    joiners.length >= 1 && joiners.every((p) => p.data.isReady === true);

  const roundRevealCubeTotal =
    room.gameState === "round_reveal" && puzzle != null ? countBlocksForPuzzleId(puzzle.id) : 0;
  const revealCountFinished =
    room.gameState === "round_reveal" &&
    (hostRevealStage === "awaiting_ready" ||
      (hostRevealStage === "reveal" &&
        (roundRevealCubeTotal === 0 || revealFilled >= roundRevealCubeTotal)));

  const joinersReadyForNext = joiners.filter((p) => p.data.isReady).length;

  const motion = (() => {
    const plan = room.currentRoundPlan;
    if (room.gameState !== "playing" || !puzzlePeekVisible || !plan || !room.roundStartedAt) {
      return { offsetX: 0, offsetY: 0, rotationRad: 0 };
    }
    const elapsed = Math.max(0, animNowMs - room.roundStartedAt);
    const dur =
      plan.modifier === "translate"
        ? Math.max(1, plan.peekMs || 3000)
        : Math.max(1, plan.modifierDurationMs || plan.peekMs || 3000);
    const t = Math.min(1, elapsed / dur);
    if (plan.modifier === "rotate") {
      const dir = plan.rotateDirection ?? 1;
      return { offsetX: 0, offsetY: 0, rotationRad: Math.PI * 2 * t * dir };
    }
    if (plan.modifier === "translate") {
      const dir = plan.translateDirection ?? 1;
      const axis = plan.translateAxis ?? "col";
      const unit = axis === "col" ? { x: 0.8944, y: 0.4472 } : { x: -0.8944, y: 0.4472 };
      const travel = 420;
      const d = -travel + travel * 2 * t;
      return {
        offsetX: unit.x * d * dir,
        offsetY: unit.y * d * dir,
        rotationRad: 0,
      };
    }
    return { offsetX: 0, offsetY: 0, rotationRad: 0 };
  })();

  return (
    <div className="mx-auto flex min-h-[100dvh] max-w-6xl flex-col gap-4 px-3 py-4">
      {room.gameState !== "lobby" ? (
        <Link
          to="/"
          className="fixed right-4 top-4 z-30 rounded-xl border border-slate-300 bg-white/95 px-4 py-2 text-sm font-semibold text-slate-800 shadow-sm backdrop-blur"
        >
          Home
        </Link>
      ) : null}
      {room.gameState === "lobby" ? (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-xs font-semibold tracking-wide text-slate-500">ROOM</p>
            <p className="font-mono text-4xl font-black tracking-widest text-slate-900">
              {room.code}
            </p>
            <p className="mt-1 text-sm text-slate-600">
              Controllers join at{" "}
              <span className="font-semibold text-slate-900">/play/{room.code}</span>
            </p>
            <p className="mt-1 text-xs text-slate-500">
              {room.settings.totalRounds} rounds · {room.settings.gameDifficulty} game
            </p>
          </div>
          <Link
            to="/"
            className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-800 shadow-sm"
          >
            Home
          </Link>
        </div>
      ) : null}

      {error ? (
        <div className="rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-amber-950">
          {error}
        </div>
      ) : null}

      {room.gameState === "lobby" ? (
        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="text-2xl font-extrabold text-slate-900">Lobby</h2>
          <p className="mt-2 text-slate-600">
            Players joined: <span className="font-bold text-slate-900">{joiners.length}</span>
          </p>
          <ul className="mt-4 space-y-2 text-slate-800">
            {joiners.map((p) => (
              <li key={p.id} className="flex items-center justify-between gap-3">
                <span className="font-semibold">{p.data.name}</span>
                <span
                  className={`text-sm font-semibold ${
                    p.data.isReady ? "text-emerald-700" : "text-red-600"
                  }`}
                >
                  {p.data.isReady ? "Ready" : "Not ready"}
                </span>
              </li>
            ))}
            {joiners.length === 0 ? (
              <li className="text-slate-500">Waiting for phones to join…</li>
            ) : null}
          </ul>
          <button
            type="button"
            disabled={busy || !allPlayersReady}
            onClick={onStart}
            className="mt-6 w-full rounded-2xl bg-blue-600 py-4 text-xl font-black text-white shadow disabled:opacity-40"
          >
            Start game
          </button>
          <p className="mt-3 text-center text-xs text-slate-500">
            Everyone must tap <span className="font-semibold text-slate-700">Ready</span> on their
            phone before you can start. Host screen is display-only.
          </p>
        </section>
      ) : null}

      {room.gameState === "playing" && puzzle ? (
        <section className="flex flex-1 flex-col gap-3">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <p className="text-xs font-bold tracking-wide text-slate-500">ROUND</p>
              <p className="text-4xl font-black text-slate-900">
                {room.currentRound}/{room.totalRounds}
              </p>
            </div>
            <div className="text-right">
              <p className="text-xs font-bold tracking-wide text-slate-500">SUBMITTED</p>
              <p className="text-2xl font-black text-slate-900">
                {submittedCount}/{joiners.length || 0}
              </p>
            </div>
          </div>
          <div
            className={`flex flex-col gap-2 ${
              puzzlePeekVisible ? "min-h-[40vh] flex-1" : "min-h-[240px]"
            }`}
          >
            {puzzlePeekVisible ? (
              <>
              <p className="text-center text-sm font-semibold text-slate-800">
                Try to count the boxes.
              </p>
              <p className="text-center text-xs text-slate-500">
                Showing for {Math.round((room.currentRoundPlan?.peekMs ?? 3000) / 100) / 10}s ·{" "}
                {room.currentRoundPlan?.effectiveDifficulty ?? puzzle.difficulty} challenge
                {room.currentRoundPlan?.modifier !== "none"
                  ? ` · ${room.currentRoundPlan?.modifier}`
                  : ""}
              </p>
              </>
            ) : (
              <p className="text-center text-sm font-semibold text-slate-700">
                Puzzle hidden
              </p>
            )}
            <div className={`min-h-[240px] ${puzzlePeekVisible ? "flex-1" : ""}`}>
              {puzzlePeekVisible ? (
                <GameCanvas
                  puzzle={puzzle}
                  phase="playing"
                  revealFilledCount={0}
                  displayTally={0}
                  offsetX={motion.offsetX}
                  offsetY={motion.offsetY}
                  rotationRad={motion.rotationRad}
                />
              ) : (
                <div className="flex h-full min-h-[240px] items-center justify-center rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-5 py-6 text-center text-slate-600">
                  <p className="mx-auto max-w-md text-sm">
                    Players can still adjust and submit from their phones. The answer reveals after
                    everyone has submitted.
                  </p>
                </div>
              )}
            </div>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <p className="text-sm font-bold text-slate-700">Player status</p>
            <p className="mt-1 text-xs text-slate-500">
              Ranking by total error (golf): lower is better. After the last submit, the host waits{" "}
              {PRE_LOCK_MS / 1000}s, then reveals.
            </p>
            <div className="mt-2 grid grid-cols-[2.5rem_1fr_5rem_6.5rem] gap-2 text-xs font-bold text-slate-500">
              <span>#</span>
              <span>Name</span>
              <span className="text-right">Err</span>
              <span className="text-right">Status</span>
            </div>
            <ul className="mt-1 space-y-2">
              {joinersByGolf.map((p, idx) => (
                <li
                  key={p.id}
                  className="grid grid-cols-[2.5rem_1fr_5rem_6.5rem] items-center gap-2 rounded-xl border border-slate-100 bg-slate-50 px-3 py-2"
                >
                  <span className="font-black text-slate-400">{idx + 1}</span>
                  <span className="truncate font-semibold text-slate-900">{p.data.name}</span>
                  <span className="text-right font-mono text-sm text-slate-800">{p.data.score}</span>
                  <span
                    className={`text-right text-sm font-bold ${
                      p.data.roundSubmitted ? "text-emerald-700" : "text-red-600"
                    }`}
                  >
                    {p.data.roundSubmitted ? "Submitted" : "Thinking…"}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </section>
      ) : null}

      {room.gameState === "round_reveal" && puzzle ? (
        <section className="flex flex-col gap-3">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <p className="text-xs font-bold tracking-wide text-slate-500">REVEAL</p>
              {hostRevealStage === "guesses" ? (
                <>
                  <p className="text-2xl font-black text-slate-900">Everyone&apos;s guess</p>
                  <p className="mt-1 text-sm text-slate-600">Revealing in a few seconds…</p>
                </>
              ) : hostRevealStage === "awaiting_ready" ? (
                <>
                  <p className="text-2xl font-black text-slate-900">Ready for next round</p>
                  <p className="mt-1 text-sm text-slate-600">
                    Waiting for players ·{" "}
                    <span className="font-bold text-slate-900">
                      {joinersReadyForNext}/{joiners.length}
                    </span>
                  </p>
                </>
              ) : (
                <>
                  <p className="text-2xl font-black text-slate-900">Count the blocks</p>
                  <p className="mt-1 text-sm text-slate-600">Watch the tally as cubes reveal.</p>
                </>
              )}
            </div>
          </div>
          <div className="flex flex-col gap-3">
            <div className="h-[38vh] min-h-[240px] max-h-[420px]">
              {hostRevealStage === "guesses" ? (
                <div className="flex h-full min-h-[280px] items-center justify-center rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-6 text-center text-slate-600">
                  <p className="text-sm">
                    Submitted counts are visible below. Puzzle reveal starts shortly.
                  </p>
                </div>
              ) : (
                <div className="relative h-full">
                  <GameCanvas
                    puzzle={puzzle}
                    phase="round_reveal"
                    revealFilledCount={
                      hostRevealStage === "awaiting_ready"
                        ? countBlocksForPuzzleId(puzzle.id)
                        : revealFilled
                    }
                    displayTally={
                      hostRevealStage === "awaiting_ready"
                        ? countBlocksForPuzzleId(puzzle.id)
                        : revealTally
                    }
                  />
                  {hostRevealStage === "awaiting_ready" && readyCountdownS != null ? (
                    <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
                      <div className="rounded-3xl border border-slate-200 bg-white/95 px-8 py-6 text-center shadow-lg">
                        <p className="text-sm font-bold tracking-wide text-slate-500">
                          NEXT ROUND
                        </p>
                        <p className="mt-1 text-6xl font-black tabular-nums text-slate-900">
                          {readyCountdownS}s
                        </p>
                      </div>
                    </div>
                  ) : null}
                </div>
              )}
            </div>
            {joiners.length > 0 ? (
              <div className="w-full">
                <p className="mb-3 text-center text-xs font-bold uppercase tracking-wide text-slate-500">
                  Submitted counts
                </p>
                <div className="mx-auto flex w-full max-w-5xl flex-wrap justify-center gap-3 px-1">
                  {joinersByName.map((p) => {
                    const answer = room.lastAnswer;
                    const isCorrect =
                      answer != null && p.data.guess === answer;
                    const guessColorClass =
                      hostRevealStage !== "guesses" && revealCountFinished
                        ? isCorrect
                          ? "text-emerald-600"
                          : "text-red-600"
                        : "text-slate-900";
                    return (
                    <div
                      key={p.id}
                      className="w-[calc(50%-0.375rem)] min-w-[7.5rem] max-w-[11rem] shrink-0 rounded-2xl border border-slate-200 bg-white px-3 py-3 text-center shadow-sm sm:w-36 md:w-40"
                    >
                      <p className="truncate text-sm font-semibold text-slate-800">{p.data.name}</p>
                      <p
                        className={`mt-2 text-3xl font-black tabular-nums ${guessColorClass}`}
                      >
                        {p.data.guess}
                      </p>
                      {hostRevealStage === "awaiting_ready" ? (
                        <p
                          className={`mt-1 text-xs font-bold ${
                            p.data.isReady ? "text-emerald-700" : "text-slate-500"
                          }`}
                        >
                          {p.data.isReady ? "Ready" : "Waiting…"}
                        </p>
                      ) : null}
                    </div>
                    );
                  })}
                </div>
              </div>
            ) : null}
          </div>
        </section>
      ) : null}

      {room.gameState === "results" ? (
        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="text-3xl font-black text-slate-900">Final standings</h2>
          <p className="mt-2 text-sm text-slate-600">
            Total error across rounds (golf): <span className="font-semibold">lower is better</span>.
          </p>
          <ol className="mt-5 space-y-3">
            {joiners
              .slice()
              .sort((a, b) => a.data.score - b.data.score)
              .map((p, idx) => (
                <li
                  key={p.id}
                  className="flex items-center justify-between rounded-xl border border-slate-100 bg-slate-50 px-4 py-3"
                >
                  <div className="flex items-center gap-3">
                    <span className="w-8 text-center text-2xl font-black text-slate-400">
                      {idx + 1}
                    </span>
                    <div>
                      <p className="text-lg font-bold text-slate-900">{p.data.name}</p>
                    </div>
                  </div>
                  <p className="text-3xl font-black text-slate-900">{p.data.score}</p>
                </li>
              ))}
          </ol>
          <Link
            to="/"
            className="mt-6 block w-full rounded-2xl border border-slate-300 bg-slate-900 py-4 text-center text-lg font-black text-white"
          >
            Done
          </Link>
        </section>
      ) : null}
    </div>
  );
}
