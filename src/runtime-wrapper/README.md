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
- `onChange` (optional): Lifecycle listener that receives events for all registry changes (patch applied, undone, rolled back, registry cleared). See [Registry Lifecycle Hooks](#registry-lifecycle-hooks) for details.

**Returns:** An object with the following methods:

#### `applyPatch(patch)`

Applies a patch to the runtime registry. The patch object must have:

- `kind`: Either `"script"`, `"event"`, or `"closure"`
- `id`: Unique identifier for the patch
- `js_body`: JavaScript function body as a string

When `validateBeforeApply` is enabled, patches are validated in a shadow registry first. Invalid patches are rejected before touching the real registry.

Returns `{ success: true, version: <number> }` on success.

#### `applyPatchBatch(patches)`

Applies multiple patches atomically as a single operation. Either all patches succeed, or the entire batch is rolled back.

**Parameters:**

- `patches`: Array of patch objects (same format as `applyPatch`)

**Behavior:**

1. Validates all patches upfront (structure and shadow validation if enabled)
2. If validation fails, returns error without applying any patches
3. Applies patches sequentially, recording each in the undo stack
4. If any patch fails during application, automatically rolls back all previously applied patches in the batch
5. Records a batch operation marker in the patch history

**Returns:**

- On success: `{ success: true, version: <number>, appliedCount: <number>, rolledBack: false }`
- On validation failure: `{ success: false, appliedCount: 0, failedIndex: <number>, error: <string>, message: <string>, rolledBack: false }`
- On application failure with rollback: `{ success: false, appliedCount: <number>, failedIndex: <number>, error: <string>, message: <string>, rolledBack: true }`

**Benefits:**

- **Atomicity**: All-or-nothing application ensures registry consistency
- **Performance**: Reduces overhead compared to applying patches individually
- **Safety**: Automatic rollback on failure maintains registry integrity
- **Debugging**: Batch markers in history make it easy to track multi-patch operations

**Example:**

```javascript
const wrapper = createRuntimeWrapper();

const patches = [
    { kind: "script", id: "script:player_move", js_body: "return args[0] * 2;" },
    { kind: "event", id: "obj_player#Step", js_body: "this.x += 1;" },
    { kind: "closure", id: "closure:counter", js_body: "let n = 0; return () => ++n;" }
];

const result = wrapper.applyPatchBatch(patches);
if (result.success) {
    console.log(`Applied ${result.appliedCount} patches at version ${result.version}`);
} else {
    console.error(`Batch failed at patch ${result.failedIndex}: ${result.message}`);
    if (result.rolledBack) {
        console.log("All changes were rolled back");
    }
}
```

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
- `rolledBackPatches`: Number of rollback operations
- `scriptPatches`: Number of script-related operations
- `eventPatches`: Number of event-related operations
- `closurePatches`: Number of closure-related operations
- `uniqueIds`: Number of unique patch IDs
- `averagePatchDurationMs` (optional): Average time to apply patches in milliseconds
- `totalDurationMs` (optional): Total time spent applying patches in milliseconds
- `fastestPatchMs` (optional): Fastest patch application time in milliseconds
- `slowestPatchMs` (optional): Slowest patch application time in milliseconds
- `p50DurationMs` (optional): Median (50th percentile) patch application time in milliseconds
- `p90DurationMs` (optional): 90th percentile patch application time in milliseconds
- `p99DurationMs` (optional): 99th percentile patch application time in milliseconds

**Note:** Timing metrics are only available when patches have been applied with duration tracking enabled (which is automatic in this implementation). Percentile metrics provide more insight into the distribution of patch application times, helping identify outliers and typical performance characteristics.

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

#### `getClosure(id)`

Retrieves a specific closure function by ID. Returns the function or `undefined` if not found.

#### `hasClosure(id)`

Checks if a closure with the given ID exists. Returns `true` if present, `false` otherwise.

#### `clearRegistry()`

Clears all patches from the registry (scripts, events, and closures) and resets the undo stack. The registry version is incremented. This is useful for resetting the runtime state during development or when switching between different code versions.

**Important:** Calling `clearRegistry()` clears the undo stack, meaning you cannot undo patches applied before the clear operation. Any subsequent `undo()` call will fail until new patches are applied.

**Example:**

```javascript
const wrapper = createRuntimeWrapper();

wrapper.applyPatch({ kind: "script", id: "script:test", js_body: "return 42;" });
console.log(wrapper.hasScript("script:test")); // true

wrapper.clearRegistry();
console.log(wrapper.hasScript("script:test")); // false
console.log(wrapper.getVersion()); // incremented

// Undo stack is also cleared
const undoResult = wrapper.undo();
console.log(undoResult.success); // false - nothing to undo
```

#### `checkRegistryHealth()`

Validates the integrity of the runtime registry and returns a health report. This diagnostic method checks for common corruption issues such as non-function entries in the registry collections. The health check is fast and safe to call frequently during development or in automated monitoring.

**Returns:** A `RegistryHealthCheck` object with:

- `healthy` (boolean): `true` if no issues detected, `false` otherwise
- `version` (number): Current registry version at the time of the check
- `issues` (array): List of detected problems, each containing:
  - `severity`: Either `"warning"` or `"error"`
  - `category`: Issue type (`"function-type"`, `"id-format"`, or `"collection-integrity"`)
  - `message`: Human-readable description
  - `affectedId`: The registry ID that triggered the issue (if applicable)

**Example:**

```javascript
const wrapper = createRuntimeWrapper();

wrapper.applyPatch({ kind: "script", id: "script:test", js_body: "return 42;" });

// Validate registry integrity
const health = wrapper.checkRegistryHealth();
if (health.healthy) {
    console.log(`✓ Registry is healthy (version ${health.version})`);
} else {
    console.error(`✗ Registry has ${health.issues.length} issue(s):`);
    for (const issue of health.issues) {
        console.error(`  [${issue.severity}] ${issue.message}`);
        if (issue.affectedId) {
            console.error(`    Affected ID: ${issue.affectedId}`);
        }
    }
}
```

**Use cases:**
- Detecting accidental registry corruption during development
- Validating registry state before critical operations
- Building health monitoring dashboards
- Debugging unexpected patch application failures
- Automated testing of runtime wrapper integrity

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

#### `getConnectionMetrics()`

Returns a read-only snapshot of connection health metrics for diagnostics and monitoring. The returned object includes:

- `totalConnections`: Number of successful connections
- `totalDisconnections`: Number of disconnections
- `totalReconnectAttempts`: Number of automatic reconnection attempts
- `patchesReceived`: Total patches received over the connection
- `patchesApplied`: Total patches successfully applied
- `patchesFailed`: Total patches that failed to apply
- `lastConnectedAt`: Timestamp of the last successful connection (milliseconds since epoch), or `null` if never connected
- `lastDisconnectedAt`: Timestamp of the last disconnection (milliseconds since epoch), or `null` if never disconnected
- `lastPatchReceivedAt`: Timestamp when the last patch was received (milliseconds since epoch), or `null` if no patches received
- `lastPatchAppliedAt`: Timestamp when the last patch was successfully applied (milliseconds since epoch), or `null` if no patches applied
- `connectionErrors`: Number of connection-level errors
- `patchErrors`: Number of patch-level errors (currently tracks validation failures)

**Example:**

```javascript
const client = createWebSocketClient({ wrapper });

// Later, check connection health
const metrics = client.getConnectionMetrics();
console.log(`Received ${metrics.patchesReceived} patches`);
console.log(`Applied ${metrics.patchesApplied} patches`);
console.log(`Failed ${metrics.patchesFailed} patches`);
console.log(`Success rate: ${((metrics.patchesApplied / metrics.patchesReceived) * 100).toFixed(1)}%`);

if (metrics.lastPatchReceivedAt) {
    const timeSinceLastPatch = Date.now() - metrics.lastPatchReceivedAt;
    console.log(`Last patch received ${timeSinceLastPatch}ms ago`);
}
```

The metrics object is frozen to prevent accidental modification. Use these metrics for:
- Monitoring connection quality
- Debugging patch application failures
- Tracking hot-reload performance
- Building diagnostic dashboards
- Detecting connection issues

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

// Apply various patch types
wrapper.applyPatch({
    kind: "script",
    id: "script:calculate_damage",
    js_body: "return args[0] * 1.5;"
});

wrapper.applyPatch({
    kind: "event",
    id: "obj_player#Step",
    js_body: "this.x += 1;"
});

wrapper.applyPatch({
    kind: "closure",
    id: "closure:make_counter",
    js_body: "let count = 0; return () => ++count;"
});

const counter = wrapper.getClosure("closure:make_counter")();
console.log(counter()); // 1
console.log(counter()); // 2

// Client will automatically reconnect on connection loss
// Disconnect manually when done
// client.disconnect();
```

## Performance Monitoring

The runtime wrapper automatically tracks performance metrics for patch application, providing insight into hot-reload performance:

```javascript
const wrapper = createRuntimeWrapper({
    onPatchApplied: (patch, version) => {
        console.log(`✅ Applied patch ${patch.id} at version ${version}`);
    }
});

// Apply several patches
wrapper.applyPatch({ kind: "script", id: "script:a", js_body: "return 1;" });
wrapper.applyPatch({ kind: "script", id: "script:b", js_body: "return 2;" });
wrapper.applyPatch({ kind: "event", id: "obj_test#Step", js_body: "this.x++;" });

// Get detailed performance statistics
const stats = wrapper.getPatchStats();
console.log(`Total patches applied: ${stats.appliedPatches}`);
console.log(`Average patch time: ${stats.averagePatchDurationMs?.toFixed(2)}ms`);
console.log(`Median (p50): ${stats.p50DurationMs?.toFixed(2)}ms`);
console.log(`90th percentile: ${stats.p90DurationMs?.toFixed(2)}ms`);
console.log(`99th percentile: ${stats.p99DurationMs?.toFixed(2)}ms`);
console.log(`Fastest patch: ${stats.fastestPatchMs}ms`);
console.log(`Slowest patch: ${stats.slowestPatchMs}ms`);
console.log(`Total time: ${stats.totalDurationMs}ms`);

// Get detailed history with timing for each patch
const history = wrapper.getPatchHistory();
history.forEach(entry => {
    if (entry.action === "apply" && entry.durationMs !== undefined) {
        console.log(`${entry.patch.id}: ${entry.durationMs}ms`);
    }
});
```

Performance metrics help identify:
- Slow patch applications that may indicate complex transformations
- Performance regressions when updating the transpiler or patch logic
- Opportunities to optimize hot-reload performance
- Baseline metrics for integration testing
- Outliers through percentile analysis (p90, p99) that reveal edge cases

## Registry Lifecycle Hooks

The runtime wrapper provides a unified event system for tracking all registry changes through the `onChange` listener. This enables reactive patterns, debugging tools, and integration with external monitoring systems.

### Event Types

The `onChange` listener receives one of four event types:

#### `patch-applied`
Emitted when a patch is successfully applied to the registry.

```javascript
{
    type: "patch-applied",
    patch: Patch,         // The applied patch object
    version: number       // Registry version after application
}
```

#### `patch-undone`
Emitted when a patch is successfully undone via `wrapper.undo()`.

```javascript
{
    type: "patch-undone",
    patch: { kind, id },  // Metadata about the undone patch
    version: number       // Registry version after undo
}
```

#### `patch-rolled-back`
Emitted when a patch is applied but then automatically rolled back due to an error.

```javascript
{
    type: "patch-rolled-back",
    patch: Patch,         // The failed patch object
    version: number,      // Registry version after rollback
    error: string         // Error message that caused the rollback
}
```

**Note:** This event is only emitted when an actual rollback occurs (i.e., after a patch was applied and then failed). Validation failures that occur before patch application do not emit rollback events.

#### `registry-cleared`
Emitted when the entire registry is cleared via `wrapper.clearRegistry()`.

```javascript
{
    type: "registry-cleared",
    version: number       // New registry version after clearing
}
```

### Usage Example

```javascript
import { createRuntimeWrapper } from "@prettier-plugin-gml/runtime-wrapper";

const auditLog: Array<unknown> = [];

const wrapper = createRuntimeWrapper({
    onChange: (event) => {
        auditLog.push({
            timestamp: Date.now(),
            ...event
        });

        switch (event.type) {
            case "patch-applied":
                console.log(`✓ Applied ${event.patch.id} (v${event.version})`);
                break;
            case "patch-undone":
                console.log(`↶ Undone ${event.patch.id} (v${event.version})`);
                break;
            case "patch-rolled-back":
                console.error(`✗ Rollback ${event.patch.id}: ${event.error}`);
                break;
            case "registry-cleared":
                console.log(`⌧ Registry cleared (v${event.version})`);
                break;
        }
    }
});

// All registry changes trigger onChange events
wrapper.applyPatch({ kind: "script", id: "script:a", js_body: "return 1;" });
wrapper.applyPatch({ kind: "script", id: "script:b", js_body: "return 2;" });
wrapper.undo();
wrapper.clearRegistry();

console.log(`Audit log contains ${auditLog.length} events`);
```

### Integration Patterns

The lifecycle hooks enable several useful patterns:

**State synchronization:**
```javascript
const wrapper = createRuntimeWrapper({
    onChange: (event) => {
        // Sync registry state to external store
        if (event.type === "patch-applied") {
            stateManager.notify("patch", event.patch.id);
        }
    }
});
```

**Debugging and diagnostics:**
```javascript
const wrapper = createRuntimeWrapper({
    onChange: (event) => {
        // Log all changes for debugging
        debugLogger.trace("Registry change", event);
        
        // Emit metrics
        if (event.type === "patch-rolled-back") {
            metrics.increment("patch.rollback");
        }
    }
});
```

**UI updates:**
```javascript
const wrapper = createRuntimeWrapper({
    onChange: (event) => {
        // Update HUD overlay in browser
        updateHUD({
            lastEvent: event.type,
            version: event.version,
            timestamp: Date.now()
        });
    }
});
```

## Status

The module implements core patch application, diagnostic capabilities, performance instrumentation, WebSocket integration, and registry lifecycle hooks. The change event system provides a unified way to observe all registry mutations for debugging, monitoring, and reactive integration patterns.
