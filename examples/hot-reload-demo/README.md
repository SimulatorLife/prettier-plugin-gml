# GML Hot Reload Demo

This demo showcases the complete hot reload integration loop, demonstrating real-time code updates without restarting your GameMaker project.

## Overview

The hot reload system consists of three main components working together:

1. **CLI Watch Command** - Monitors GML files and transpiles changes to JavaScript patches
2. **WebSocket Server** - Streams patches in real-time to connected clients
3. **Runtime Wrapper** - Receives patches and applies them to the running game

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

## Quick Start

### 1. Start the Watch Command

From the repository root, run:

```bash
node src/cli/dist/src/cli.js watch examples/hot-reload-demo/gml-project --verbose
```

Or use the convenience script:

```bash
npm run demo:watch
```

This will:
- Start monitoring `examples/hot-reload-demo/gml-project` for `.gml` file changes
- Launch a WebSocket server on `ws://127.0.0.1:17890`
- Display detailed logging of transpilation events

Expected output:
```
WebSocket patch server ready at ws://127.0.0.1:17890
Watching examples/hot-reload-demo/gml-project for changes...
```

### 2. Open the Browser Client

Open `examples/hot-reload-demo/browser-client/index.html` in your web browser.

You should see:
- **Status**: Connected to dev server
- **Patches Received**: Count of patches applied
- **Current Version**: Registry version number
- **Patch Log**: Real-time updates as patches arrive

### 3. Edit GML Files

Make changes to any `.gml` file in the `gml-project` directory:

```bash
# Example: Edit player movement speed
echo "var move_speed = 10;" >> examples/hot-reload-demo/gml-project/player_movement.gml
```

Watch the browser update in real-time!

## What Happens

1. **File Change Detected**
   ```
   Changed: player_movement.gml
   ```

2. **Transpilation**
   ```
   ↳ Read 30 lines
   ↳ Transpiled to JavaScript (1234 chars in 5.23ms)
   ↳ Patch ID: gml/script/player_movement
   ```

3. **Patch Broadcast**
   ```
   ↳ Streamed to 1 client(s)
   ```

4. **Client Receives Patch**
   ```json
   {
     "kind": "script",
     "id": "gml/script/player_movement",
     "js_body": "var move_speed = 10; ...",
     "sourceText": "var move_speed = 10;",
     "version": 1735041234567
   }
   ```

5. **Patch Applied**
   ```javascript
   const fn = new Function('self', 'other', 'args', patch.js_body);
   registry.scripts[patch.id] = fn;
   ```

## Example GML Files

The demo includes three sample scripts:

### `player_movement.gml`
Handles player input and movement logic. Try changing the `move_speed` value and watch it update live!

### `calculate_damage.gml`
Calculates damage based on attack and defense. Experiment with the damage formula.

### `spawn_enemy.gml`
Spawns enemies at random positions. Modify spawn ranges or initial stats.

## Advanced Usage

### Custom WebSocket Port

```bash
node src/cli/dist/src/cli.js watch examples/hot-reload-demo/gml-project \
  --websocket-port 8080 \
  --verbose
```

Then update the `WS_URL` in `index.html` to match.

### Disable Runtime Server

If you only want the WebSocket patch server:

```bash
node src/cli/dist/src/cli.js watch examples/hot-reload-demo/gml-project \
  --no-runtime-server \
  --verbose
```

### Watch Multiple Extensions

```bash
node src/cli/dist/src/cli.js watch examples/hot-reload-demo/gml-project \
  --extensions .gml .js \
  --verbose
```

## Debugging

### Check WebSocket Connection

Open the browser console and check for:
```javascript
window.__hot // Hot registry object
window.__hot.version // Current version number
window.__hot.scripts // Map of patched scripts
```

### View Transpiled JavaScript

All transpiled JavaScript is logged to the browser console:
```javascript
[HOT] Patch gml/script/player_movement: var move_speed = 10; ...
```

### Monitor Network Traffic

Open browser DevTools → Network → WS to see WebSocket messages.

## Integration with GameMaker Runtime

To integrate this with an actual GameMaker HTML5 export:

1. Export your GameMaker project to HTML5
2. Load the runtime wrapper before your game code:
   ```html
   <script src="path/to/runtime-wrapper.js"></script>
   <script src="game.js"></script>
   ```
3. The runtime wrapper will intercept script calls and route them through the hot registry

See `docs/live-reloading-concept.md` for complete integration details.

## Troubleshooting

### "WebSocket connection failed"

Ensure the watch command is running:
```bash
node src/cli/dist/src/cli.js watch examples/hot-reload-demo/gml-project
```

### "No patches received"

1. Check that the watch command detected the file change
2. Verify the file has a `.gml` extension
3. Look for transpilation errors in the watch command output

### "Patch validation failed"

The generated JavaScript may have syntax errors. Check:
- The source GML is valid
- The transpiler supports the GML features used
- The watch command logs for detailed error messages

## Testing

Run the integration tests to verify the hot reload pipeline:

```bash
# Test hot reload integration
npm test -- src/cli/test/hot-reload-integration.test.ts

# Test patch replay for late subscribers
npm test -- src/cli/test/hot-reload-replay.test.ts
```

## Next Steps

- Explore `docs/live-reloading-concept.md` for the complete architecture
- Review `docs/hot-reload-integration-example.md` for API details
- Check `src/runtime-wrapper/src/` for production wrapper implementation
- See `src/transpiler/src/` for GML-to-JavaScript transpilation logic

## License

This demo is part of the prettier-plugin-gml project and uses the same license.
