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
- `registry` - Optional initial registry state (for resuming a session)
- `onPatchApplied` - Optional callback invoked after each successful patch: `(patch, version) => void`

**Returns:** A wrapper object with the following methods:

#### `applyPatch(patch)`

Applies a patch to update scripts or events in the registry.

**Patch format:**
```javascript
{
  kind: "script" | "event",
  id: "script:name" | "obj_name#EventType",
  js_body: "/* JavaScript function body */"
}
```

**Returns:** `{ success: true, version: number }`

#### `undo()`

Reverts the last applied patch, restoring the previous state.

**Returns:** `{ success: boolean, version?: number, message?: string }`

#### `getDiagnostics()`

Returns comprehensive metrics about the current wrapper state.

**Returns:**
```javascript
{
  version: number,                // Current registry version
  registeredScripts: number,      // Count of active scripts
  registeredEvents: number,       // Count of active events
  registeredClosures: number,     // Count of active closures
  totalPatchesApplied: number,    // Total patches attempted
  successfulPatches: number,      // Successfully applied patches
  failedPatches: number,          // Failed patch attempts
  undoStackDepth: number          // Number of undo operations available
}
```

#### `getPatchHistory(options)`

Retrieves the history of patch applications.

**Options:**
- `limit` - Maximum number of history entries to return (from most recent)
- `kind` - Filter by patch kind: `"script"` or `"event"`
- `successOnly` - If `true`, only return successful patches

**Returns:** Array of history entries:
```javascript
[{
  patch: { kind: string, id: string },
  version: number,
  timestamp: number,
  success: boolean,
  error?: string  // Present if success is false
}]
```

#### `getRegisteredIds(kind)`

Returns all registered IDs for a given kind.

**Parameters:**
- `kind` - One of: `"script"`, `"event"`, or `"closure"`

**Returns:** Array of string IDs

## Usage Example

```javascript
import { createRuntimeWrapper } from '@prettier-plugin-gml/runtime-wrapper';

const wrapper = createRuntimeWrapper({
  onPatchApplied: (patch, version) => {
    console.log(`Applied ${patch.kind} ${patch.id} at version ${version}`);
  }
});

// Apply a script patch
wrapper.applyPatch({
  kind: "script",
  id: "script:player_move",
  js_body: "self.x += args[0]; self.y += args[1];"
});

// Check diagnostics
const diag = wrapper.getDiagnostics();
console.log(`Registry version: ${diag.version}`);
console.log(`Scripts: ${diag.registeredScripts}, Events: ${diag.registeredEvents}`);

// View patch history
const history = wrapper.getPatchHistory({ limit: 10 });
history.forEach(entry => {
  console.log(`${entry.timestamp}: ${entry.patch.kind} ${entry.patch.id} - ${entry.success ? 'OK' : 'FAILED'}`);
});

// List all registered scripts
const scriptIds = wrapper.getRegisteredIds("script");
console.log("Registered scripts:", scriptIds);
```

## Status
The module provides core patch application, undo functionality, and comprehensive diagnostic capabilities.
The wrapper maintains patch history and registry state, enabling developers and tooling to inspect
and monitor hot-reload operations.
