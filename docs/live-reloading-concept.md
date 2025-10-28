# GameMaker Live Runtime Upgrade Plan
### (Based on the Open-Source HTML5 Runtime)

## Overview
This document outlines the design and milestone plan for a new **live-reloading development runner** for GameMaker, inspired by **GMLive** but built on top of the **open-sourced HTML5 runtime**.
The goal is to allow **true hot-loading** of GML code, assets, and shaders **without restarting the game or losing runtime state**.

---

## Core Concept
The system is composed of two parts:

1. **Dev Runner (HTML5 Runtime Fork)**
   - Wraps GameMaker’s script and event dispatch through a hot-swappable registry.
   - Listens for WebSocket “patches” from a local dev server.
   - Replaces function references at runtime (scripts, events, shaders, etc.).
   - Retains in-game state (instances, rooms, variables, etc.).

2. **Dev Server (Node.js)**
   - Watches GML source files and resources.
   - Uses the ANTLR4 parser to transpile changed code into JavaScript or emit patch stubs.
   - Sends real-time patches to the runner over WebSocket.
   - Optionally runs headless smoke tests (via Puppeteer/Playwright).

---

## Architecture

### Dev Server Responsibilities
- **File Watcher:** Monitor `*.gml`, `.yy`, and asset files.
- **Incremental Compiler:** Use ANTLR4 parse tree to generate JavaScript for changed scripts/events.
- **Dependency Tracking:** Maintain a simple call graph to identify dependent scripts for patch propagation.
- **Patch Delivery:** Send JSON payloads over WebSocket:

```json
{
  "kind": "script",
  "id": "script:scr_damage_enemy",
  "path": "scripts/scr_damage_enemy/scr_damage_enemy.gml",
  "hash": "abcdef123456",
  "js": "function (self, other, args) { /* compiled JS */ }",
  "meta": {
    "params": ["inst", "amount"],
    "returns": "real"
  }
}
```

### Runner Instrumentation
The forked runtime introduces a hot registry that wraps all patchable entry points:

```javascript
window.__hot = {
  version: 0,
  scripts: Object.create(null),
  events: Object.create(null),
  closures: Object.create(null),
  apply_patch(patch) {
    /* logic below */
  },
};

function gml_call_script(id, self, other, args) {
  const fn = __hot.scripts[id] || __compiled_scripts[id];
  return fn(self, other, args);
}

function gml_dispatch_event(objId, eventKey, inst) {
  const key = objId + "#" + eventKey;
  const fn = __hot.events[key] || __compiled_events[key];
  return fn.call(inst);
}
```

When a patch arrives:

- `__hot.scripts[id]` is replaced with the new function.
- Event patches update the relevant entry in `__hot.events`.
- Instances and room state remain untouched, so gameplay continues uninterrupted.

### Hot-Swappable Components
| Component        | Patch Action                              | Notes                                                     |
| ---------------- | ----------------------------------------- | --------------------------------------------------------- |
| Scripts          | Replace entry in `__hot.scripts`          | Immediate swap with minimal risk                          |
| Object Events    | Replace entry in `__hot.events`           | Optionally run a reinit handler for Create event changes  |
| Struct Methods   | Walk live instances to replace bound refs | Required when methods are cached on instances             |
| Shaders          | Recompile and rebind WebGL program        | Takes effect on the next render frame                     |
| Sprites/Sequences| Reload texture plus metadata              | Resource ID stays stable                                  |
| Macros/Enums     | Re-evaluate constant pool                 | Trigger dependent script rebuilds                         |

### Special Handling

#### Closures and Captured State
Use a versioned closure routing system so new closures capture the latest code:

```javascript
const make_ai = function (speed) {
  return __hot.closures["make_ai_v" + __hot.version](speed);
};
```

#### Object Reinitialization
For changed Create events:

- Detect new fields and initialize them in existing instances.
- Allow a custom `on_hot_reload()` hook to run optional migration logic.

### Error Handling
- Apply patches in a shadow registry first.
- Run a one-frame smoke test.
- Roll back automatically on runtime errors.

## HTML5 Runtime Compilation Model
When a project is exported to HTML5, the GameMaker toolchain performs a one-time compilation step:

- Compiles every script, object event, and asset initializer into JavaScript functions.
- Packs the generated code into the HTML5 runner (typically inside `game.js`) together with lookup tables for scripts, objects, events, and resources.
- Generates glue code that maps GML built-ins, instance variables, and runtime structures to JavaScript equivalents.

The HTML5 runner does **not** include a GML compiler. Once the bundle ships, there is no facility for ingesting new `.gml` source, so any code edits require rebuilding the export.

## Scope-aware Semantic Pipeline
Live reload uses the semantic scope module and transpiler described in [semantic scope plan](./semantic-scope-plan.md) to transform edited GML into JavaScript patches and compute dependency-aware rebuilds. Refer to that document for the complete analyzer, IR, and tooling design.

## Live Patch Loop
Hot reload hinges on a tight feedback cycle that runs entirely outside the compiled runner:

1. A watcher (for example, `chokidar`) notices a `.gml` file change.
2. The ANTLR4 parser produces an abstract syntax tree for the modified file.
3. The transpiler walks the tree and emits JavaScript that mirrors GameMaker semantics.
4. The development server wraps the emitted code in a patch object.
5. The browser wrapper receives the patch, instantiates it via `new Function("self", "other", "args", js_body)`, and assigns the result to `__hot.scripts[id]`.
6. Subsequent in-game calls route through the new function while the game continues running with all instance state preserved.

## Why the Runtime Alone Is Insufficient
Even though the HTML5 runner is JavaScript, it only executes already-translated code:

- The runner lacks a GML compiler and cannot translate new `.gml` source at runtime.
- GML syntax diverges from JavaScript (operators, scoping rules, struct semantics), so raw GML cannot be fed directly to `Function()`.
- Without a transpiler, a modified script would need a full rebuild to take effect.

The custom transpiler therefore acts as a lightweight compiler stage that turns fresh GML into runnable JavaScript on demand.

## Conceptual Analogy
| Component          | Role                                                                 |
| ------------------ | -------------------------------------------------------------------- |
| HTML5 runtime      | The engine that executes pre-compiled code but cannot compile GML    |
| ANTLR4 transpiler  | The mini compiler that emits JavaScript patches for changed scripts  |
| Dev server         | The build daemon that watches files and broadcasts patches           |
| Browser wrapper    | The live linker that swaps functions inside the running game         |

## Future Transpiler Capabilities
Expanding the transpiler unlocks richer workflows:

- Parse macros, enums, and object events directly from `.yy` assets for holistic coverage.
- Regenerate only the JavaScript functions that changed, then cascade updates to dependents.
- Maintain a dependency graph to drive targeted rebuilds and AI-driven insights.
- Experiment with browser-side compilation (for example, running the transpiler inside a worker) to shorten feedback even further.

## HTML5 Runtime Integration Strategies
Treat the open-source HTML5 runtime as an upstream dependency and layer hot-reload capabilities without modifying vendor files. The approaches below can be combined where it makes sense.

### Sidecar Iframe (“Runner-in-a-box”)
**How it works**
- Serve a development page that hosts the unmodified GameMaker export inside an `<iframe>`.
- A lightweight bridge exchanges hot patch messages between the host page and the runner via `postMessage`.

**Advantages**
- The upstream runtime bundle stays pristine and can be updated by simply replacing the export.
- Runtime symbol changes are shielded from the host page as long as the bridge can rediscover entry points.

**Trade-offs**
- Requires reliable discovery or exposure of dispatch surfaces from inside the iframe (see “Discovering Hook Points Safely”).
- Adds a cross-frame messaging layer, which introduces minor overhead.

**Required hooks**
- Accessors for script calls, event dispatch, and optional asset reload helpers exposed to the host page.

### Bootstrap Wrapper (Script-order Monkey Patch)
**How it works**
- Load the upstream runtime first, followed by a small `wrapper.js`.
- The wrapper locates script and event dispatch functions and routes them through the hot registry.
- The dev server streams patches over WebSocket that update registry entries.

**Advantages**
- Minimal integration effort: add one `<script>` tag after the runtime bundle.
- Works with the upstream repository as-is and stays aligned with updates.

**Trade-offs**
- Symbol discovery must tolerate upstream renames (fallback heuristics recommended).

**Required hooks**
- Hot registry injection after load.
- Dispatcher replacements (script calls, event dispatch).

### Service Worker Overlay (Request Interception)
**How it works**
- Register a Service Worker during development that intercepts requests for `index.html` and runtime bundles.
- Stream additional wrapper code before or after the upstream payload without altering files on disk.
- Serve hot-replaced assets and shaders directly from the Service Worker.

**Advantages**
- No persistent changes to exported artifacts; disable the worker for production.
- Enables development-only endpoints (for example, `/__hot/patch`).

**Trade-offs**
- Requires careful cache handling to avoid serving stale bundles.

**Required hooks**
- Wrapper injection during response streaming.
- Optional routing for assets and shader reloads.

### Git Submodule with Overlay Build
**How it works**
- Add `YoYoGames/GameMaker-HTML5` as a Git submodule pinned to a commit.
- The build pipeline (Vite/Rollup/esbuild) treats the runtime bundle as an external asset and emits:
  - `runtime.js` (upstream, untouched),
  - `wrapper.js` (hot hooks),
  - `boot.html` that loads both in order.
- Continuous integration jobs can bump the submodule and run hook contract tests.

**Advantages**
- Reproducible updates and simple rollbacks.
- Fits GameMaker’s “Path to HTML5 runner” export configuration or a custom development shell.

**Trade-offs**
- Requires a lightweight build step to stitch the overlay artifacts together.

**Required hooks**
- Wrapper injection with dispatcher overrides.
- Test harness that validates hook discovery on each submodule upgrade.

## Implementing Runtime Hooks Without Forking
Regardless of the chosen integration strategy, inject a hot registry and replace dispatchers after the runtime loads.

```
// Minimal hot indirection (dev only)
window.__hot = {
  version: 0,
  scripts: Object.create(null),
  events: Object.create(null),
  apply_patch(p) { /* install into __hot, maybe rebind */ }
};

// 1) Wrap script calls
const call_script_original = window.gml_call_script || window.__gm_call_script;
window.gml_call_script = function(id, self, other, args) {
  const fn = __hot.scripts[id];
  if (fn) { return fn(self, other, args); }
  return call_script_original(id, self, other, args);
};

// 2) Wrap event dispatch
const dispatch_event_original = window.gml_dispatch_event || window.__gm_dispatch_event;
window.gml_dispatch_event = function(objId, eventKey, inst) {
  const key = objId + "#" + eventKey;
  const fn = __hot.events[key];
  if (fn) { return fn.call(inst); }
  return dispatch_event_original(objId, eventKey, inst);
};
```

### Minimal Development Wrapper Layout
Load order ensures the wrapper observes runtime symbols:

```html
<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <title>GM Dev Runner</title>
    <meta name="viewport" content="width=device-width, initial-scale=1" />
  </head>
  <body>
    <!-- 1) Upstream runtime (untouched) -->
    <script src="./runtime/upstream_runtime.js"></script>

    <!-- 2) Hot wrapper (compiled TypeScript or JS) -->
    <script src="./dev/wrapper.js"></script>

    <!-- 3) Game bundle (if emitted separately) -->
    <script src="./game/game.js"></script>
  </body>
</html>
```

The wrapper can establish a WebSocket connection to receive patches, apply them to the registry, and show status via a simple heads-up display. Extending the wrapper with optional helpers (for example, `window.__gm.reload_shader`) keeps upstream files untouched while exposing reload capabilities to patches.

### Development Server Responsibilities
- Watch `.gml` sources via `chokidar` or equivalent tooling.
- Parse changed files with the ANTLR4 pipeline to regenerate JavaScript functions.
- Broadcast patches over WebSocket in a compact, human-readable JSON schema:

```json
{
  "kind": "script",
  "id": "script:scr_damage_enemy",
  "path": "scripts/scr_damage_enemy.gml",
  "js_body": "return self.hp -= args[0];"
}
```

- Extend the watcher to cover object event code, shader sources, and assets as needed.
- Provide contract tests that confirm dispatcher hooks are still reachable after upstream updates.

## Discovering Hook Points Safely
- Inspect enumerable globals post-load for script and event tables.
- If no direct references are found, spawn a one-frame probe object that calls a known script and temporarily instrument `Function.prototype.apply` to identify the dispatcher.
- Cache the resolved dispatcher functions inside the wrapper and fail fast in tests if they change.
- Optionally expose an in-project glue object (`window.__gm`) that returns dispatcher references and asset reload helpers while keeping upstream files intact.

## Maintaining State During Reloads
- Swap function references only; do not recreate instances or rooms.
- When Create event logic changes, detect new fields and initialize them on live instances without overwriting existing values.
- Support an optional per-object `on_hot_reload()` hook to perform targeted migrations.
- Version closure factories (for example, `__hot.version`) so newly created closures pick up updated logic while existing closures expire naturally.

## Upstream Update Strategy
- Pin the HTML5 runtime to a specific commit (for example, via Git submodule).
- Ship a utility script (`scripts/check-hooks.mjs`) that loads a sample export, resolves dispatcher functions, and asserts that the wrapper intercepts calls.
- Run the hook check in continuous integration on a schedule and whenever updating the pinned commit.
- When a check fails, adjust only the wrapper discovery logic; never modify the upstream runtime sources.

## Recommended Starting Approach
Adopt the **bootstrap wrapper** model first. It introduces minimal overhead, operates in the same JavaScript realm as the runner, and avoids cross-frame messaging or Service Worker cache management. The wrapper runs immediately after the upstream runtime, discovers dispatchers, and injects hot indirection. With the runtime pinned as a dependency, updates involve replacing the upstream bundle and re-running hook checks.

## Appendix A – JavaScript Wrapper Starter
The following files form a drop-in, no-fork development wrapper that layers hot reload capabilities on top of an unmodified HTML5 export.

### index.dev.html
```
<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <title>GM Dev Runner</title>
    <meta name="viewport" content="width=device-width, initial-scale=1" />
  </head>
  <body>
    <!-- 1) Upstream unmodified runtime bundle -->
    <script src="./runtime/upstream_runtime.js"></script>

    <!-- 2) Our tiny dev wrapper -->
    <script src="./dev/wrapper.js"></script>

    <!-- 3) Your exported game (if separate) -->
    <script src="./game/game.js"></script>
  </body>
</html>
```

### dev/wrapper.js
```
/* dev/wrapper.js
   Hot-swap wrapper for GM HTML5 runtime (dev only). */

(function () {
  // --- hot registry ---
  const hot = (window.__hot = {
    version: 0,
    scripts: Object.create(null),     // id -> function(self, other, args[])
    events: Object.create(null),      // "objId#eventKey" -> function.call(inst)
    closures: Object.create(null),    // optional: factories by version
    apply_patch,
    undo_stack: [],
    log: (...a) => console.log("[HOT]", ...a),
    err: (...a) => console.error("[HOT]", ...a),
  });

  // --- discover dispatchers (non-invasive) ---
  // These vary across runtime versions. We try a few common locations and fall back
  // to a small in-project hint if you add it (optional; see bottom note).
  const dispatch = {
    call_script: null,
    dispatch_event: null,
    object_iter: null,    // optional: to rebind cached event pointers
  };

  function discover_dispatchers() {
    // Known names first (update these if upstream changes)
    const candidates = [
      "gml_call_script",
      "__gm_call_script",
      "GMCallScript",
      "yy_call_script"
    ];
    for (const k of candidates) {
      if (typeof window[k] === "function") { dispatch.call_script = window[k]; break; }
    }

    const evCandidates = [
      "gml_dispatch_event",
      "__gm_dispatch_event",
      "GMEventPerform",
      "yy_event_perform"
    ];
    for (const k of evCandidates) {
      if (typeof window[k] === "function") { dispatch.dispatch_event = window[k]; break; }
    }

    // Optional helper a project can expose at runtime:
    if (!dispatch.call_script && window.__gm && typeof window.__gm.call_script === "function") {
      dispatch.call_script = window.__gm.call_script;
    }
    if (!dispatch.dispatch_event && window.__gm && typeof window.__gm.dispatch_event === "function") {
      dispatch.dispatch_event = window.__gm.dispatch_event;
    }
  }

  discover_dispatchers();

  // --- monkey-patch only what we found ---
  if (dispatch.call_script) {
    const original = dispatch.call_script;
    window.__hot_call_script_original = original;
    window[original.name] = function (id, self, other, args) {
      const fn = hot.scripts[id];
      if (fn) { return fn(self, other, args); }
      return original(id, self, other, args);
    };
  }

  if (dispatch.dispatch_event) {
    const original = dispatch.dispatch_event;
    window.__hot_dispatch_event_original = original;
    window[original.name] = function (objId, eventKey, inst) {
      const key = objId + "#" + eventKey;
      const fn = hot.events[key];
      if (fn) { return fn.call(inst); }
      return original(objId, eventKey, inst);
    };
  }

  // --- patch application ---
  function apply_patch(patch) {
    // Keep an undo entry
    hot.undo_stack.push({ before: snapshot_for(patch) });

    try {
      switch (patch.kind) {
        case "script": {
          // Expect patch.js_body = "/* function body */"
          // Build a function(self, other, args)
          const fn = new Function("self", "other", "args", patch.js_body);
          hot.scripts[patch.id] = fn;
          break;
        }
        case "event": {
          // id format: "object:obj_enemy#Step" OR numeric ids your project uses
          const fn = new Function(patch.this_name || "self", patch.js_args || "", patch.js_body);
          hot.events[patch.id] = function () { return fn.call(this); };
          break;
        }
        case "shader": {
          // Provide a hook; your asset system should expose a shader manager in dev.
          if (window.__gm && typeof window.__gm.reload_shader === "function") {
            window.__gm.reload_shader(patch.shader_name, patch.source_vs, patch.source_fs);
          }
          break;
        }
        case "sprite": {
          if (window.__gm && typeof window.__gm.reload_sprite === "function") {
            window.__gm.reload_sprite(patch.sprite_name, patch.frames, patch.meta);
          }
          break;
        }
        case "macro":
        case "enum": {
          // Rebuild your const pool and (optionally) trigger selective recompiles on dev server
          if (window.__gm && typeof window.__gm.reload_constants === "function") {
            window.__gm.reload_constants(patch.entries);
          }
          break;
        }
        default:
          hot.err("Unknown patch kind:", patch.kind);
      }

      hot.version += 1;
      hud_ok(`Patched ${patch.kind} ${patch.id}`);
    } catch (e) {
      hud_err(`Patch failed ${patch.id}: ${e.message}`);
      hot.err(e);
    }
  }

  function snapshot_for(patch) {
    if (patch.kind === "script") {
      return { id: patch.id, kind: "script", fn: hot.scripts[patch.id] || null };
    }
    if (patch.kind === "event") {
      return { id: patch.id, kind: "event", fn: hot.events[patch.id] || null };
    }
    return { id: patch.id, kind: patch.kind, noop: true };
  }

  // --- tiny HUD for feedback (dev only) ---
  const hud = (() => {
    const el = document.createElement("div");
    el.style.cssText = "position:fixed;right:8px;bottom:8px;padding:6px 10px;background:rgba(0,0,0,.6);color:#fff;font:12px/1.2 monospace;z-index:999999;border-radius:6px;pointer-events:none;max-width:40vw";
    document.addEventListener("DOMContentLoaded", () => document.body.appendChild(el));
    return {
      show: (msg, ok) => { el.textContent = msg; el.style.background = ok ? "rgba(0,128,0,.65)" : "rgba(128,0,0,.65)"; clearTimeout(el.__t); el.__t = setTimeout(() => { el.style.background = "rgba(0,0,0,.6)"; }, 900); }
    };
  })();

  function hud_ok(msg) { hud.show(msg, true); }
  function hud_err(msg) { hud.show(msg, false); }

  // --- dev WebSocket for patches ---
  const WS_URL = (location.search.match(/ws=([^&]+)/) || [])[1] || "ws://127.0.0.1:17890";
  let ws;

  function connect_ws() {
    try {
      ws = new WebSocket(WS_URL);
      ws.onopen = () => hot.log("Connected", WS_URL);
      ws.onmessage = (ev) => {
        try {
          const patch = JSON.parse(ev.data);
          if (!patch || !patch.kind) return;
          hot.apply_patch(patch);
        } catch (e) {
          hot.err("Bad patch payload", e);
        }
      };
      ws.onclose = () => setTimeout(connect_ws, 800);
      ws.onerror = () => ws.close();
    } catch (e) {
      hot.err("WS init failed", e);
    }
  }

  // Start when DOM is ready (runtime is usually already booted by now)
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", connect_ws);
  } else {
    connect_ws();
  }
})();
```

### dev/server.js
```
import { WebSocketServer } from "ws";
import chokidar from "chokidar";
import fs from "node:fs/promises";
import path from "node:path";

const wss = new WebSocketServer({ port: 17890 });
const clients = new Set();
wss.on("connection", ws => { clients.add(ws); ws.on("close", () => clients.delete(ws)); });

function broadcast(obj) {
  const msg = JSON.stringify(obj);
  for (const ws of clients) { try { ws.send(msg); } catch {} }
}

const projectRoot = path.resolve(process.cwd(), "game");     // adjust
const scriptsDir = path.join(projectRoot, "scripts");

chokidar.watch(scriptsDir, { ignoreInitial: true })
.on("add", onChange)
.on("change", onChange);

async function onChange(file) {
  if (!file.endsWith(".gml")) return;
  const src = await fs.readFile(file, "utf8");

  // TODO: feed src to your ANTLR pipeline to produce JS body
  // For bootstrapping, we wrap raw GML in a call to original dispatcher:
  const id = file_to_script_id(file);  // implement to match your export
  const js_body = `
    // Call through to original implementation if present (bootstrap)
    // Replace this with emitted JS from your transpiler later.
    return window.__hot_call_script_original
      ? window.__hot_call_script_original(${JSON.stringify(id)}, self, other, args)
      : undefined;
  `;

  broadcast({
    kind: "script",
    id: `script:${id}`,
    path: path.relative(projectRoot, file),
    js_body
  });
  console.log("Patch sent:", file);
}

function file_to_script_id(f) {
  // Map filename -> script id scheme your game uses. For now, use basename.
  return path.basename(f, ".gml");
}

console.log("Dev WS listening on ws://127.0.0.1:17890");
```

### Patch Format (Baseline)
```
{
  "kind": "script" | "event" | "shader" | "sprite" | "macro" | "enum",
  "id": "script:scr_damage_enemy" | "object:obj_enemy#Step",
  "path": "scripts/scr_damage_enemy.gml",
  "js_body": "/* contents for new Function(...) */",

  "this_name": "self",          // (event) optional
  "js_args": "",                // (event) optional
  "shader_name": "",            // (shader) optional
  "source_vs": "",              // (shader) optional
  "source_fs": ""               // (shader) optional
}
```

## Appendix B – TypeScript Tooling Starter
These files provide a TypeScript-based workflow with bundling, watching, and VS Code integration.

### package.json
```
{
  "name": "gm-hotdev",
  "private": true,
  "type": "module",
  "scripts": {
    "build": "esbuild html5-dev/dev/wrapper.ts --bundle --platform=browser --outfile=html5-dev/dev/wrapper.js --sourcemap",
    "watch:wrapper": "esbuild html5-dev/dev/wrapper.ts --bundle --platform=browser --outfile=html5-dev/dev/wrapper.js --sourcemap --watch",
    "watch:server": "ts-node --esm html5-dev/dev/server.ts",
    "serve": "http-server html5-dev -c-1 -p 5173",
    "dev": "run-p watch:wrapper watch:server serve"
  },
  "dependencies": {
    "chokidar": "^3.6.0",
    "ws": "^8.18.0"
  },
  "devDependencies": {
    "@types/chokidar": "^2.1.3",
    "@types/ws": "^8.5.10",
    "esbuild": "^0.23.0",
    "http-server": "^14.1.1",
    "npm-run-all": "^4.1.5",
    "ts-node": "^10.9.2",
    "typescript": "^5.6.3"
  }
}
```

### tsconfig.json
```
{
  "compilerOptions": {
    "target": "ES2020",
    "module": "ES2020",
    "moduleResolution": "Bundler",
    "strict": true,
    "skipLibCheck": true,
    "esModuleInterop": true,
    "resolveJsonModule": true,
    "types": ["node", "ws"]
  },
  "include": ["html5-dev/dev/**/*.ts"]
}
```

### html5-dev/index.dev.html
```
<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <title>GM Dev Runner</title>
    <meta name="viewport" content="width=device-width, initial-scale=1" />
  </head>
  <body>
    <!-- 1) Upstream runtime (untouched) -->
    <script src="./runtime/upstream_runtime.js"></script>

    <!-- 2) Our wrapper (bundled from TS) -->
    <script src="./dev/wrapper.js"></script>

    <!-- 3) Your game bundle if separate (optional) -->
    <!-- <script src="./game/game.js"></script> -->

    <noscript>Enable JavaScript</noscript>
  </body>
</html>
```

### html5-dev/dev/types.ts
```
export type PatchKind = "script" | "event" | "shader" | "sprite" | "macro" | "enum";

export interface BasePatch {
  kind: PatchKind;
  id: string;          // e.g., "script:scr_damage_enemy" or "object:obj_enemy#Step"
  path?: string;       // relative source path (for HUD/debug)
}

export interface ScriptPatch extends BasePatch {
  kind: "script";
  js_body: string;     // body for new Function("self","other","args", js_body)
}

export interface EventPatch extends BasePatch {
  kind: "event";
  js_body: string;
  this_name?: string;
  js_args?: string;
}

export interface ShaderPatch extends BasePatch {
  kind: "shader";
  shader_name: string;
  source_vs?: string;
  source_fs: string;
}

export interface SpritePatch extends BasePatch {
  kind: "sprite";
  sprite_name: string;
  frames: Array<string>;   // data URLs or paths your dev system knows how to load
  meta?: Record<string, unknown>;
}

export interface MacroPatch extends BasePatch {
  kind: "macro" | "enum";
  entries: Record<string, string | number | boolean>;
}

export type Patch = ScriptPatch | EventPatch | ShaderPatch | SpritePatch | MacroPatch;

export interface HotAPI {
  version: number;
  scripts: Record<string, (self: any, other: any, args: any[]) => any>;
  events: Record<string, (this: any) => any>;
  closures: Record<string, Function>;
  apply_patch(patch: Patch): void;
  undo_stack: Array<unknown>;
  log: (...a: any[]) => void;
  err: (...a: any[]) => void;
}
```

### html5-dev/dev/wrapper.ts
```
import type { HotAPI, Patch } from "./types";

declare global {
  interface Window {
    __hot: HotAPI;
    __hot_call_script_original?: (id: any, self: any, other: any, args: any[]) => any;
    __hot_dispatch_event_original?: (objId: any, eventKey: any, inst: any) => any;

    // Optional project glue if you provide it in GML:
    __gm?: {
      call_script?: (id: any, self: any, other: any, args: any[]) => any;
      dispatch_event?: (objId: any, eventKey: any, inst: any) => any;
      reload_shader?: (name: string, vs?: string, fs?: string) => void;
      reload_sprite?: (name: string, frames: string[], meta?: Record<string, unknown>) => void;
      reload_constants?: (entries: Record<string, any>) => void;
    };

    // Potential upstream names we try to discover:
    gml_call_script?: (id: any, self: any, other: any, args: any[]) => any;
    __gm_call_script?: (id: any, self: any, other: any, args: any[]) => any;
    GMCallScript?: (id: any, self: any, other: any, args: any[]) => any;
    yy_call_script?: (id: any, self: any, other: any, args: any[]) => any;

    gml_dispatch_event?: (objId: any, eventKey: any, inst: any) => any;
    __gm_dispatch_event?: (objId: any, eventKey: any, inst: any) => any;
    GMEventPerform?: (objId: any, eventKey: any, inst: any) => any;
    yy_event_perform?: (objId: any, eventKey: any, inst: any) => any;
  }
}

(function () {
  // --- HUD -------------------------------------------------------------------
  const hud = (() => {
    const el = document.createElement("div");
    el.style.cssText = [
      "position:fixed",
      "right:8px",
      "bottom:8px",
      "padding:6px 10px",
      "background:rgba(0,0,0,.6)",
      "color:#fff",
      "font:12px/1.2 monospace",
      "z-index:2147483647",
      "border-radius:6px",
      "pointer-events:none",
      "max-width:40vw"
    ].join(";");
    const attach = () => document.body.appendChild(el);
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", attach);
    } else {
      attach();
    }
    let t: number | undefined;
    function show(msg: string, ok: boolean) {
      el.textContent = msg;
      el.style.background = ok ? "rgba(0,128,0,.65)" : "rgba(128,0,0,.65)";
      if (t) window.clearTimeout(t);
      t = window.setTimeout(() => (el.style.background = "rgba(0,0,0,.6)"), 900);
    }
    return { ok: (m: string) => show(m, true), err: (m: string) => show(m, false) };
  })();

  // --- __hot API --------------------------------------------------------------
  const hot: HotAPI = (window.__hot = {
    version: 0,
    scripts: Object.create(null),
    events: Object.create(null),
    closures: Object.create(null),
    apply_patch,
    undo_stack: [],
    log: (...a: any[]) => console.log("[HOT]", ...a),
    err: (...a: any[]) => console.error("[HOT]", ...a)
  });

  // --- discover dispatchers ---------------------------------------------------
  const dispatch = {
    call_script: undefined as undefined | ((id: any, self: any, other: any, args: any[]) => any),
    dispatch_event: undefined as undefined | ((objId: any, eventKey: any, inst: any) => any)
  };

  function discover() {
    const callCandidates = [
      "gml_call_script",
      "__gm_call_script",
      "GMCallScript",
      "yy_call_script"
    ] as const;

    const evCandidates = [
      "gml_dispatch_event",
      "__gm_dispatch_event",
      "GMEventPerform",
      "yy_event_perform"
    ] as const;

    for (const k of callCandidates) {
      const fn = (window as any)[k];
      if (typeof fn === "function") {
        dispatch.call_script = fn;
        break;
      }
    }
    for (const k of evCandidates) {
      const fn = (window as any)[k];
      if (typeof fn === "function") {
        dispatch.dispatch_event = fn;
        break;
      }
    }

    // Optional glue provided by the project:
    if (!dispatch.call_script && window.__gm?.call_script) dispatch.call_script = window.__gm.call_script;
    if (!dispatch.dispatch_event && window.__gm?.dispatch_event) dispatch.dispatch_event = window.__gm.dispatch_event;
  }

  discover();

  // --- monkey-patch (non-invasive) -------------------------------------------
  if (dispatch.call_script) {
    const original = dispatch.call_script;
    window.__hot_call_script_original = original;
    // Replace by name if possible, else wrap a generic shim:
    (window as any)[(original as any).name] = function (id: any, self: any, other: any, args: any[]) {
      const fn = hot.scripts[`script:${id}`] || hot.scripts[id];  // allow both addressing styles
      if (fn) return fn(self, other, args);
      return original(id, self, other, args);
    };
  } else {
    hot.err("Could not find script dispatcher – wrapper still listening for patches, but cannot route.");
  }

  if (dispatch.dispatch_event) {
    const original = dispatch.dispatch_event;
    window.__hot_dispatch_event_original = original;
    (window as any)[(original as any).name] = function (objId: any, eventKey: any, inst: any) {
      const key = `${objId}#${eventKey}`;
      const fn = hot.events[key];
      if (fn) return fn.call(inst);
      return original(objId, eventKey, inst);
    };
  } else {
    hot.err("Could not find event dispatcher – event hot-swap disabled.");
  }

  // --- patch application ------------------------------------------------------
  function apply_patch(patch: Patch) {
    try {
      switch (patch.kind) {
        case "script": {
          const body = (patch as any).js_body as string;
          const fn = new Function("self", "other", "args", body) as (s: any, o: any, a: any[]) => any;
          hot.scripts[patch.id] = fn;
          hot.version += 1;
          hud.ok(`Patched ${patch.id}`);
          break;
        }
        case "event": {
          const p = patch as any;
          const thisName = p.this_name ?? "self";
          const argsDecl = p.js_args ?? "";
          const fn = new Function(thisName, argsDecl, p.js_body) as (self: any) => any;
          hot.events[patch.id] = function (this: any) { return fn.call(this); };
          hot.version += 1;
          hud.ok(`Patched ${patch.id}`);
          break;
        }
        case "shader": {
          const p = patch as any;
          if (window.__gm?.reload_shader) {
            window.__gm.reload_shader(p.shader_name, p.source_vs, p.source_fs);
            hud.ok(`Reloaded shader ${p.shader_name}`);
          } else {
            hud.err(`No shader reload hook for ${p.shader_name}`);
          }
          break;
        }
        case "sprite": {
          const p = patch as any;
          if (window.__gm?.reload_sprite) {
            window.__gm.reload_sprite(p.sprite_name, p.frames, p.meta);
            hud.ok(`Reloaded sprite ${p.sprite_name}`);
          } else {
            hud.err(`No sprite reload hook for ${p.sprite_name}`);
          }
          break;
        }
        case "macro":
        case "enum": {
          const p = patch as any;
          if (window.__gm?.reload_constants) {
            window.__gm.reload_constants(p.entries);
            hud.ok(`Reloaded constants ${patch.kind}`);
          } else {
            hud.err("No constants reload hook");
          }
          break;
        }
        default:
          hud.err(`Unknown patch kind: ${(patch as any).kind}`);
      }
    } catch (e: any) {
      hot.err(e);
      hud.err(`Patch failed: ${patch.id}`);
    }
  }

  // --- WebSocket client -------------------------------------------------------
  const param = location.search.match(/ws=([^&]+)/);
  const WS_URL = (param && decodeURIComponent(param[1])) || "ws://127.0.0.1:17890";
  let ws: WebSocket | null = null;

  function connect() {
    try {
      ws = new WebSocket(WS_URL);
      ws.onopen = () => hot.log("Connected", WS_URL);
      ws.onmessage = (ev) => {
        try {
          const patch = JSON.parse(ev.data) as Patch;
          if (!patch || !patch.kind) return;
          hot.apply_patch(patch);
        } catch (e) {
          hot.err("Bad patch payload", e);
        }
      };
      ws.onclose = () => setTimeout(connect, 800);
      ws.onerror = () => ws?.close();
    } catch (e) {
      hot.err("WS connect failed", e);
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", connect);
  } else {
    connect();
  }
})();
```

### html5-dev/dev/server.ts
```
import { WebSocketServer } from "ws";
import chokidar from "chokidar";
import path from "node:path";
import fs from "node:fs/promises";
import type { Patch } from "./types";

// Configure these to your project:
const projectRoot = path.resolve(process.cwd());                    // repo root
const gmlDirs = [
  path.join(projectRoot, "src"),                                    // e.g., your source root
  path.join(projectRoot, "game/scripts")                            // example path; add/remove as needed
];

const port = 17890;
const wss = new WebSocketServer({ port });
const clients = new Set<WebSocket>();

wss.on("connection", (ws: any) => {
  clients.add(ws);
  ws.on("close", () => clients.delete(ws));
});

function broadcast(p: Patch) {
  const msg = JSON.stringify(p);
  for (const ws of clients) {
    try { (ws as any).send(msg); } catch {}
  }
}

console.log(`[dev] WS listening ws://127.0.0.1:${port}`);

for (const dir of gmlDirs) {
  chokidar
    .watch(dir, { ignoreInitial: true, ignored: /(^|[/\\])\../ })
    .on("add", onChange)
    .on("change", onChange);
  console.log(`[dev] watching ${dir}`);
}

async function onChange(file: string) {
  if (!file.endsWith(".gml")) return;
  const src = await fs.readFile(file, "utf8");

  // Replace with your real ANTLR4-based compiler when ready:
  const js_body = compile_gml_to_js_stub(src, file);

  const id = resolve_script_id(file);    // Keep consistent with your project’s ID scheme
  const patch: Patch = {
    kind: "script",
    id,
    path: relativeFromProject(file),
    js_body
  } as any;

  broadcast(patch);
  console.log(`[dev] patch sent: ${id}  (${relativeFromProject(file)})`);
}

/** Map a file path to a stable script id. Prefer "script:scr_name". */
function resolve_script_id(file: string): string {
  const base = path.basename(file, ".gml");
  // You can enrich this with project metadata (yy files) to ensure exact IDs.
  return `script:${base}`;
}

function relativeFromProject(file: string) {
  return path.relative(projectRoot, file).replace(/\\/g, "/");
}

/** BOOTSTRAP ONLY: forwards to original, until your transpiler is ready. */
function compile_gml_to_js_stub(_src: string, file: string): string {
  const base = path.basename(file, ".gml");
  // If your runtime uses numeric IDs, adapt this to locate the right one.
  // We try both "scr_name" and "script:scr_name" in wrapper.
  return `
    // bootstrap: forward to original dispatcher
    if (window.__hot_call_script_original) {
      return window.__hot_call_script_original(${JSON.stringify(base)}, self, other, args);
    }
    if (window.__hot_call_script_original) {
      return window.__hot_call_script_original(${JSON.stringify("script:" + base)}, self, other, args);
    }
    return undefined;
  `;
}
```

### .vscode/tasks.json
```
{
  "version": "2.0.0",
  "tasks": [
    {
      "label": "hotdev: build wrapper (once)",
      "type": "shell",
      "command": "npm run build",
      "group": "build",
      "problemMatcher": []
    },
    {
      "label": "hotdev: dev (watch+serve)",
      "type": "shell",
      "command": "npm run dev",
      "isBackground": true,
      "problemMatcher": []
    }
  ]
}
```

### .vscode/launch.json
```
{
  "version": "0.2.0",
  "configurations": [
    {
      "name": "Open GM Dev Page",
      "type": "pwa-chrome",
      "request": "launch",
      "url": "http://127.0.0.1:5173/index.dev.html",
      "webRoot": "${workspaceFolder}/html5-dev"
    }
  ]
}
```

## End-to-End Patch Cycle
1. Developer edits a `.gml` file.
2. Dev server detects the change.
3. The file is re-parsed and transpiled to JavaScript.
4. Patch JSON is sent via WebSocket.
5. Dev runner validates and applies the patch.
6. HUD overlay displays success or error.
7. Game continues running with updated logic.

## Advantages Over GMLive
- No pre-targeting: all scripts and events route through patchable registries.
- True runtime persistence: instances and rooms remain live.
- Multi-domain support: scripts, events, shaders, assets, macros.
- Low overhead: operates inside the official open-source runtime.
- Future-proof: tracks GameMaker HTML5 updates without extra shims.

## Optional Enhancements

### Overlay HUD
- Display last patched script, elapsed time, and error logs.
- Provide “Undo Patch” and “Retry” buttons for quick recovery.

### Headless Smoke Tests
- Use Puppeteer to spin up a sandbox scene.
- Validate patched code without restarting the main window.

### Git Hooks Integration
- Auto-commit working patches.
- Roll back to the previous hash on errors.

## Milestone Roadmap

### Milestone 1 – Core Runtime Patch System
- Fork the HTML5 runtime.
- Implement `__hot` registries for scripts and events.
- Build the Node.js dev server with file watcher and WebSocket.
- Handle simple `new Function` patch stubs.
- Add on-screen dev HUD (last patch and error log).

### Milestone 2 – Code Generation and Reinitialization
- Integrate the ANTLR4 parser for real JS transpilation of a GML subset.
- Add reinit support for Create events and structs.
- Hot-swap shaders and sprites.
- Include simple patch rollback and smoke-test probe.

### Milestone 3 – Advanced Lifecycle Features
- Add closure versioning and per-object `on_hot_reload()`.
- Support macro/enum constant pool updates.
- Add optional headless scene testing via Puppeteer.
- Stabilize incremental rebuild performance and error recovery.

## References
- [YoYo Games HTML5 Runtime (Open Source)](https://github.com/YoYoGames/GameMaker-HTML5)
- [GMLive Inspiration](https://yellowafterlife.itch.io/gmlive)
- [GameMaker HTML5 Runtime Usage Notes](https://github.com/YoYoGames/GameMaker-HTML5#readme)
- [YoYo Games HTML5 Runtime Announcement](https://gamemaker.io/en/blog/open-sourcing-html5-runtime)
- [Safe Monkey-Patch Patterns in JavaScript](https://stackoverflow.com/questions/2258272/javascript-best-way-to-override-a-function)
- [ANTLR4 GameMaker Grammar (grammars-v4)](https://github.com/antlr/grammars-v4/tree/master/gamemaker)
- [antlr4-c3 Code Completion Toolkit](https://github.com/mike-lischke/antlr4-c3)
- [antlr4-symboltable Scope Utilities](https://github.com/mike-lischke/antlr4-cpp-tool-runtime/tree/master/runtime/src/support)
- [OpenGML Interpreter Reference](https://github.com/opengml/opengml)
- [SCIP Specification and Tooling](https://github.com/sourcegraph/scip)

## Long-Term Vision
Create a persistent development session for GameMaker where:

- Editing a file updates the live game instantly.
- The in-game state never resets unless you choose to.
- The system understands dependencies and safely reloads affected scripts.
- Changes can be verified via automated headless scenes before committing.
- “Build → Fix → Run” evolves into “Edit → Live → Verify.”
