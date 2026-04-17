# Box Count Party

Minimal multiplayer “count the blocks” party game: one **host screen** renders the puzzle on HTML5 Canvas, and **phones** act as controllers with **+ / −** and **Submit** (no typing). Game state syncs through **Firebase Firestore**.

## Project layout

- `src/features/` — UI flows (`home`, `host`, `controller`)
- `src/game/rendering/` — Isometric **Canvas 2D** puzzle renderer (`renderPuzzle`, no WebGL)
- `src/components/GameCanvas.tsx` — Host puzzle view wrapper
- `src/gameEngine/` — Static puzzle loading, difficulty progression, scoring, validation helpers
- `src/data/puzzles.json` — Precomputed puzzles (easy / medium / hard)
- `src/firebase/` — Firebase app bootstrap + Firestore room helpers
- `backend/firebase/` — Firestore security rules (MVP defaults)

## Prerequisites

- Node.js 20+ recommended
- A Firebase project with **Firestore** enabled

## Firebase setup

1. In the [Firebase console](https://console.firebase.google.com/), create a project (or pick an existing one).
2. Add a **Web app** and copy the config values.
3. Enable **Firestore** in Native mode.
4. Deploy rules (or use local emulator). For a quick local MVP, this repo includes permissive rules under `backend/firebase/firestore.rules` (**not safe for production**).

```bash
npm install -g firebase-tools
firebase login
# Default project is set in `.firebaserc` (miniga-540cf). To pick another:
# firebase use --add
firebase deploy --only firestore:rules
```

5. Create a `.env` file in the project root (same folder as `package.json`) by copying `.env.example` (e.g. `cp .env.example .env`) and adjusting values if needed. Optional: `VITE_FIREBASE_MEASUREMENT_ID` is only needed if you add Google Analytics (`getAnalytics`) in code; Firestore works without it.

## Run locally

```bash
npm install
npm run validate-puzzles
npm run dev
```

Open:

- `/` to create a room (host) or join with a code (controller)
- `/host/<CODE>` on the shared display
- `/play/<CODE>` on each phone

## Build

```bash
npm run build
npm run preview
```

## Puzzle dataset

Puzzles are **never generated at runtime**. Add or edit entries in `src/data/puzzles.json`, then run:

```bash
npm run validate-puzzles
```

The validator checks grid dimensions, binary cells, and that `correctAnswer` equals the number of `1` cells.

## Optional Auth

This MVP uses anonymous-ish per-device IDs stored in `localStorage` (`boxcount_player_id`). To harden cheating or namespacing rooms, you can layer **Firebase Auth** (anonymous sign-in) and then write Firestore rules that require `request.auth.uid == playerId` for `players/{playerId}` updates.

## Game flow notes

- There is **no per-round timer**. Controllers adjust a **local** guess with + / − (no Firestore writes until submit), then tap **Submit** to atomically write `guess` + `roundSubmitted`.
- **Lobby:** every player must set **Ready** before the host can start (`startGame` enforces this). Controllers can edit **display name** only in the lobby.
- The host shows the puzzle for **2 seconds**, then hides it while players finish. The host lists **Submitted** vs **Thinking…** using `roundSubmitted`.
- When **every** non-host player has submitted, the host waits **2 seconds** (so guesses propagate), then calls **`lockRoundAndScore`**, runs the reveal (cubes light up in order at a readable cadence), and advances rounds.
- **Scoring (golf):** each round adds `abs(guess - correctAnswer)` to `player.score`. **Lower cumulative total is better.** The game ends after the configured number of rounds.

### Firestore player fields

- `guess`, `score` (cumulative golf error), `lives` (legacy field, not updated by rounds), `isReady` (lobby), `roundSubmitted`. Display names are capped (see `MAX_PLAYER_DISPLAY_NAME_LENGTH` in `src/constants/player.ts`).

### Puzzles

- Dataset version **2**: every puzzle uses a **5×5** `grid` (unused cells are `0`). Difficulty is expressed via patterns and motion modifiers, not grid dimensions.
