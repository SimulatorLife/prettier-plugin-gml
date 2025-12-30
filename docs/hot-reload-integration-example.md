# Hot Reload Integration Example

This document demonstrates the complete hot reload integration loop from the CLI watch command through to the runtime wrapper.

## Overview

The hot reload pipeline consists of three main components:

1. **CLI Watch Command** - Monitors GML files and transpiles changes to JavaScript patches
2. **WebSocket Server** - Streams patches in real-time to connected clients
3. **Runtime Wrapper** - Receives patches and applies them to the running game

## Running the Complete Pipeline

### Terminal 1: Start the GameMaker HTML5 Build

Launch the project from the GameMaker IDE using the HTML5 target so it serves
the game (for example at `http://127.0.0.1:51264/index.html`).

### Terminal 2: Prepare Hot-Reload + Start the Watch Command

```bash
# Inject the runtime wrapper into the active HTML5 output
node src/cli/src/cli.js prepare-hot-reload

# Start watching a GML project directory
node src/cli/src/cli.js watch /path/to/gamemaker/project --verbose

# Output:
# WebSocket patch server ready at ws://127.0.0.1:17890
# Watching /path/to/gamemaker/project for changes...
```

If you want a ready-made project, the vendored 3DSpider demo can be used as a hot-reload testbed:

```bash
# Ensure vendored submodules are initialized
git submodule update --init --recursive

# Prepare hot reload + watch the 3DSpider project
npm run demo:watch
```

### Terminal 3: Runtime Wrapper (Injected)

The `prepare-hot-reload` command injects the runtime wrapper snippet into the
HTML5 output (auto-detecting the active GMWebServ root when available), so the
page automatically connects to the WebSocket patch server and applies updates.
No manual edits are required as long as the HTML5 output remains in place.

### Terminal 4: Edit a GML File

```bash
# Edit a GML script
echo "x = x + 1;" >> /path/to/gamemaker/project/scripts/scr_test.gml
```

### What Happens

1. **Watch Command Detects Change**
   ```
   Changed: scr_test.gml
     ↳ Generated patch: gml/script/scr_test
     ↳ Streamed to 1 client(s)
   ```

2. **WebSocket Broadcasts Patch**
   ```json
   {
     "kind": "script",
     "id": "gml/script/scr_test",
     "js_body": "x = (x + 1);",
     "sourceText": "x = x + 1;",
     "version": 1730702400000
   }
   ```

3. **Runtime Wrapper Receives and Applies Patch**
   ```
   ✅ Applied patch gml/script/scr_test at version 1
   ```

## Configuration Options

### Watch Command Options

```bash
node src/cli/src/cli.js watch [options] [targetPath]

Options:
  --extensions <ext...>      File extensions to watch (default: .gml)
  --websocket-port <port>    WebSocket server port (default: 17890)
  --websocket-host <host>    WebSocket server host (default: 127.0.0.1)
  --no-websocket-server      Disable WebSocket server
  --verbose                  Enable verbose logging
```

### Prepare Hot-Reload Options

```bash
node src/cli/src/cli.js prepare-hot-reload [options]

Options:
  --html5-output <path>   Path to the HTML5 output directory
  --gm-temp-root <path>   Root directory for GameMaker HTML5 temp outputs
  --websocket-url <url>   WebSocket URL for hot-reload patches
  --force                 Re-inject even if snippet already exists
  --quiet                 Suppress informational output
```

### Runtime Wrapper Options

```javascript
createWebSocketClient({
    url: "ws://127.0.0.1:17890",    // WebSocket server URL
    wrapper,                         // Runtime wrapper instance
    reconnectDelay: 800,            // Auto-reconnect delay (ms)
    autoConnect: true,              // Connect immediately
    onConnect: () => {},            // Connection callback
    onDisconnect: () => {},         // Disconnection callback
    onError: (error, context) => {} // Error callback
});
```

## Testing the Integration

Run the integration test to verify the complete pipeline:

```bash
npm run test:cli -- src/cli/test/hot-reload-integration.test.js
```

The test validates:
- File change detection
- GML to JavaScript transpilation
- WebSocket patch broadcasting
- Client patch reception
- Patch structure validation

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    Developer's Machine                       │
│                                                               │
│  ┌──────────────────────────────────────────────────────┐   │
│  │              CLI Watch Command                       │   │
│  │  • Monitors GML files                                │   │
│  │  • Transpiles on change                              │   │
│  │  • Generates patches                                 │   │
│  └──────────────────────────────────────────────────────┘   │
│                          ↓                                   │
│  ┌──────────────────────────────────────────────────────┐   │
│  │           WebSocket Server (Port 17890)              │   │
│  │  • Broadcasts patches                                │   │
│  │  • Manages client connections                        │   │
│  │  • Handles reconnections                             │   │
│  └──────────────────────────────────────────────────────┘   │
│                          ↓                                   │
│  ┌──────────────────────────────────────────────────────┐   │
│  │                Browser Window                        │   │
│  │  ┌───────────────────────────────────────────────┐   │   │
│  │  │          Runtime Wrapper                      │   │   │
│  │  │  • WebSocket client                           │   │   │
│  │  │  • Patch application                          │   │   │
│  │  │  • Hot function swapping                      │   │   │
│  │  └───────────────────────────────────────────────┘   │   │
│  │  ┌───────────────────────────────────────────────┐   │   │
│  │  │      GameMaker HTML5 Runtime                  │   │   │
│  │  │  • Running game                               │   │   │
│  │  │  • Live state preservation                    │   │   │
│  │  └───────────────────────────────────────────────┘   │   │
│  └──────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
```
