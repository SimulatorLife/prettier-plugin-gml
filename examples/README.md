# Examples

This directory contains example code and demonstrations for prettier-plugin-gml.

## Hot Reload Demo

The `hot-reload-demo/` directory contains a complete working example of the hot reload integration loop. This demonstrates how the CLI watch command, WebSocket server, transpiler, and runtime wrapper work together to enable real-time code updates without restarting your GameMaker project.

**Quick Start:**

```bash
# 1. Start the watch command
npm run demo:watch

# 2. Open examples/hot-reload-demo/browser-client/index.html in your browser

# 3. Edit any .gml file in examples/hot-reload-demo/gml-project/
# Watch the browser update in real-time!
```

See [hot-reload-demo/README.md](./hot-reload-demo/README.md) for complete documentation.

## What's Included

- **hot-reload-demo/** - End-to-end hot reload demonstration
  - `gml-project/` - Sample GML scripts for testing
  - `browser-client/` - Interactive browser client showing real-time updates
  - `README.md` - Complete documentation and troubleshooting guide

## Architecture Overview

The hot reload system demonstrates these core concepts:

1. **File Watching** - The CLI monitors `.gml` files for changes
2. **Transpilation** - GML source is parsed and converted to JavaScript
3. **Patch Generation** - Changes are wrapped into patch objects
4. **WebSocket Streaming** - Patches are broadcast to connected clients
5. **Hot Swapping** - The runtime wrapper applies patches without restart

```
GML Source → Parser → Transpiler → Patch → WebSocket → Runtime Wrapper
```

## Testing

Each component has comprehensive test coverage:

```bash
# Test the complete integration
npm test -- src/cli/test/hot-reload-integration.test.ts

# Test patch replay for late subscribers
npm test -- src/cli/test/hot-reload-replay.test.ts

# Test runtime wrapper
npm test -- src/runtime-wrapper/test/*.test.ts

# Test transpiler
npm test -- src/transpiler/test/*.test.ts
```

## Documentation

For more information, see:

- [docs/live-reloading-concept.md](../docs/live-reloading-concept.md) - Complete architecture and design
- [docs/hot-reload-integration-example.md](../docs/hot-reload-integration-example.md) - API reference
- [src/cli/src/commands/watch.ts](../src/cli/src/commands/watch.ts) - Watch command implementation
- [src/transpiler/](../src/transpiler/) - GML to JavaScript transpiler
- [src/runtime-wrapper/](../src/runtime-wrapper/) - Browser runtime wrapper

## Contributing

When adding new examples:

1. Create a descriptive directory name
2. Include a comprehensive README.md
3. Add sample code that demonstrates key concepts
4. Update this index with a brief description
5. Ensure examples work with the current API

## License

These examples are part of the prettier-plugin-gml project and use the same license.
