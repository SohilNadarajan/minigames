import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { MAX_PLAYER_DISPLAY_NAME_LENGTH } from "../../constants/player";
import { createRoom, joinRoom } from "../../firebase/roomService";
import { getFirebaseApp } from "../../firebase/config";
import { useLocalPlayerId } from "../../hooks/useLocalPlayerId";
import type { GameDifficulty, GameId } from "../../gameEngine/types";

export function HomePage() {
  const navigate = useNavigate();
  const playerId = useLocalPlayerId();
  const [joinCode, setJoinCode] = useState("");
  const [joinName, setJoinName] = useState("");
  const [createGameId, setCreateGameId] = useState<GameId>("cube-count");
  const [createRounds, setCreateRounds] = useState<10 | 20 | 30>(10);
  const [createDifficulty, setCreateDifficulty] = useState<GameDifficulty>("medium");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onCreate = async () => {
    setError(null);
    setBusy(true);
    try {
      getFirebaseApp();
      const code = await createRoom(playerId, {
        gameId: createGameId,
        totalRounds: createRounds,
        gameDifficulty: createDifficulty,
      });
      navigate(`/host/${code}`, { replace: true });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not create room");
    } finally {
      setBusy(false);
    }
  };

  const onJoin = async () => {
    setError(null);
    setBusy(true);
    try {
      getFirebaseApp();
      const code = joinCode.trim().toUpperCase();
      const name = joinName.trim() || "Player";
      if (code.length < 4) {
        throw new Error("Enter a room code");
      }
      await joinRoom(code, playerId, name);
      navigate(`/play/${code}`, { replace: true });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not join room");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mx-auto flex min-h-full max-w-lg flex-col gap-8 px-4 py-10">
      <header className="text-center">
        <p className="text-sm tracking-wide text-slate-500">Brain-style party game</p>
        <h1 className="mt-2 text-4xl font-extrabold tracking-tight text-slate-900">
          Minigame Party
        </h1>
        <p className="mt-3 text-balance text-slate-600">
          One shared screen hosts the game. Phones act as controllers.
        </p>
      </header>

      {error ? (
        <div className="rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-amber-950">
          {error}
        </div>
      ) : null}

      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="text-lg font-bold text-slate-900">Host (TV / shared screen)</h2>
        <p className="mt-3 text-sm text-slate-600">
          Pick a game and settings, then create a room code for controllers to join.
        </p>
        <label className="mt-4 block text-sm text-slate-700">
          Game
          <select
            value={createGameId}
            onChange={(e) => setCreateGameId(e.target.value as GameId)}
            className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-3 py-2 font-semibold text-slate-900"
          >
            <option value="cube-count">Count the Boxes</option>
            <option value="color-grid">Color Match Grid</option>
          </select>
        </label>
        <div className="mt-3 grid grid-cols-2 gap-3">
          <label className="text-sm text-slate-700">
            Rounds
            <select
              value={createRounds}
              onChange={(e) => setCreateRounds(Number(e.target.value) as 10 | 20 | 30)}
              className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-3 py-2 font-semibold text-slate-900"
            >
              <option value={10}>10 rounds</option>
              <option value={20}>20 rounds</option>
              <option value={30}>30 rounds</option>
            </select>
          </label>
          <label className="text-sm text-slate-700">
            Game difficulty
            <select
              value={createDifficulty}
              onChange={(e) => setCreateDifficulty(e.target.value as GameDifficulty)}
              className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-3 py-2 font-semibold text-slate-900"
            >
              <option value="easy">Easy</option>
              <option value="medium">Medium</option>
              <option value="hard">Hard</option>
            </select>
          </label>
        </div>
        <button
          type="button"
          disabled={busy}
          onClick={onCreate}
          className="mt-4 w-full rounded-2xl bg-blue-600 py-4 text-lg font-extrabold text-white shadow active:scale-[0.99] disabled:opacity-50"
        >
          Create room
        </button>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="text-lg font-bold text-slate-900">Join as controller</h2>
        <label className="mt-3 block text-sm text-slate-600">
          Room code
          <input
            value={joinCode}
            onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
            className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-2xl font-black tracking-[0.35em] text-slate-900 outline-none focus:border-blue-500"
            placeholder="CODE"
            maxLength={8}
            inputMode="text"
            autoCapitalize="characters"
          />
        </label>
        <label className="mt-3 block text-sm text-slate-600">
          Your name
          <input
            value={joinName}
            onChange={(e) => setJoinName(e.target.value)}
            className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-lg text-slate-900 outline-none focus:border-blue-500"
            placeholder="Player"
            maxLength={MAX_PLAYER_DISPLAY_NAME_LENGTH}
          />
        </label>
        <button
          type="button"
          disabled={busy}
          onClick={onJoin}
          className="mt-4 w-full rounded-2xl bg-emerald-600 py-4 text-lg font-extrabold text-white shadow active:scale-[0.99] disabled:opacity-50"
        >
          Join room
        </button>
      </section>
    </div>
  );
}
