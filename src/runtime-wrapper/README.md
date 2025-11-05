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
- `validateBeforeApply` (optional): When `true`, validates patches in a shadow registry before applying to the real registry. Default is `false`.

**Returns:** An object with the following methods:

#### `applyPatch(patch)`

Applies a patch to the runtime registry. The patch object must have:

- `kind`: Either `"script"` or `"event"`
- `id`: Unique identifier for the patch
- `js_body`: JavaScript function body as a string

When `validateBeforeApply` is enabled, patches are validated in a shadow registry first. Invalid patches are rejected before touching the real registry.

Returns `{ success: true, version: <number> }` on success.

#### `trySafeApply(patch, onValidate)`

Applies a patch with automatic rollback on failure. This method:

1. Validates the patch in a shadow registry to catch syntax errors
2. Optionally runs a custom validation callback
3. Applies the patch to the real registry
4. Automatically rolls back if any step fails

**Parameters:**

- `patch`: Patch object (same format as `applyPatch`)
- `onValidate` (optional): Custom validation function that receives the patch and returns `true`/`false` or throws an error

**Returns:**

- On success: `{ success: true, version: <number>, rolledBack: false }`
- On shadow validation failure: `{ success: false, error: <string>, message: <string> }`
- On rollback: `{ success: false, error: <string>, message: <string>, rolledBack: true }`

Rollback operations are recorded in the patch history with `action: "rollback"`.

#### `undo()`

Reverts the most recently applied patch.

Returns `{ success: true, version: <number> }` on success, or `{ success: false, message: <string> }` if there's nothing to undo.

#### `getPatchHistory()`

Returns an array of all patch operations (apply, undo, and rollback) with metadata:

- `patch.kind`: Type of patch (`"script"` or `"event"`)
- `patch.id`: Patch identifier
- `version`: Registry version after the operation
- `timestamp`: Time when the operation occurred
- `action`: Either `"apply"`, `"undo"`, or `"rollback"`
- `error` (rollback only): Error message that caused the rollback

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

## Error Recovery and Safe Patch Application

The runtime wrapper provides two mechanisms for safe patch application:

### Shadow Registry Validation

When creating a wrapper with `validateBeforeApply: true`, all patches are validated in an isolated shadow registry before being applied to the real registry. This catches syntax errors and malformed patches without affecting the running application:

```javascript
const wrapper = createRuntimeWrapper({ validateBeforeApply: true });

// Invalid patches are rejected before touching the registry
wrapper.applyPatch({
    kind: "script",
    id: "script:bad",
    js_body: "return {{ invalid syntax"
}); // Throws: Patch validation failed
```

### Automatic Rollback with `trySafeApply`

For production use, `trySafeApply` provides comprehensive error recovery:

```javascript
const wrapper = createRuntimeWrapper();

// Shadow validation + custom validation + automatic rollback
const result = wrapper.trySafeApply(
    {
        kind: "script",
        id: "script:risky",
        js_body: "return args[0] * 2;"
    },
    (patch) => {
        // Custom validation logic
        return patch.id.startsWith("script:");
    }
);

if (!result.success) {
    console.error("Patch failed:", result.message);
    if (result.rolledBack) {
        console.log("Registry was automatically restored");
    }
}
```

The `trySafeApply` method:

1. Validates patches in a shadow registry to catch syntax errors
2. Runs optional custom validation logic
3. Applies the patch if all validations pass
4. Automatically rolls back on any failure, preserving registry state
5. Records rollback operations in patch history for diagnostics

This aligns with the live reloading concept's error handling strategy of applying patches in a shadow registry first and rolling back automatically on runtime errors.

#### `getVersion()`

Returns the current registry version number.

#### `getScript(id)`

Retrieves a specific script function by ID. Returns the function or `undefined` if not found.

#### `getEvent(id)`

Retrieves a specific event function by ID. Returns the function or `undefined` if not found.

#### `hasScript(id)`

Checks if a script with the given ID exists. Returns `true` if present, `false` otherwise.

#### `hasEvent(id)`

Checks if an event with the given ID exists. Returns `true` if present, `false` otherwise.

### `createWebSocketClient(options)`

Creates a WebSocket client for receiving live patches from a development server. The client automatically reconnects on connection loss and integrates with a runtime wrapper to apply patches.

**Options:**

- `url` (optional): WebSocket server URL. Default is `"ws://127.0.0.1:17890"`.
- `wrapper` (optional): Runtime wrapper instance. If provided, patches received over WebSocket are automatically applied.
- `onConnect` (optional): Callback invoked when the WebSocket connection opens.
- `onDisconnect` (optional): Callback invoked when the WebSocket connection closes.
- `onError` (optional): Callback `(error, context)` invoked on errors. Context is either `"connection"` or `"patch"`.
- `reconnectDelay` (optional): Milliseconds to wait before reconnecting after connection loss. Default is `800`. Set to `0` to disable reconnection.
- `autoConnect` (optional): When `true`, connects immediately. Default is `true`.

**Returns:** An object with the following methods:

#### `connect()`

Establishes a WebSocket connection to the server. Called automatically if `autoConnect` is `true`.

#### `disconnect()`

Closes the WebSocket connection and cancels any pending reconnection attempts.

#### `isConnected()`

Returns `true` if the WebSocket is currently connected, `false` otherwise.

#### `send(data)`

Sends data to the server. Data can be a string or an object (which will be JSON-stringified). Throws an error if not connected.

#### `getWebSocket()`

Returns the underlying WebSocket instance, or `null` if not connected. Useful for testing and advanced use cases.

**Example Usage:**

```javascript
import { createRuntimeWrapper, createWebSocketClient } from "@prettier-plugin-gml/runtime-wrapper";

// Create wrapper
const wrapper = createRuntimeWrapper({
    onPatchApplied: (patch, version) => {
        console.log(`Patch ${patch.id} applied at version ${version}`);
    }
});

// Create WebSocket client that automatically applies patches
const client = createWebSocketClient({
    url: "ws://localhost:17890",
    wrapper,
    onConnect: () => console.log("Connected to dev server"),
    onDisconnect: () => console.log("Disconnected from dev server"),
    onError: (error, context) => console.error(`Error (${context}):`, error)
});

// Client will automatically reconnect on connection loss
// Disconnect manually when done
// client.disconnect();
```

## Status

The module implements core patch application, diagnostic capabilities, and WebSocket integration. Advanced lifecycle hooks remain under construction.
