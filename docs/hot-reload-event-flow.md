# Hot Reload Event Flow and Architecture

This document describes the complete event flow of the hot reload integration loop, from file change detection through to runtime patch application.

## System Components

### 1. CLI Watch Command (`src/cli/src/commands/watch.ts`)
- Monitors filesystem for GML file changes
- Coordinates transpilation pipeline
- Manages WebSocket server lifecycle
- Tracks transpilation metrics and errors

### 2. Transpiler (`src/transpiler/`)
- Parses GML source code using ANTLR4 grammar
- Converts AST to JavaScript
- Generates patch objects with metadata
- Provides semantic analysis hooks

### 3. WebSocket Server (`src/cli/src/modules/websocket/server.ts`)
- Broadcasts patches to connected clients
- Manages client connections and reconnections
- Replays latest patches to new subscribers
- Handles error notifications

### 4. Runtime Wrapper (`src/runtime-wrapper/`)
- WebSocket client for receiving patches
- Validates and applies patches safely
- Maintains hot registry of patched functions
- Preserves game state during updates

## Complete Event Flow

### Phase 1: Initialization

```
┌─────────────────────────────────────────┐
│  1. User starts watch command          │
│     $ npm run demo:watch                │
└────────────────┬────────────────────────┘
                 │
                 ▼
┌─────────────────────────────────────────┐
│  2. CLI initializes components:         │
│     • Create transpiler instance        │
│     • Start WebSocket server (17890)    │
│     • Setup filesystem watcher          │
│     • Initialize runtime context        │
└────────────────┬────────────────────────┘
                 │
                 ▼
┌─────────────────────────────────────────┐
│  3. System ready and waiting:           │
│     ✓ WebSocket server listening        │
│     ✓ Watching target directory         │
│     ✓ Ready to transpile changes        │
└─────────────────────────────────────────┘
```

### Phase 2: File Change Detection

```
┌─────────────────────────────────────────┐
│  1. Developer edits GML file:           │
│     player_movement.gml                 │
│     - Changes move_speed from 5 to 10  │
└────────────────┬────────────────────────┘
                 │
                 ▼
┌─────────────────────────────────────────┐
│  2. Filesystem watcher triggers:        │
│     Event: "change"                     │
│     File: player_movement.gml           │
│     Path: /full/path/to/file.gml        │
└────────────────┬────────────────────────┘
                 │
                 ▼
┌─────────────────────────────────────────┐
│  3. Debouncing (default 200ms):         │
│     • Wait for rapid successive changes │
│     • Prevents duplicate transpilations │
│     • Flushes on final change           │
└────────────────┬────────────────────────┘
                 │
                 ▼
┌─────────────────────────────────────────┐
│  4. File change handler invoked:        │
│     handleFileChange(filePath, "change")│
└─────────────────────────────────────────┘
```

### Phase 3: Transpilation

```
┌─────────────────────────────────────────┐
│  1. Read file content:                  │
│     const content = readFile(filePath)  │
│     Lines: 30                           │
│     Size: 573 bytes                     │
└────────────────┬────────────────────────┘
                 │
                 ▼
┌─────────────────────────────────────────┐
│  2. Generate symbol ID:                 │
│     fileName = "player_movement"        │
│     symbolId = "gml/script/player_move.."│
└────────────────┬────────────────────────┘
                 │
                 ▼
┌─────────────────────────────────────────┐
│  3. Parse GML source:                   │
│     parser = new GMLParser(content)     │
│     ast = parser.parse()                │
│     • Lexical analysis                  │
│     • Syntax tree construction          │
│     • Comment extraction                │
└────────────────┬────────────────────────┘
                 │
                 ▼
┌─────────────────────────────────────────┐
│  4. Emit JavaScript:                    │
│     emitter = new GmlToJsEmitter()      │
│     jsBody = emitter.emit(ast)          │
│     • Variable scoping                  │
│     • Operator translation              │
│     • Function call mapping             │
└────────────────┬────────────────────────┘
                 │
                 ▼
┌─────────────────────────────────────────┐
│  5. Create patch object:                │
│     {                                   │
│       kind: "script",                   │
│       id: "gml/script/player_movement", │
│       js_body: "var move_speed = 10...",│
│       sourceText: "...",                │
│       version: 1735041234567            │
│     }                                   │
└────────────────┬────────────────────────┘
                 │
                 ▼
┌─────────────────────────────────────────┐
│  6. Validate patch:                     │
│     • Check required fields             │
│     • Verify js_body is non-empty       │
│     • Validate patch structure          │
└────────────────┬────────────────────────┘
                 │
                 ▼
┌─────────────────────────────────────────┐
│  7. Store metrics:                      │
│     Duration: 106.16ms                  │
│     Source: 573 bytes                   │
│     Output: 329 bytes                   │
│     Compression: 56.9%                  │
└────────────────┬────────────────────────┘
                 │
                 ▼
┌─────────────────────────────────────────┐
│  8. Cache successful patch:             │
│     lastSuccessfulPatches.set(          │
│       symbolId, patch                   │
│     )                                   │
└─────────────────────────────────────────┘
```

### Phase 4: Patch Broadcasting

```
┌─────────────────────────────────────────┐
│  1. Serialize patch to JSON:            │
│     message = JSON.stringify(patch)     │
└────────────────┬────────────────────────┘
                 │
                 ▼
┌─────────────────────────────────────────┐
│  2. Broadcast to all clients:           │
│     for (client of connectedClients) {  │
│       client.send(message)              │
│     }                                   │
└────────────────┬────────────────────────┘
                 │
                 ▼
┌─────────────────────────────────────────┐
│  3. Track broadcast result:             │
│     successCount: 1                     │
│     failureCount: 0                     │
└────────────────┬────────────────────────┘
                 │
                 ▼
┌─────────────────────────────────────────┐
│  4. Log to console:                     │
│     ✓ Generated patch: gml/script/...   │
│     ✓ Streamed to 1 client(s)           │
└─────────────────────────────────────────┘
```

### Phase 5: Client Reception

```
┌─────────────────────────────────────────┐
│  1. Browser WebSocket receives message: │
│     ws.onmessage = (event) => {...}     │
│     data = event.data                   │
└────────────────┬────────────────────────┘
                 │
                 ▼
┌─────────────────────────────────────────┐
│  2. Parse JSON payload:                 │
│     patch = JSON.parse(data)            │
└────────────────┬────────────────────────┘
                 │
                 ▼
┌─────────────────────────────────────────┐
│  3. Validate patch candidate:           │
│     • Check patch structure             │
│     • Verify required fields            │
│     • Validate patch kind               │
└────────────────┬────────────────────────┘
                 │
                 ▼
┌─────────────────────────────────────────┐
│  4. Optional shadow testing:            │
│     if (options.validateBeforeApply) {  │
│       testPatchInShadow(patch)          │
│     }                                   │
└────────────────┬────────────────────────┘
                 │
                 ▼
┌─────────────────────────────────────────┐
│  5. Apply patch to registry:            │
│     applyPatch(patch)                   │
└─────────────────────────────────────────┘
```

### Phase 6: Runtime Application

```
┌─────────────────────────────────────────┐
│  1. Capture snapshot for undo:          │
│     snapshot = captureSnapshot(         │
│       registry, patch                   │
│     )                                   │
└────────────────┬────────────────────────┘
                 │
                 ▼
┌─────────────────────────────────────────┐
│  2. Create JavaScript function:         │
│     fn = new Function(                  │
│       'self', 'other', 'args',          │
│       patch.js_body                     │
│     )                                   │
└────────────────┬────────────────────────┘
                 │
                 ▼
┌─────────────────────────────────────────┐
│  3. Install in hot registry:            │
│     registry.scripts[patch.id] = fn     │
│     registry.version++                  │
└────────────────┬────────────────────────┘
                 │
                 ▼
┌─────────────────────────────────────────┐
│  4. Update undo stack:                  │
│     undoStack.push(snapshot)            │
└────────────────┬────────────────────────┘
                 │
                 ▼
┌─────────────────────────────────────────┐
│  5. Record in patch history:            │
│     patchHistory.push({                 │
│       patch: { kind, id },              │
│       version: registry.version,        │
│       timestamp: Date.now(),            │
│       action: "apply",                  │
│       durationMs: elapsed               │
│     })                                  │
└────────────────┬────────────────────────┘
                 │
                 ▼
┌─────────────────────────────────────────┐
│  6. Invoke callback:                    │
│     if (onPatchApplied) {               │
│       onPatchApplied(patch, version)    │
│     }                                   │
└────────────────┬────────────────────────┘
                 │
                 ▼
┌─────────────────────────────────────────┐
│  7. Update UI indicators:               │
│     • Increment patch count             │
│     • Update version number             │
│     • Add log entry                     │
│     • Update last update time           │
└─────────────────────────────────────────┘
```

### Phase 7: Runtime Execution

```
┌─────────────────────────────────────────┐
│  1. Game calls script:                  │
│     gml_call_script(                    │
│       "player_movement", self, other    │
│     )                                   │
└────────────────┬────────────────────────┘
                 │
                 ▼
┌─────────────────────────────────────────┐
│  2. Check hot registry first:           │
│     fn = registry.scripts[id]           │
│     if (fn) return fn(self, other, args)│
└────────────────┬────────────────────────┘
                 │
                 ▼
┌─────────────────────────────────────────┐
│  3. Execute patched function:           │
│     • Uses updated move_speed = 10      │
│     • Preserves instance state          │
│     • No game restart required          │
└────────────────┬────────────────────────┘
                 │
                 ▼
┌─────────────────────────────────────────┐
│  4. Game continues with new logic:      │
│     • Player moves at new speed         │
│     • All state preserved               │
│     • Instant feedback to developer     │
└─────────────────────────────────────────┘
```

## Error Handling

### Transpilation Errors

```
Parse Error
    ↓
Create Error Notification
    ↓
Broadcast to Clients
    ↓
Display in Browser Log
    ↓
Continue Watching
```

### Patch Application Errors

```
Invalid Patch
    ↓
Validate Failure
    ↓
Log Error Message
    ↓
Preserve Previous Version
    ↓
Notify User
```

### WebSocket Connection Errors

```
Connection Lost
    ↓
Update Status Indicator
    ↓
Wait 800ms
    ↓
Attempt Reconnect
    ↓
Replay Latest Patches
```

## Performance Characteristics

### Typical Timings

| Phase                  | Duration      | Notes                        |
|------------------------|---------------|------------------------------|
| File change detection  | < 1ms         | Native OS events             |
| Debounce delay         | 200ms         | Configurable                 |
| File read              | 1-5ms         | Depends on file size         |
| Parsing                | 10-50ms       | Depends on complexity        |
| JavaScript emission    | 5-20ms        | AST traversal                |
| Patch validation       | < 1ms         | Field checks                 |
| WebSocket broadcast    | 1-2ms         | Local network                |
| Client reception       | < 1ms         | JSON parsing                 |
| Runtime application    | 1-2ms         | Function creation            |
| **Total (typical)**    | **220-280ms** | From edit to live update     |

### Optimization Strategies

1. **Debouncing** - Prevents redundant transpilations during rapid edits
2. **Caching** - Successful patches cached for replay to late subscribers
3. **Incremental Updates** - Only changed files are retranspiled
4. **Streaming** - WebSocket broadcasts patches immediately after generation
5. **Shadow Testing** - Optional validation without affecting main registry

## State Management

### CLI Watch Context

```typescript
{
  transpiler: GmlTranspiler,
  patches: Array<Patch>,           // Recent patches (bounded)
  metrics: Array<Metrics>,          // Transpilation stats
  errors: Array<Error>,             // Recent errors
  lastSuccessfulPatches: Map<ID, Patch>,  // For replay
  websocketServer: ServerController,
  debouncedHandlers: Map<Path, Handler>
}
```

### Runtime Registry

```typescript
{
  version: number,                  // Increments on each patch
  scripts: Map<ID, Function>,       // Patched script functions
  events: Map<Key, Function>,       // Patched event handlers
  undoStack: Array<Snapshot>,       // For rollback
  patchHistory: Array<Entry>        // Audit trail
}
```

## Integration Points

### GameMaker Runtime Hooks

The runtime wrapper intercepts these entry points:

```javascript
// Original GameMaker dispatcher
function gml_call_script(id, self, other, args) {
    return __compiled_scripts[id](self, other, args);
}

// Hot-reload wrapper
function gml_call_script(id, self, other, args) {
    const fn = __hot.scripts[id] || __compiled_scripts[id];
    return fn(self, other, args);
}
```

### Custom Integration

Projects can expose runtime helpers:

```javascript
window.__gm = {
    call_script: gml_call_script,
    dispatch_event: gml_dispatch_event,
    reload_shader: (name, vs, fs) => { /* ... */ },
    reload_sprite: (name, frames, meta) => { /* ... */ }
};
```

## Testing

The hot reload pipeline has comprehensive test coverage:

1. **Unit Tests** - Individual component behavior
2. **Integration Tests** - End-to-end patch streaming
3. **Replay Tests** - Late subscriber patch replay
4. **Error Recovery Tests** - Handling malformed patches
5. **Performance Tests** - Transpilation benchmarks

See `src/cli/test/hot-reload-*.test.ts` for examples.

## Future Enhancements

Potential improvements to the hot reload loop:

- [ ] Semantic analysis integration for dependency tracking
- [ ] Incremental rebuilds for dependent scripts
- [ ] Source map generation for debugging
- [ ] Shader hot reloading
- [ ] Asset hot reloading (sprites, sounds)
- [ ] Macro and enum constant updates
- [ ] Breakpoint preservation across patches
- [ ] Multi-room state preservation
- [ ] Patch rollback UI
- [ ] Browser DevTools integration

## References

- [Live Reloading Concept](./live-reloading-concept.md) - Complete architecture
- [Hot Reload Integration Example](./hot-reload-integration-example.md) - API reference
- [Watch Command Source](../src/cli/src/commands/watch.ts) - Implementation
- [Transpiler Source](../src/transpiler/) - GML to JS conversion
- [Runtime Wrapper Source](../src/runtime-wrapper/) - Client-side application
- [Demo](../vendor/3DSpider/) - Working end-to-end example
