import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { MAX_PLAYER_DISPLAY_NAME_LENGTH } from "../../constants/player";
import {
  joinRoom,
  setPlayerReady,
  submitRoundWithGuess,
  subscribePlayers,
  subscribeRoom,
  updatePlayerDisplayName,
} from "../../firebase/roomService";
import type { FirestorePlayer, FirestoreRoom } from "../../firebase/roomTypes";
import { golfRoundError } from "../../gameEngine";
import { useLocalPlayerId } from "../../hooks/useLocalPlayerId";
import { playClickSfx } from "../../utils/sfx";

export function ControllerPage() {
  const { code = "" } = useParams();
  const roomCode = code.toUpperCase();
  const playerId = useLocalPlayerId();
  const [room, setRoom] = useState<FirestoreRoom | null | undefined>(undefined);
  const [players, setPlayers] = useState<{ id: string; data: FirestorePlayer }[]>([]);
  const [hasPlayersSnap, setHasPlayersSnap] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [localGuess, setLocalGuess] = useState(0);
  const [nameDraft, setNameDraft] = useState("");
  const [nameSaving, setNameSaving] = useState(false);

  useEffect(() => {
    if (!roomCode) return;
    setHasPlayersSnap(false);
    const unsubRoom = subscribeRoom(roomCode, setRoom);
    const unsubPlayers = subscribePlayers(roomCode, (list) => {
      setPlayers(list);
      setHasPlayersSnap(true);
    });
    return () => {
      unsubRoom();
      unsubPlayers();
    };
  }, [roomCode]);

  const me = useMemo(
    () => players.find((p) => p.id === playerId)?.data,
    [players, playerId]
  );
  const meRef = useRef(me);
  meRef.current = me;

  const playingRoundSyncKey =
    room?.gameState === "playing" && room.currentPuzzleId != null
      ? `${room.currentRound}|${room.currentPuzzleId}|${me?.roundSubmitted === true ? "s" : "o"}`
      : "";

  useEffect(() => {
    if (!room || room === null) return;
    if (me) return;
    if (playerId === room.hostId) return;
    let cancelled = false;
    void (async () => {
      try {
        await joinRoom(roomCode, playerId, "Player");
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : "Rejoin failed");
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [room, me, roomCode, playerId]);

  useEffect(() => {
    if (!me) return;
    setNameDraft(me.name);
  }, [me?.name]);

  useEffect(() => {
    if (!playingRoundSyncKey) return;
    const m = meRef.current;
    if (!m || m.roundSubmitted) return;
    setLocalGuess(m.guess ?? 0);
  }, [playingRoundSyncKey]);

  const waitingForData =
    room === undefined || (room !== null && !hasPlayersSnap);

  if (waitingForData) {
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

  if (playerId === room.hostId) {
    return (
      <div className="mx-auto max-w-lg px-4 py-10 text-center text-slate-800">
        <p className="text-xl font-bold">You are the host</p>
        <p className="mt-2 text-slate-600">Open the host screen on the shared display.</p>
        <Link className="mt-4 inline-block text-blue-600 underline" to={`/host/${roomCode}`}>
          Go to host screen
        </Link>
      </div>
    );
  }

  if (!me) {
    return (
      <div className="mx-auto flex max-w-lg flex-col items-center px-4 py-16 text-center text-slate-800">
        <p className="text-lg font-semibold text-slate-700">Loading your controller…</p>
        <p className="mt-2 text-sm text-slate-500">
          If this does not clear in a few seconds, go back and join with your name and room code
          from the home screen.
        </p>
        <Link className="mt-6 inline-block text-blue-600 underline" to="/">
          Back home
        </Link>
        {error ? <p className="mt-4 text-amber-800">{error}</p> : null}
      </div>
    );
  }

  const submitted = me.roundSubmitted === true;
  const inputLocked =
    room.gameState !== "playing" || room.submissionsLocked || submitted;

  const displayGuess = room.gameState === "playing" && !submitted ? localGuess : me.guess;

  const onDelta = (delta: 1 | -1) => {
    if (inputLocked) return;
    playClickSfx();
    setLocalGuess((g) => Math.max(0, Math.min(99, g + delta)));
  };

  const onSubmitRound = async () => {
    if (room.gameState !== "playing" || room.submissionsLocked || submitted) return;
    setError(null);
    try {
      await submitRoundWithGuess(roomCode, playerId, localGuess);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Submit failed");
    }
  };

  const toggleReady = async () => {
    try {
      await setPlayerReady(roomCode, playerId, !me.isReady);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not update ready");
    }
  };

  const onSaveName = async () => {
    setNameSaving(true);
    setError(null);
    try {
      await updatePlayerDisplayName(roomCode, playerId, nameDraft);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save name");
    } finally {
      setNameSaving(false);
    }
  };

  const inLobby = room.gameState === "lobby";

  return (
    <div className="mx-auto flex min-h-full max-w-md flex-col px-3 py-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-xs font-bold text-slate-500">ROOM</p>
          <p className="font-mono text-2xl font-black tracking-widest text-slate-900">{room.code}</p>
        </div>
        <Link className="text-sm font-semibold text-blue-600 underline" to="/">
          Exit
        </Link>
      </div>

      {inLobby ? (
        <details className="mt-3 rounded-xl border border-slate-200 bg-white shadow-sm">
          <summary className="cursor-pointer select-none px-4 py-3 text-sm font-semibold text-slate-800">
            Display name
          </summary>
          <div className="flex flex-col gap-2 border-t border-slate-100 px-4 py-3">
            <input
              value={nameDraft}
              onChange={(e) => setNameDraft(e.target.value)}
              maxLength={MAX_PLAYER_DISPLAY_NAME_LENGTH}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-slate-900"
              placeholder="Your name"
            />
            <p className="text-xs text-slate-500">
              {nameDraft.length}/{MAX_PLAYER_DISPLAY_NAME_LENGTH} characters
            </p>
            <button
              type="button"
              disabled={nameSaving}
              onClick={onSaveName}
              className="rounded-lg bg-slate-800 py-2 text-sm font-bold text-white disabled:opacity-50"
            >
              {nameSaving ? "Saving…" : "Save name"}
            </button>
          </div>
        </details>
      ) : null}

      {error ? (
        <div className="mt-3 rounded-xl border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-950">
          {error}
        </div>
      ) : null}

      {room.gameState === "lobby" ? (
        <section className="mt-6 flex flex-1 flex-col gap-4">
          <div className="rounded-2xl border border-slate-200 bg-white p-5 text-center shadow-sm">
            <p className="text-lg font-bold text-slate-900">Hi, {me.name}</p>
            <p className="mt-2 text-sm text-slate-600">Get ready on the host screen.</p>
          </div>
          <button
            type="button"
            onClick={toggleReady}
            className={`rounded-2xl py-5 text-xl font-black text-white shadow ${
              me.isReady ? "bg-emerald-600" : "bg-slate-700"
            }`}
          >
            {me.isReady ? "Ready ✓" : "Tap when ready"}
          </button>
        </section>
      ) : null}

      {room.gameState === "playing" ? (
        <section className="mt-4 flex flex-1 flex-col gap-4">
          <div className="rounded-3xl border border-slate-200 bg-white p-6 text-center shadow-sm">
            <p className="text-xs font-bold tracking-wide text-slate-500">YOUR GUESS</p>
            <p className="mt-2 text-7xl font-black text-slate-900">{displayGuess}</p>
            {submitted ? (
              <p className="mt-2 text-sm text-slate-500">Submitted — waiting for other players…</p>
            ) : null}
          </div>

          <div className="grid grid-cols-2 gap-4">
            <button
              type="button"
              disabled={inputLocked}
              onClick={() => onDelta(-1)}
              className="rounded-3xl border border-slate-200 bg-slate-100 py-10 text-6xl font-black text-slate-900 shadow-sm active:scale-[0.99] disabled:opacity-40"
              aria-label="Decrease guess"
            >
              −
            </button>
            <button
              type="button"
              disabled={inputLocked}
              onClick={() => onDelta(1)}
              className="rounded-3xl bg-blue-600 py-10 text-6xl font-black text-white shadow active:scale-[0.99] disabled:opacity-40"
              aria-label="Increase guess"
            >
              +
            </button>
          </div>

          <button
            type="button"
            disabled={room.submissionsLocked || submitted}
            onClick={onSubmitRound}
            className="rounded-2xl bg-emerald-600 py-4 text-lg font-black text-white shadow disabled:opacity-40"
          >
            {submitted ? "Submitted" : "Submit count"}
          </button>
        </section>
      ) : null}

      {room.gameState === "round_reveal" ? (
        <section className="mt-6 flex flex-1 flex-col gap-4 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <p className="text-center text-sm font-bold text-slate-500">ROUND RESULT</p>
          <p className="text-center text-5xl font-black text-slate-900">{me.guess}</p>
          <p className="text-center text-sm text-slate-600">
            Your guess · answer was{" "}
            <span className="font-black text-emerald-600">{room.lastAnswer ?? "?"}</span>
          </p>
          <div className="mt-2 grid grid-cols-2 gap-3 text-center">
            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <p className="text-xs font-bold text-slate-500">TOTAL ERROR</p>
              <p className="text-3xl font-black text-slate-900">{me.score}</p>
              <p className="mt-1 text-xs text-slate-500">Lower is better</p>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <p className="text-xs font-bold text-slate-500">THIS ROUND</p>
              <p className="text-3xl font-black text-slate-900">
                {golfRoundError(me.guess, room.lastAnswer ?? 0)}
              </p>
              <p className="mt-1 text-xs text-slate-500">Off by (added to total)</p>
            </div>
          </div>
          <button
            type="button"
            onClick={toggleReady}
            className={`mt-1 rounded-2xl py-4 text-lg font-black text-white shadow ${
              me.isReady ? "bg-emerald-600" : "bg-slate-700"
            }`}
          >
            {me.isReady ? "Ready for next round ✓" : "I’m ready for next round"}
          </button>
          <p className="text-center text-xs text-slate-500">
            Next round starts when everyone is ready.
          </p>
        </section>
      ) : null}

      {room.gameState === "results" ? (
        <section className="mt-6 flex flex-1 flex-col gap-3">
          <h2 className="text-center text-3xl font-black text-slate-900">Leaderboard</h2>
          <p className="text-center text-xs text-slate-500">Total error — lower wins</p>
          <ol className="mt-2 space-y-2">
            {players
              .filter((p) => p.id !== room.hostId)
              .sort((a, b) => a.data.score - b.data.score)
              .map((p, idx) => (
                <li
                  key={p.id}
                  className={`flex items-center justify-between rounded-2xl border px-4 py-3 ${
                    p.id === playerId
                      ? "border-blue-300 bg-blue-50"
                      : "border-slate-200 bg-white"
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <span className="w-7 text-center text-lg font-black text-slate-400">{idx + 1}</span>
                    <span className="font-bold text-slate-900">{p.data.name}</span>
                  </div>
                  <span className="text-2xl font-black text-slate-900">{p.data.score}</span>
                </li>
              ))}
          </ol>
          <Link
            to="/"
            className="mt-4 block rounded-2xl border border-slate-300 bg-slate-900 py-4 text-center text-lg font-black text-white"
          >
            Leave
          </Link>
        </section>
      ) : null}
    </div>
  );
}
