# Prettier Plugin GML - CLI Package

Command-line interface for the prettier-plugin-gml project. Provides utilities for formatting GameMaker Language files, watching for changes, generating metadata, and coordinating the hot-reload development pipeline.

## Commands

### `format` - Format GML Files

Wraps the Prettier plugin to format GameMaker Language files with enhanced diagnostics and error handling.

```bash
node src/cli/src/cli.js format path/to/project --extensions .gml
```

**Options:**
- `--extensions <ext...>` - File extensions to format (default: `.gml`)
- `--check` - Check if files are formatted without writing changes
- `--log-level <level>` - Set Prettier log level (debug, info, warn, error, silent)
- `--on-parse-error <action>` - How to handle parse errors (skip, revert, abort)
- `--ignored-file-sample-limit <n>` - Limit ignored file samples in output
- `--unsupported-extension-sample-limit <n>` - Limit unsupported extension samples

**Environment Variables:**
- `PRETTIER_PLUGIN_GML_DEFAULT_EXTENSIONS` - Default extensions when flag omitted
- `PRETTIER_PLUGIN_GML_LOG_LEVEL` - Default log level
- `PRETTIER_PLUGIN_GML_ON_PARSE_ERROR` - Default parse error strategy

### `watch` - Monitor Files for Hot-Reload Pipeline

**NEW**: Now integrated with the transpiler to generate JavaScript patches when GML files change.

Watches GML source files and coordinates the hot-reload development pipeline. When files change, the command:

1. Detects file system changes (native or polling)
2. Reads modified GML source code
3. **Transpiles GML to JavaScript** using the transpiler module
4. Generates hot-reload patches with script IDs
5. Streams patches to runtime wrapper via WebSocket

```bash
# Basic usage - watch current directory
node src/cli/src/cli.js watch

# Watch specific directory with verbose output
node src/cli/src/cli.js watch /path/to/project --verbose

# Auto-inject hot-reload runtime and start watching
node src/cli/src/cli.js watch /path/to/project --auto-inject
```

**Options:**
- `[targetPath]` - Directory to watch (default: current directory)
- `--extensions <ext...>` - File extensions to watch (default: `.gml`)
- `--polling` - Use polling instead of native file watching
- `--polling-interval <ms>` - Polling interval in milliseconds (default: 1000)
- `--verbose` - Enable verbose logging with detailed transpilation output
- `--quiet` - Suppress non-essential output (only show errors and server URLs); useful for CI/CD or background processes
- `--debounce-delay <ms>` - Delay in milliseconds before transpiling after file changes (default: 200, set to 0 to disable debouncing)
- `--max-patch-history <count>` - Maximum number of patches to retain in memory (default: 100)
- `--websocket-port <port>` - WebSocket server port for streaming patches (default: 17890)
- `--websocket-host <host>` - WebSocket server host for streaming patches (default: 127.0.0.1)
- `--no-websocket-server` - Disable WebSocket server for patch streaming
- `--status-port <port>` - HTTP status server port for querying watch command status (default: 17891)
- `--status-host <host>` - HTTP status server host for querying watch command status (default: 127.0.0.1)
- `--no-status-server` - Disable HTTP status server
- `--runtime-root <path>` - Path to the HTML5 runtime assets
- `--runtime-package <name>` - Package name for the HTML5 runtime (default: gamemaker-html5)
- `--no-runtime-server` - Disable starting the HTML5 runtime static server
- `--auto-inject` - **NEW**: Automatically inject the hot-reload runtime wrapper into the HTML5 output directory before starting the watcher (default: false)
- `--html5-output <path>` - Path to the HTML5 output directory for auto-injection (overrides auto-detection; used with `--auto-inject`)
- `--gm-temp-root <path>` - Root directory for GameMaker HTML5 temporary outputs (default: `/private/tmp/GameMakerStudio2/GMS2TEMP`; used with `--auto-inject`)

**Note:** The `--verbose` and `--quiet` flags cannot be used together.

**Example Output:**

```
Watching: /path/to/project
Extensions: .gml
Mode: native

WebSocket patch server ready at ws://127.0.0.1:17890

Waiting for file changes... (Press Ctrl+C to stop)

[2025-11-05T18:28:54.771Z] change: example.gml
  ↳ Read 7 lines
  ↳ Transpiled to JavaScript (234 chars in 2.45ms)
  ↳ Generated patch: gml/script/example
  ↳ Streamed to 1 client(s)
  
^C
--- Transpilation Statistics ---
Total patches generated: 15
Total transpilation time: 42.13ms
Average transpilation time: 2.81ms
Total source processed: 12.45 KB
Total output generated: 8.23 KB
Output/source ratio: 66.1%
Fastest transpilation: 1.23ms (simple_script.gml)
Slowest transpilation: 5.67ms (complex_script.gml)
-------------------------------
```

**Automatic Hot-Reload Setup:**

The `--auto-inject` flag streamlines the development workflow by automatically preparing the hot-reload environment before starting the watcher. This eliminates the need to manually run `prepare-hot-reload` as a separate step:

```bash
# Traditional two-step workflow (still supported):
node src/cli/src/cli.js prepare-hot-reload --html5-output /path/to/output
node src/cli/src/cli.js watch /path/to/project

# Streamlined one-step workflow with --auto-inject:
node src/cli/src/cli.js watch /path/to/project --auto-inject

# Specify custom HTML5 output directory:
node src/cli/src/cli.js watch /path/to/project --auto-inject --html5-output /path/to/output

# Use custom WebSocket port for both injection and server:
node src/cli/src/cli.js watch /path/to/project --auto-inject --websocket-port 18000
```

When `--auto-inject` is enabled, the watch command will:
1. Locate the most recent GameMaker HTML5 output (or use the path specified with `--html5-output`)
2. Copy the runtime wrapper assets into the output directory
3. Inject the WebSocket client bootstrap snippet into `index.html`
4. Start the file watcher and WebSocket server

The WebSocket URL injected into the HTML5 output will match the `--websocket-host` and `--websocket-port` options, ensuring seamless connectivity between the game and the watcher.

**Debouncing File Changes:**

The watch command includes intelligent debouncing to prevent unnecessary transpilations when files change rapidly (e.g., during IDE auto-save or when making multiple quick edits). By default, the watcher waits 200ms after the last file change before transpiling, which:

- **Reduces system load** - Only transpiles once per burst of edits instead of on every keystroke
- **Minimizes WebSocket traffic** - Sends one patch instead of many rapid updates
- **Improves user experience** - Provides smoother hot-reload without flicker
- **Prevents race conditions** - Avoids overlapping transpilations of the same file

Configure the debounce delay with `--debounce-delay`:

```bash
# Use default 200ms debounce
node src/cli/src/cli.js watch

# Increase debounce for slower systems
node src/cli/src/cli.js watch --debounce-delay 500

# Disable debouncing (transpile immediately on every change)
node src/cli/src/cli.js watch --debounce-delay 0
```

When the watch command stops (via Ctrl+C or abort signal), any pending debounced transpilations are flushed immediately to ensure no work is lost.

**Quiet Mode:**

For CI/CD pipelines, automated testing, or when running the watcher in the background, use `--quiet` to suppress non-essential output:

```bash
# Quiet mode - only shows server URLs and errors
node src/cli/src/cli.js watch --quiet

# Example output in quiet mode:
# Runtime static server ready at http://127.0.0.1:51234
# WebSocket patch server ready at ws://127.0.0.1:17890
# 
# (transpilation happens silently, only errors are shown)
# Error: Transpilation failed: Unexpected token at line 5
```

Quiet mode is particularly useful for:
- CI/CD pipelines where verbose output clutters logs
- Background processes where you only care about errors
- Automated testing environments
- Production-like monitoring setups

**Status Server:**

The watch command includes an HTTP status server that provides real-time metrics and monitoring without interrupting the watch process. The status server exposes multiple JSON endpoints for different monitoring use cases, from lightweight connectivity checks to comprehensive health status.

```bash
# Start watch command (status server runs on port 17891 by default)
node src/cli/src/cli.js watch /path/to/project
```

**Available Endpoints:**

**`GET /status`** - Comprehensive runtime status with detailed metrics

```bash
curl http://127.0.0.1:17891/status

# Example response:
{
  "uptime": 125430,
  "patchCount": 42,
  "errorCount": 2,
  "recentPatches": [
    {
      "id": "gml/script/player_move",
      "timestamp": 1703890145123,
      "durationMs": 2.34,
      "filePath": "player_move.gml"
    },
    ...
  ],
  "recentErrors": [
    {
      "timestamp": 1703890100456,
      "filePath": "broken_script.gml",
      "error": "Unexpected token at line 5"
    }
  ],
  "websocketClients": 1
}
```

**`GET /health`** - Health check with component status (for monitoring systems)

```bash
curl http://127.0.0.1:17891/health

# Example response:
{
  "status": "healthy",
  "timestamp": 1703890200000,
  "uptime": 125430,
  "checks": {
    "transpilation": {
      "status": "pass",
      "patchCount": 42,
      "errorCount": 2
    },
    "websocket": {
      "status": "pass",
      "clients": 1
    }
  }
}
```

**`GET /ping`** - Lightweight connectivity check (minimal overhead)

```bash
curl http://127.0.0.1:17891/ping

# Example response:
{
  "status": "ok",
  "timestamp": 1703890200000
}
```

**`GET /ready`** - Readiness probe (for Kubernetes/container orchestration)

```bash
curl http://127.0.0.1:17891/ready

# Example response when ready:
{
  "ready": true,
  "timestamp": 1703890200000,
  "uptime": 125430
}

# Returns HTTP 503 when not ready (excessive errors)
```

**Endpoint Comparison:**

| Endpoint | Purpose | Response Size | Use Case |
|----------|---------|---------------|----------|
| `/status` | Full metrics | Large | Monitoring dashboards, debugging |
| `/health` | Health checks | Medium | Monitoring systems (Prometheus, Datadog) |
| `/ping` | Connectivity | Minimal | Load balancers, simple health checks |
| `/ready` | Readiness | Small | Kubernetes readiness probes, orchestration |

**Status Endpoint Fields:**
- `uptime`: Milliseconds since the watch command started
- `patchCount`: Total number of patches generated successfully
- `errorCount`: Total number of transpilation errors encountered
- `recentPatches`: Array of the last 10 successful patches with metadata
- `recentErrors`: Array of the last 10 errors with details
- `websocketClients`: Number of currently connected WebSocket clients

**Use Cases:**
- **Health Monitoring**: Integration with monitoring tools (Prometheus, Datadog, etc.) via `/health`
- **Load Balancing**: Use `/ping` for lightweight health checks in load balancer configurations
- **Container Orchestration**: Kubernetes readiness/liveness probes using `/ready` and `/health`
- **CI/CD Pipelines**: Automated tests can verify the watch command is processing files via `/status`
- **Debugging**: Quickly inspect recent patches and errors without restarting the watcher
- **Dashboard Integration**: Build custom monitoring dashboards for development teams

**Configuration:**
```bash
# Use custom port
node src/cli/src/cli.js watch --status-port 8080

# Disable status server
node src/cli/src/cli.js watch --no-status-server
```

**Hot-Reload Integration:**

The watch command now integrates with the transpiler module (`src/transpiler`) to generate JavaScript patches on file changes. Each patch contains:

- `kind`: "script" (or "event" in future iterations)
- `id`: Symbol identifier (e.g., `gml/script/my_script`)
- `js_body`: Transpiled JavaScript code
- `sourceText`: Original GML source for debugging
- `version`: Timestamp of transpilation

**Planned: Semantic Analysis Integration**

Future iterations will integrate with the semantic analyzer (`src/semantic`) to enable dependency-aware hot-reload:

1. Parse changed files to extract AST
2. Analyze files semantically to identify symbol definitions and references
3. Track project-wide dependency graph (which scripts call which)
4. When a file changes, automatically re-transpile dependent scripts
5. Coordinate invalidation cascades through the dependency graph

This integration requires expanding the semantic package's public API to export `ScopeTracker` or providing an alternative coordinator interface. The current design intentionally keeps `ScopeTracker` internal to enforce use of higher-level semantic coordinators.

**Error Recovery and Resilience:**

The watch command includes robust error handling to maintain stability:

- **Graceful Degradation**: Transpilation errors don't stop the watcher. When a file fails to transpile, the error is logged and the watcher continues monitoring other files.
- **Error Notifications**: Failed transpilations send error notifications to connected WebSocket clients with the format `{ kind: "error", filePath, error, timestamp }`.
- **Patch Validation**: All patches are validated before broadcast to ensure they contain valid data (non-empty JavaScript body, proper structure).
- **Last Successful Patch Tracking**: The system stores the last successful patch for each script, enabling potential rollback scenarios.
- **Error Metrics**: Errors are tracked alongside successful transpilations, with statistics displayed when the watcher stops.
- **Statistics Summary**: On exit, the watch command displays both success metrics (patches generated, transpilation time) and error metrics (total errors, recent error details in verbose mode).

**Current Status:**

✅ File watching (native and polling modes)
✅ Change detection and file reading
✅ GML → JavaScript transpilation
✅ Patch generation with script IDs
✅ Runtime context initialization
✅ WebSocket server for patch streaming
✅ Real-time patch broadcast to connected clients
✅ **Transpilation metrics tracking** ✨
✅ **Performance statistics on watch stop** ✨

### `prepare-hot-reload` - Inject Runtime Wrapper

Injects the hot-reload runtime wrapper into the most recent GameMaker HTML5 output
so the running game connects to the patch server automatically.

```bash
# Inject into the latest HTML5 output
node src/cli/src/cli.js prepare-hot-reload

# Inject into a specific HTML5 output directory
node src/cli/src/cli.js prepare-hot-reload --html5-output /path/to/html5/output
```

**Options:**
- `--html5-output <path>` - Path to the HTML5 output directory
- `--gm-temp-root <path>` - Root directory for GameMaker HTML5 temp outputs
- `--websocket-url <url>` - WebSocket URL for hot-reload patches
- `--force` - Re-inject even if snippet already exists
- `--quiet` - Suppress informational output

When GameMaker is running the HTML5 server, the command auto-detects the active
`-root` folder from the GMWebServ process and targets that output first.
✅ **Configurable patch history limit** ✨
✅ **Error recovery and graceful degradation** ✨
✅ **Patch validation before broadcast** ✨
✅ **Error notifications to clients** ✨
✅ **Last successful patch tracking** ✨
✅ **Error statistics and reporting** ✨
✅ **Debounced file change handling** ✨
✅ **Quiet mode for CI/CD environments** ✨
✅ **HTTP status server for runtime monitoring** ✨ NEW

🚧 Future Enhancements:
- Semantic analysis integration for scope-aware transpilation
- Dependency tracking to rebuild dependent scripts
- Event transpilation (not just scripts)
- Shader and asset hot-reloading

### `generate-gml-identifiers` - Generate Identifier Metadata

Generates GML identifier metadata from the GameMaker manual repository.

```bash
node src/cli/src/cli.js generate-gml-identifiers
```

### `generate-feather-metadata` - Generate Feather Metadata

Generates Feather metadata for GameMaker's static analysis.

```bash
node src/cli/src/cli.js generate-feather-metadata
```

### `performance` - Run Performance Benchmarks

Executes performance benchmarks for parser, formatter, and other subsystems.

```bash
node src/cli/src/cli.js performance
```

### `memory` - Run Memory Benchmarks

Measures memory usage across various operations.

```bash
node src/cli/src/cli.js memory
```

## Architecture

The CLI package serves as the orchestration layer for the hot-reload development pipeline:

```
┌─────────────────────────────────────────────────────────────┐
│                         CLI (src/cli)                       │
│  ┌───────────────────────────────────────────────────────┐  │
│  │                   watch command                       │  │
│  │  • File system monitoring                             │  │
│  │  • Change detection                                   │  │
│  │  • Runtime context management                         │  │
│  │  • Server lifecycle coordination                      │  │
│  └───────────────────────────────────────────────────────┘  │
│                            ↓                                │
│  ┌───────────────────────────────────────────────────────┐  │
│  │       Transpilation Coordinator ✅ NEW                │  │
│  │  • Transpilation lifecycle management                 │  │
│  │  • Metrics tracking and statistics                    │  │
│  │  • Patch validation                                   │  │
│  │  • Error handling and recovery                        │  │
│  │  • WebSocket broadcast coordination                   │  │
│  └───────────────────────────────────────────────────────┘  │
│                            ↓                                │
│  ┌───────────────────────────────────────────────────────┐  │
│  │              WebSocket Server ✅                      │  │
│  │  • Real-time patch broadcasting                       │  │
│  │  • Client connection management                       │  │
│  │  • Automatic reconnection support                     │  │
│  └───────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
                           ↓
          ┌────────────────────────────────┐
          │   Transpiler (src/transpiler)  │
          │   • GML parsing                │
          │   • AST → JavaScript emission  │
          │   • Operator mapping           │
          └────────────────────────────────┘
                           ↓
          ┌────────────────────────────────┐
          │  Runtime Wrapper               │
          │  • WebSocket client ✅         │
          │  • Patch application ✅        │
          │  • Hot function swapping ✅    │
          │  • State preservation          │
          └────────────────────────────────┘
```

### Module Organization

The CLI package is organized into focused, single-responsibility modules:

**Commands** (`src/commands/`)
- `watch.ts` - File system monitoring and hot-reload orchestration
- `format.ts` - GML code formatting
- `generate-gml-identifiers.ts` - Identifier metadata generation
- `generate-feather-metadata.ts` - Feather metadata generation
- `performance.ts` - Performance benchmarking
- `memory.ts` - Memory profiling

**Modules** (`src/modules/`)
- `transpilation/` - Transpilation coordination and metrics tracking
- `websocket/` - WebSocket server for patch streaming
- `status/` - HTTP status server for runtime monitoring
- `runtime/` - HTML5 runtime integration
- `manual/` - GameMaker manual processing
- `feather/` - Feather metadata handling
- `performance/` - Performance measurement utilities
- `memory/` - Memory profiling utilities

## Development

### Running Tests

```bash
# All CLI tests
npm run test:cli

# Specific test file
node --test src/cli/test/watch-command.test.js

# Watch mode
npm run test:cli -- --watch
```

### Testing Watch Command

```bash
# Create a test directory
mkdir -p /tmp/gml-test
echo "var x = 10; show_debug_message(x);" > /tmp/gml-test/test.gml

# In another terminal, modify the file to see transpilation
echo "var y = 20;" >> /tmp/gml-test/test.gml
```

### Debugging Transpilation

To see the transpiled JavaScript output for a GML file:

```javascript
import { createTranspiler } from './src/transpiler/src/index.js';
import { readFile } from 'node:fs/promises';

const transpiler = createTranspiler();
const content = await readFile('path/to/script.gml', 'utf8');

const patch = await transpiler.transpileScript({
    sourceText: content,
    symbolId: 'gml/script/my_script'
});

console.log(patch.js_body);
```

### Transpilation Coordinator

The transpilation coordinator module (`src/modules/transpilation/coordinator.ts`) manages the complete transpilation lifecycle within the watch command:

**Key Responsibilities:**
- **Transpilation Lifecycle**: Coordinates the end-to-end process from GML source to validated JavaScript patches
- **Metrics Tracking**: Records transpilation duration, file sizes, line counts, and performance statistics
- **Error Management**: Handles transpilation failures gracefully with detailed error tracking
- **Patch Validation**: Ensures generated patches meet quality requirements before broadcasting
- **WebSocket Integration**: Coordinates patch broadcasting to connected runtime clients
- **Statistics Reporting**: Provides comprehensive statistics on watch command exit

**API:**

```typescript
import { transpileFile, displayTranspilationStatistics } from "@gml-modules/cli/modules/transpilation";

// Transpile a single file with lifecycle management
const result = transpileFile(
    context,      // TranspilationContext with transpiler and metrics storage
    filePath,     // Path to the GML file
    content,      // GML source code
    lines,        // Number of lines in the source
    { verbose, quiet }  // Output options
);

// Display statistics when watch stops
displayTranspilationStatistics(
    context,      // Context with metrics and errors
    verbose,      // Enable detailed statistics
    quiet         // Suppress all output
);
```

The coordinator is designed to be a focused, single-responsibility module that handles all transpilation orchestration concerns, keeping the watch command focused on file system monitoring and server lifecycle management.

## Integration with Other Modules

### Parser (`src/parser`)
Provides ANTLR-based GML parsing used by the transpiler.

### Transpiler (`src/transpiler`)
✅ **Integrated** - Converts GML AST to JavaScript for hot-reload patches.

### Semantic (`src/semantic`)
🚧 Future - Will provide scope analysis and dependency tracking.

### Runtime Wrapper (`src/runtime-wrapper`)
✅ **Ready** - Has WebSocket client and patch application, ready to receive patches.

### Refactor (`src/refactor`)
🚧 Future - Will coordinate with watch command for safe renames.

## References

- [Live Reloading Concept](../../docs/live-reloading-concept.md) - Overall hot-reload architecture
- [Semantic Scope Plan](../../docs/semantic-scope-plan.md) - Semantic analysis integration
- [Transpiler README](../transpiler/README.md) - GML → JavaScript transpilation details
- [Runtime Wrapper README](../runtime-wrapper/README.md) - Patch application and hot-swapping

## Change Log

### Recent Updates

- **2025-11-06**: Completed hot-reload integration loop
  - Added WebSocket server to watch command for real-time patch streaming
  - Integrated patch broadcasting to all connected runtime wrapper clients
  - Added connection management and client tracking
  - Created end-to-end integration test for patch delivery
  - Updated documentation with WebSocket configuration options
  - Watch command now provides complete hot-reload pipeline from file change to patch delivery
- **2025-11-05**: Integrated transpiler into watch command for hot-reload pipeline
  - Watch command now transpiles GML files to JavaScript on change
  - Generates patch objects with script IDs
  - Added verbose logging for transpilation details
  - Added test coverage for transpilation integration
  - Stores patches in runtime context for future streaming
