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

## API

### `createRuntimeWrapper(options)`

Creates a new runtime wrapper instance with hot-reload capabilities.

**Options:**
- `registry` (optional): Initial registry state with `scripts`, `events`, and `closures`.
- `onPatchApplied` (optional): Callback invoked after each successful patch application.

**Returns:** An object with the following methods:

#### `applyPatch(patch)`

Applies a patch to the runtime registry. The patch object must have:
- `kind`: Either `"script"` or `"event"`
- `id`: Unique identifier for the patch
- `js_body`: JavaScript function body as a string

Returns `{ success: true, version: <number> }` on success.

#### `undo()`

Reverts the most recently applied patch.

Returns `{ success: true, version: <number> }` on success, or `{ success: false, message: <string> }` if there's nothing to undo.

#### `getPatchHistory()`

Returns an array of all patch operations (apply and undo) with metadata:
- `patch.kind`: Type of patch (`"script"` or `"event"`)
- `patch.id`: Patch identifier
- `version`: Registry version after the operation
- `timestamp`: Time when the operation occurred
- `action`: Either `"apply"` or `"undo"`

#### `getRegistrySnapshot()`

Returns a snapshot of the current registry state:
- `version`: Current registry version
- `scriptCount`: Number of registered scripts
- `eventCount`: Number of registered events
- `closureCount`: Number of registered closures
- `scripts`: Array of script IDs
- `events`: Array of event IDs
- `closures`: Array of closure IDs

#### `getPatchStats()`

Returns aggregate statistics about patch operations:
- `totalPatches`: Total number of operations
- `appliedPatches`: Number of apply operations
- `undonePatches`: Number of undo operations
- `scriptPatches`: Number of script-related operations
- `eventPatches`: Number of event-related operations
- `uniqueIds`: Number of unique patch IDs

## Status
The module implements core patch application and diagnostic capabilities. WebSocket integration and
advanced lifecycle hooks remain under construction.
