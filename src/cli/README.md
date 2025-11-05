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
5. (Future) Streams patches to runtime wrapper via WebSocket

```bash
# Basic usage - watch current directory
node src/cli/src/cli.js watch

# Watch specific directory with verbose output
node src/cli/src/cli.js watch /path/to/project --verbose

# Skip runtime download (useful in CI environments)
GML_RUNTIME_SKIP_DOWNLOAD=1 node src/cli/src/cli.js watch /path/to/project
```

**Options:**
- `[targetPath]` - Directory to watch (default: current directory)
- `--extensions <ext...>` - File extensions to watch (default: `.gml`)
- `--polling` - Use polling instead of native file watching
- `--polling-interval <ms>` - Polling interval in milliseconds (default: 1000)
- `--verbose` - Enable verbose logging with detailed transpilation output
- `--runtime-ref <ref>` - Git reference for HTML5 runtime
- `--runtime-repo <owner/name>` - Repository hosting HTML5 runtime
- `--runtime-cache <path>` - Override runtime cache directory
- `--force-runtime-refresh` - Force re-download of runtime archive

**Environment Variables:**
- `GML_RUNTIME_SKIP_DOWNLOAD` - Set to `1` to skip runtime download (useful for testing transpilation only)

**Example Output:**

```
Watching: /path/to/project
Extensions: .gml
Mode: native

Waiting for file changes... (Press Ctrl+C to stop)

[2025-11-05T18:28:54.771Z] change: example.gml
  ↳ Read 7 lines
  ↳ Transpiled to JavaScript (97 chars)
  ↳ Patch ID: gml/script/example
```

**Hot-Reload Integration:**

The watch command now integrates with the transpiler module (`src/transpiler`) to generate JavaScript patches on file changes. Each patch contains:

- `kind`: "script" (or "event" in future iterations)
- `id`: Symbol identifier (e.g., `gml/script/my_script`)
- `js_body`: Transpiled JavaScript code
- `sourceText`: Original GML source for debugging
- `version`: Timestamp of transpilation

**Current Status:**

✅ File watching (native and polling modes)
✅ Change detection and file reading
✅ GML → JavaScript transpilation
✅ Patch generation with script IDs
✅ Runtime context initialization
✅ Basic error handling and logging

🚧 Future Enhancements:
- Semantic analysis integration for scope-aware transpilation
- Dependency tracking to rebuild dependent scripts
- WebSocket streaming to runtime wrapper
- Event transpilation (not just scripts)
- Shader and asset hot-reloading

### `generate-gml-identifiers` - Generate Identifier Metadata

Generates GML identifier metadata from the GameMaker manual repository.

```bash
node src/cli/src/cli.js generate-gml-identifiers
```

**Options:**
- `--ref <branch|tag|commit>` - Target specific manual revision
- `--force-refresh` - Bypass cached downloads

### `generate-feather-metadata` - Generate Feather Metadata

Generates Feather metadata for GameMaker's static analysis.

```bash
node src/cli/src/cli.js generate-feather-metadata
```

**Options:**
- `--ref <branch|tag|commit>` - Target specific manual revision
- `--force-refresh` - Bypass cached downloads

### `runtime-fetch` - Download HTML5 Runtime

Downloads and caches the GameMaker HTML5 runtime for hot-reload development.

```bash
node src/cli/src/cli.js runtime-fetch
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
│  │  • Transpiler coordination ✅ NEW                     │  │
│  │  • Patch generation ✅ NEW                            │  │
│  │  • Runtime context management                         │  │
│  └───────────────────────────────────────────────────────┘  │
│                            ↓                                │
│  ┌───────────────────────────────────────────────────────┐  │
│  │              Transpiler Integration                   │  │
│  │  • GML → JavaScript conversion ✅                     │  │
│  │  • Patch object generation ✅                         │  │
│  │  • Error handling ✅                                  │  │
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
          │  Runtime Wrapper (future)      │
          │  • Patch application           │
          │  • Hot function swapping       │
          │  • State preservation          │
          └────────────────────────────────┘
```

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

# Start watching (skip runtime download for faster testing)
GML_RUNTIME_SKIP_DOWNLOAD=1 node src/cli/src/cli.js watch /tmp/gml-test --verbose

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

## Integration with Other Modules

### Parser (`src/parser`)
Provides ANTLR-based GML parsing used by the transpiler.

### Transpiler (`src/transpiler`)
✅ **Now integrated** - Converts GML AST to JavaScript for hot-reload patches.

### Semantic (`src/semantic`)
🚧 Future - Will provide scope analysis and dependency tracking.

### Runtime Wrapper (`src/runtime-wrapper`)
🚧 Future - Will receive and apply patches via WebSocket.

### Refactor (`src/refactor`)
🚧 Future - Will coordinate with watch command for safe renames.

## References

- [Live Reloading Concept](../../docs/live-reloading-concept.md) - Overall hot-reload architecture
- [Semantic Scope Plan](../../docs/semantic-scope-plan.md) - Semantic analysis integration
- [Transpiler README](../transpiler/README.md) - GML → JavaScript transpilation details
- [Runtime Wrapper README](../runtime-wrapper/README.md) - Patch application and hot-swapping

## Change Log

### Recent Updates

- **2025-11-05**: Integrated transpiler into watch command for hot-reload pipeline
  - Watch command now transpiles GML files to JavaScript on change
  - Generates patch objects with script IDs
  - Added verbose logging for transpilation details
  - Added test coverage for transpilation integration
  - Stores patches in runtime context for future streaming
