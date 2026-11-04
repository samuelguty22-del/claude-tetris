# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

Tetris in vanilla JavaScript + HTML5 Canvas. No dependencies, no `package.json`, no build, no linter, no tests. The README is in Spanish, as are the UI strings (e.g. "Puntuación", "Reiniciar", "PAUSA") — keep new user-facing text consistent.

## Running

Open `index.html` directly, or serve statically (e.g. `python -m http.server 8000`, `npx serve .`).

## Architecture

Everything lives in `game.js`, loaded as a classic script (not a module) by `index.html`, which looks elements up by ID at load time. Renaming an ID in `index.html` requires updating the `getElementById` calls at the top of `game.js`.

- **State** is a set of module-level `let` variables (`board`, `current`, `next`, `score`, `lines`, `level`, `paused`, `gameOver`, `dropInterval`, `animId`, ...), all reset in `init()`. `init()` is also the restart handler.
- **Piece/board encoding**: `PIECES[type]` shape matrices hold the type index (1–7) in filled cells, and `COLORS[type]` uses the same index. The board stores that index (0 = empty). Adding a piece means adding to both arrays, and updating the hardcoded `Math.floor(Math.random() * 7) + 1` in `randomPiece`.
- **Game loop**: `loop(ts)` runs on `requestAnimationFrame`, accumulates `dropAccum`, gravity-drops or locks the piece, then `draw()`. Pause/game-over stop the loop via `cancelAnimationFrame(animId)`; unpausing restarts it by calling `loop` directly with a fresh `lastTime`.
- **Piece lifecycle**: `lockPiece()` → `merge()` → `clearLines()` (updates score/level/`dropInterval`) → `spawn()`, which calls `endGame()` if the new piece collides immediately.
- **Scoring is split**: line-clear score is in `clearLines`, hard drop (+2/cell) in `hardDrop`, soft drop (+1/row) in `softDrop`. Note the gravity tick in `loop` does not call `softDrop`, so it awards no points.
- **Rotation**: clockwise only (`rotateCW`), with simple horizontal kicks `[0, -1, 1, -2, 2]` in `tryRotate`.
- **Canvas size is coupled to constants**: the `#board` canvas is `COLS*BLOCK` × `ROWS*BLOCK` (300×600) in `index.html`; changing `COLS`/`ROWS`/`BLOCK` requires updating those attributes. The `#next-canvas` (120×120) is drawn on a 4×4 grid at a hardcoded 30px.
