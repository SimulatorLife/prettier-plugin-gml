# Runtime Wrapper Module

This package hosts the browser-side runtime wrapper described in
`docs/live-reloading-concept.md`. It receives transpiler patches from the CLI over a WebSocket
connection and swaps them into the running GameMaker HTML5 export without restarting the game.

## Responsibilities
- Maintain the hot registry for scripts, events, and closures.
- Provide patch application helpers that the development shell can call.
- Surface lifecycle hooks for migrations when hot-reloading Create events.
- Offer lightweight diagnostics so the CLI and developer can inspect patch state.
- Establish and manage WebSocket connections for receiving live patches.

## Directory layout
- `src/` – wrapper source files that ship to the browser or dev iframe.
- `test/` – unit tests that exercise the wrapper in a simulated environment.

## API

### `createRuntimeWrapper(options)`
Creates a hot-reloadable runtime wrapper that manages patch application and registry lifecycle.

**Options:**
- `registry` (optional): Initial registry state with scripts, events, and closures.
- `onPatchApplied` (optional): Callback invoked when a patch is successfully applied.

**Returns:** An object with:
- `state`: Current registry state including version, scripts, events, and undo stack.
- `applyPatch(patch)`: Apply a patch to the registry.
- `undo()`: Revert the last applied patch.

### `createWebSocketClient(options)`
Creates a WebSocket client for receiving live patches from the development server.

**Options:**
- `url`: WebSocket server URL (e.g., `"ws://127.0.0.1:17890"`).
- `onPatch`: Callback invoked when a patch is received.
- `onStatus`: Callback invoked when connection status changes (`"connecting"`, `"connected"`, `"disconnected"`, `"reconnecting"`).

**Returns:** An object with:
- `connect()`: Establish WebSocket connection.
- `disconnect()`: Close connection and stop reconnection attempts.
- `getStatus()`: Get current connection status.

**Features:**
- Automatic reconnection with exponential backoff on connection failure.
- Graceful error handling for malformed patches.
- Clean connection lifecycle management.

## Usage Example

```javascript
import { createRuntimeWrapper, createWebSocketClient } from "gamemaker-language-runtime-wrapper";

const wrapper = createRuntimeWrapper({
    onPatchApplied: (patch, version) => {
        console.log(`Applied ${patch.kind} patch: ${patch.id} (v${version})`);
    }
});

const client = createWebSocketClient({
    url: "ws://127.0.0.1:17890",
    onPatch: (patch) => {
        wrapper.applyPatch(patch);
    },
    onStatus: (status) => {
        console.log(`WebSocket: ${status}`);
    }
});

client.connect();
```

## Status
The module provides core patch application and WebSocket connectivity for live reloading. Integration with the transpiler and CLI is ongoing.
