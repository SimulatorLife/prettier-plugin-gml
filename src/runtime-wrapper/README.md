# Runtime Wrapper Module

This package will host the browser-side runtime wrapper described in
`docs/live-reloading-concept.md`. It receives transpiler patches from the CLI over a WebSocket
connection and swaps them into the running GameMaker HTML5 export without restarting the game.

## Responsibilities
- Maintain the hot registry for scripts, events, and closures.
- Provide patch application helpers that the development shell can call.
- Surface lifecycle hooks for migrations when hot-reloading Create events.
- Offer lightweight diagnostics so the CLI and developer can inspect patch state.

## Directory layout
- `src/` – wrapper source files that ship to the browser or dev iframe.
- `test/` – unit tests that exercise the wrapper in a simulated environment.

## Status
The module is scaffolded only. It exports a placeholder `createRuntimeWrapper` helper so the
workspace wiring can proceed while the actual implementation remains under construction.
