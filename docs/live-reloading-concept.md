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

## Role of the ANTLR4 → JS Transpiler
The ANTLR4 grammar supplied with the project yields a parse tree for any `.gml` file. A custom transpiler turns that tree into executable JavaScript on demand, effectively recreating the IDE’s export step at development time.

| Function        | HTML5 Runtime                                         | ANTLR4 Transpiler                                             |
| --------------- | ----------------------------------------------------- | ------------------------------------------------------------- |
| Purpose         | Run the pre-compiled game bundle                      | Generate JavaScript for changed GML                           |
| Execution time  | Once during export                                    | Every time a watched file changes                             |
| Input           | GML already compiled inside the GameMaker IDE         | Raw `.gml` source from disk                                   |
| Output          | JavaScript embedded in the runtime bundle             | JavaScript patch payload delivered over WebSocket             |
| Runtime access  | None; cannot recompile new GML                        | Full; can stream fresh functions into the running browser     |
| Dependency view | Flattened, static tables                              | Dynamic graph that can drive selective recompilation          |

In short, the transpiler reproduces the code generation logic necessary for hot reloads, allowing scripts to be updated in-place without rebuilding the game.

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

## Transpiler Implementation Strategy
There is no ready-made, open-source ANTLR4 → JavaScript transpiler for GML. Two realistic paths exist:

1. **Build atop the existing ANTLR4 grammar.**  
   - Start from the `grammars-v4` GameMaker grammar and generate a JavaScript (or TypeScript) parser.  
   - Implement a visitor or listener that emits JavaScript matching HTML5 semantics, beginning with core expressions, control flow, and local variables.  
   - Gradually expand coverage to structs, enums, macros, methods, `with` blocks, and asset references.
2. **Study existing but non-reusable compilers.**  
   - Tools such as GMLive include bespoke GML → JS compilers, yet they are not published as libraries.  
   - OpenGML functions as an interpreter rather than a transpiler, so it serves as reference material, not a drop-in solution.

Recommended practice:

- Ship hot reload early by keeping a fallback patch mode that forwards to the original compiled JS whenever the transpiler cannot yet emit a construct.
- Treat the ANTLR pipeline and emitter as first-class tooling so the project retains full control over semantics and update cadence.

## Semantic Analysis Requirements
ANTLR4 provides syntactic structure but no meaning. A semantic layer annotates the parse tree so the emitter can make correct decisions.

| Concern              | GML Example                   | Reason for semantic metadata                                      |
| -------------------- | ----------------------------- | ----------------------------------------------------------------- |
| Symbol resolution     | `hp = hp - 1;`                | Distinguish between local, instance, and global scopes            |
| Type consistency      | `speed += "fast";`            | Detect invalid operations and drive diagnostics                   |
| Function dispatch     | `scr_attack(target);`         | Resolve whether calls target scripts, methods, or built-ins       |
| Scope boundaries      | `with (obj_enemy) { ... }`    | Track context switches for `self`, `other`, and captured values   |
| Resource references   | `sprite_index = spr_player;`  | Link identifiers to assets for validation and dependency tracking |

A typical pipeline therefore comprises:

1. Parse the source with ANTLR4 to obtain a concrete syntax tree.
2. Walk the tree to populate symbol tables, infer scopes, and annotate nodes.
3. Emit JavaScript using the enriched tree.

Helpful building blocks:

- `antlr4-symboltable` and `antlr4-c3` for scope hierarchy and cross-reference queries.
- Patterns from `eslint-scope`, `babel-traverse`, or `ts-morph` for managing lexical environments and type inference.
- A lightweight GML semantic runtime that mirrors GameMaker scoping (`self`, `other`, `global`) and asset namespaces.

The resulting annotations enable accurate code generation, targeted rebuilds, linting, and future editor integrations such as completions and diagnostics.

## Intermediate Representation Storage
Persisting semantic results in SQLite enables fast queries, tooling, and dependency analysis while retaining a portable JSON interchange format.

### Schema (`schema.sql`)
```sql
-- nodes: every symbol/syntax anchor we care about
CREATE TABLE IF NOT EXISTS nodes (
  id        TEXT PRIMARY KEY,
  kind      TEXT NOT NULL,              -- file|script|var|call|object|event|asset|macro|enum|block
  name      TEXT,
  path      TEXT,                       -- file path, if any
  start_pos INTEGER,                    -- optional: char offset or LSP encoded
  end_pos   INTEGER,
  props_json TEXT                       -- arbitrary JSON payload
);

-- edges: directed relationships
CREATE TABLE IF NOT EXISTS edges (
  id        TEXT PRIMARY KEY,
  type      TEXT NOT NULL,              -- declares|reads|writes|calls|inherits|places_instance|uses_resource
  src       TEXT NOT NULL REFERENCES nodes(id) ON DELETE CASCADE,
  dst       TEXT NOT NULL REFERENCES nodes(id) ON DELETE CASCADE,
  path      TEXT,                       -- file path where the edge occurs
  start_pos INTEGER,
  end_pos   INTEGER,
  props_json TEXT
);

-- fast lookups
CREATE INDEX IF NOT EXISTS idx_nodes_kind ON nodes(kind);
CREATE INDEX IF NOT EXISTS idx_nodes_name ON nodes(name);
CREATE INDEX IF NOT EXISTS idx_nodes_path ON nodes(path);
CREATE INDEX IF NOT EXISTS idx_edges_type ON edges(type);
CREATE INDEX IF NOT EXISTS idx_edges_src ON edges(src);
CREATE INDEX IF NOT EXISTS idx_edges_dst ON edges(dst);

-- full-text search over symbol names and docs/comments if you store them in props_json
CREATE VIRTUAL TABLE IF NOT EXISTS symbol_fts USING fts5(
  id UNINDEXED,                         -- node id (not tokenized)
  name,                                 -- tokenized
  content                               -- optional: docstring/comments
);

-- upsert helpers
CREATE TABLE IF NOT EXISTS meta (
  k TEXT PRIMARY KEY,
  v TEXT
);
```

### Ingestion Script (`ingest.ts`)
```typescript
import fs from "node:fs/promises";
import Database from "better-sqlite3";

type IRNode = {
  id: string;
  kind: string;
  name?: string;
  path?: string;
  range?: { start: number; end: number };
  props?: Record<string, unknown>;
};

type IREdge = {
  id: string;
  type: string;
  from: string;
  to: string;
  site?: { path: string; start: number; end: number };
  props?: Record<string, unknown>;
};

type IRDoc = {
  schema_version: number;
  nodes: IRNode[];
  edges: IREdge[];
};

async function main(irPath: string, dbPath: string, schemaPath: string) {
  const [irRaw, schemaSql] = await Promise.all([
    fs.readFile(irPath, "utf8"),
    fs.readFile(schemaPath, "utf8")
  ]);

  const ir: IRDoc = JSON.parse(irRaw);
  const db = new Database(dbPath);
  db.exec("PRAGMA journal_mode = WAL;");
  db.exec(schemaSql);

  const upNode = db.prepare(`
    INSERT INTO nodes (id, kind, name, path, start_pos, end_pos, props_json)
    VALUES (@id, @kind, @name, @path, @start_pos, @end_pos, @props_json)
    ON CONFLICT(id) DO UPDATE SET
      kind=excluded.kind,
      name=excluded.name,
      path=excluded.path,
      start_pos=excluded.start_pos,
      end_pos=excluded.end_pos,
      props_json=excluded.props_json;
  `);

  const upEdge = db.prepare(`
    INSERT INTO edges (id, type, src, dst, path, start_pos, end_pos, props_json)
    VALUES (@id, @type, @src, @dst, @path, @start_pos, @end_pos, @props_json)
    ON CONFLICT(id) DO UPDATE SET
      type=excluded.type,
      src=excluded.src,
      dst=excluded.dst,
      path=excluded.path,
      start_pos=excluded.start_pos,
      end_pos=excluded.end_pos,
      props_json=excluded.props_json;
  `);

  const upFts = db.prepare(`
    INSERT INTO symbol_fts (id, name, content) VALUES (?, ?, ?)
  `);
  const delFts = db.prepare(`DELETE FROM symbol_fts WHERE id = ?`);

  const tx = db.transaction(() => {
    for (const n of ir.nodes) {
      upNode.run({
        id: n.id,
        kind: n.kind,
        name: n.name ?? null,
        path: n.path ?? null,
        start_pos: n.range?.start ?? null,
        end_pos: n.range?.end ?? null,
        props_json: n.props ? JSON.stringify(n.props) : null
      });
      // refresh symbol_fts only for named, user-facing nodes
      delFts.run(n.id);
      if (n.name) upFts.run(n.id, n.name, n.props?.doc ?? "");
    }

    for (const e of ir.edges) {
      upEdge.run({
        id: e.id,
        type: e.type,
        src: e.from,
        dst: e.to,
        path: e.site?.path ?? null,
        start_pos: e.site?.start ?? null,
        end_pos: e.site?.end ?? null,
        props_json: e.props ? JSON.stringify(e.props) : null
      });
    }
  });

  tx();
  console.log(`Ingested ${ir.nodes.length} nodes, ${ir.edges.length} edges → ${dbPath}`);
}

if (process.argv.length < 5) {
  console.error("usage: ts-node ingest.ts <scoped-graph.json> <out.db> <schema.sql>");
  process.exit(1);
}
main(process.argv[2], process.argv[3], process.argv[4]).catch(e => {
  console.error(e);
  process.exit(1);
});
```

## Identifier Resolution Policy
Semantic annotations should classify identifiers deterministically so both the analyzer and emitter agree on emitted form.

### Identifier Classes (priority order)
1. **Local scope** (`var`, parameters, block locals) → emit as bare identifiers in JavaScript; the emitter manages `let`/`const`.
2. **`self` fields** (implicit instance variables) → emit `self.<name>`.
3. **`other` fields** (collision/event context) → emit `other.<name>`.
4. **`global` fields** (`global.x` or bare identifiers resolved as global) → emit `<GLOBALS>.<name>` where `<GLOBALS>` is a runtime object such as `__gm_globals`.
5. **Built-in functions or constants** → emit shimmed references, for example `__gm_bi.array_length_1d`.
6. **Script calls** → emit through the hot registry or wrapper thunk, for example `__call_script("script:scr_name", self, other, [args])`.

Every identifier node should carry `resolved.kind ∈ {local, self_field, other_field, global_field, builtin, script}` to drive emission.

### `with (...)` Lowering
Lower each `with` block to an isolated loop that iterates resolved targets without rewriting the emitter into continuation-passing style.

```javascript
with (expr) {
  // body referencing self/other/locals
}
```

becomes:

```javascript
{
  const __targets = __resolve_with_targets(expr, self, other);
  const __prev_other = other;
  for (let __i = 0; __i < __targets.length; __i += 1) {
    const __wself = __targets[__i];
    // Evaluate body with self := __wself and other := self (GM semantics)
    (function (__wself_inner, __other_inner) {
      const self = __wself_inner;
      const other = __other_inner;
      /* EMIT(body) — with identifier resolution such that:
           - bare identifiers prefer locals, then self fields
           - 'self.x' stays self.x (already mapped)
           - 'other.x' maps to other.x
           - continue to allow 'global' and built-ins
      */
    })(__wself, self);
  }
  other = __prev_other;
}
```

`__resolve_with_targets` returns an array of instances. If the expression resolves to an instance id, return a single-element array. If it resolves to an object type, return every live instance of that object. Special values such as `all` and `noone` map to the full instance list or `[]`. Inside the lowered body, identifiers continue to resolve using the priority rules above (`self`, `other`, `global`, built-ins). Initially, limit `exit` handling to a scoped IIFE return and document restrictions until extended control-flow lowering is required.

## Starter GML → JS Emitter
The emitter below demonstrates how semantic annotations drive JavaScript output for a “pure” subset (literals, expressions, control flow, function calls, and `with`).

```typescript
// emitter.ts
// A minimal GML -> JS emitter using semantic notes.
//
// Assumptions:
// - You have a way to read semantic annotations for a ctx (e.g., maps from the analyzer).
// - You target a function(self, other, args) body (for wrapper hot patches).
//
// Adapt rule names to your grammar.

type SemKind = "local" | "self_field" | "other_field" | "global_field" | "builtin" | "script";

export interface SemanticInfo {
  // You implement these lookups:
  getIdentKind(ctx: any): SemKind;                 // based on identifier node
  getIdentName(ctx: any): string;                  // raw name
  getCallTargetKind(ctx: any): "builtin" | "script" | "unknown";
  getCallTargetName(ctx: any): string;
}

export interface EmitterOptions {
  globalsIdent: string;          // e.g., "__gm_globals"
  builtinsIdent: string;         // e.g., "__gm_bi"
  callScriptIdent: string;       // e.g., "__call_script" or wrapper thunk
  resolveWithTargetsIdent: string; // e.g., "__resolve_with_targets"
}

export class GmlToJsEmitter {
  constructor(private sem: SemanticInfo, private opt: EmitterOptions) {}

  // --- Entry: emit a whole GML code unit into a JS body string
  emitCodeUnit(ctx: any): string {
    // Wrap into a dev-runner compatible body: function(self, other, args) { ... }
    // But we only return the body because wrapper constructs the Function.
    const lines: string[] = [];
    lines.push(`"use strict";`);
    lines.push(`// auto-emitted from GML`);
    lines.push(this.visit(ctx));
    return lines.join("\n");
  }

  // --- Utilities
  private par(s: string) { return `(${s})`; }

  // --- Node visitors (wire to your grammar) -----------------------------
  // Below, 'ctx' carries children like ctx.left, ctx.right, ctx.Identifier(), etc.

  // Statements list / block
  visitBlock(ctx: any): string {
    const parts: string[] = [];
    for (const stmt of ctx.statements ?? []) {
      parts.push(this.visit(stmt));
    }
    return `{\n${parts.join("\n")}\n}`;
  }

  // Variable declaration: var a = 1, b;
  visitVarDecl(ctx: any): string {
    const decls: string[] = [];
    for (const b of ctx.bindings) { // adapt: ctx.varBinding()
      const name = b.Identifier().getText();
      if (b.initializer) {
        decls.push(`let ${name} = ${this.visit(b.initializer)};`);
      } else {
        decls.push(`let ${name};`);
      }
    }
    return decls.join("\n");
  }

  // Assignment: lhs (= | += | -= | *= | /= | %=) expr
  visitAssignment(ctx: any): string {
    const op = ctx.op.text; // '=', '+=', etc.
    const lhs = this.emitLhs(ctx.lhs);
    const rhs = this.visit(ctx.expr);
    return `${lhs} ${op} ${rhs};`;
  }

  private emitLhs(ctx: any): string {
    // Identifier, member, or index expression
    if (ctx.Identifier) return this.emitIdentifier(ctx);
    if (ctx.member) return `${this.visit(ctx.base)}.${ctx.member.getText()}`;
    if (ctx.index) return `${this.visit(ctx.base)}[${this.visit(ctx.index)}]`;
    throw new Error("unsupported LHS");
  }

  // If/Else
  visitIf(ctx: any): string {
    const cond = this.visit(ctx.cond);
    const thenS = this.wrapAsBlock(this.visit(ctx.then));
    const elseS = ctx.else ? ` else ${this.wrapAsBlock(this.visit(ctx.else))}` : "";
    return `if ${this.par(cond)} ${thenS}${elseS}`;
  }

  // While
  visitWhile(ctx: any): string {
    const cond = this.visit(ctx.cond);
    const body = this.wrapAsBlock(this.visit(ctx.body));
    return `while ${this.par(cond)} ${body}`;
  }

  // Repeat N: emit as for-loop (or while) in JS
  visitRepeat(ctx: any): string {
    const count = this.visit(ctx.count);
    const body = this.wrapAsBlock(this.visit(ctx.body));
    // Use numeric for to match GM repeat semantics
    return `{ let __i = 0; const __n = ${count} | 0; while (__i < __n) { __i += 1; ${this.unwrapBlock(body)} } }`;
  }

  // Do .. until(cond) : emulate GM's do-until (exec then check)
  visitDoUntil(ctx: any): string {
    const cond = this.visit(ctx.cond);
    const body = this.wrapAsBlock(this.visit(ctx.body));
    return `do ${body} while (!(${cond}));`;
  }

  // Call expression
  visitCall(ctx: any): string {
    const kind = this.sem.getCallTargetKind(ctx);
    const name = this.sem.getCallTargetName(ctx);
    const args = ctx.args ? ctx.args.map((a: any) => this.visit(a)).join(", ") : "";

    if (kind === "builtin") {
      return `${this.opt.builtinsIdent}.${name}(${args})`;
    }
    if (kind === "script") {
      // Call through wrapper thunk so we preserve runtime call semantics
      return `${this.opt.callScriptIdent}(${JSON.stringify("script:" + name)}, self, other, [${args}])`;
    }
    // Fallback: treat as unknown function in current scope
    return `${name}(${args})`;
  }

  // Identifier (expression position)
  visitIdentifierExpr(ctx: any): string {
    const kind = this.sem.getIdentKind(ctx);
    const name = this.sem.getIdentName(ctx);
    switch (kind) {
      case "local":       return name;
      case "self_field":  return `self.${name}`;
      case "other_field": return `other.${name}`;
      case "global_field":return `${this.opt.globalsIdent}.${name}`;
      case "builtin":     return `${this.opt.builtinsIdent}.${name}`;
      case "script":      // reference to a function value: expose wrapper thunk or a handle
        return `${this.opt.callScriptIdent}.bind(null, ${JSON.stringify("script:" + name)}, self, other)`;
      default:            return name;
    }
  }

  // Member access: base.name
  visitMember(ctx: any): string {
    return `${this.visit(ctx.base)}.${ctx.member.getText()}`;
  }

  // Index access: base[expr]
  visitIndex(ctx: any): string {
    return `${this.visit(ctx.base)}[${this.visit(ctx.index)}]`;
  }

  // Literals
  visitNumber(ctx: any) { return ctx.getText(); }
  visitString(ctx: any) { return ctx.getText(); }
  visitBool(ctx: any)   { return ctx.getText(); }
  visitParen(ctx: any)  { return this.par(this.visit(ctx.expr)); }

  // Binary ops
  visitBinary(ctx: any): string {
    const l = this.visit(ctx.left);
    const r = this.visit(ctx.right);
    const op = this.mapOp(ctx.op.text);
    return `${l} ${op} ${r}`;
  }

  // Unary ops
  visitUnary(ctx: any): string {
    const e = this.visit(ctx.expr);
    const op = this.mapUnary(ctx.op.text);
    return `${op}${this.par(e)}`;
  }

  // 'with (expr) { body }' lowering
  visitWith(ctx: any): string {
    const target = this.visit(ctx.expr);
    const bodyJs = this.visit(ctx.body); // this body still contains identifiers we resolve via self/other rules
    const block = this.wrapAsBlock(bodyJs);
    const tgt = this.opt.resolveWithTargetsIdent;
    return `{
      const __targets = ${tgt}(${target}, self, other);
      const __prev_other = other;
      for (let __i = 0; __i < __targets.length; __i += 1) {
        const __wself = __targets[__i];
        (function(__wself_inner, __other_inner){
          const self = __wself_inner;
          const other = __other_inner;
          ${this.unwrapBlock(block)}
        })(__wself, self);
      }
      other = __prev_other;
    }`;
  }

  // --- helpers ---------------------------------------------------------------
  private visit(ctx: any): string {
    if (!ctx) return "";
    const m = ctx.accept ? ctx.accept.bind(ctx, this) : null;
    if (m) return m(); // if you're using generated Visitor pattern
    // else: direct switch on ctx.type as per your own parse tree shape
    throw new Error("wire visit(...) to your parser’s visitor");
  }

  private wrapAsBlock(s: string): string {
    if (s.startsWith("{")) return s;
    return `{\n${s}\n}`;
  }
  private unwrapBlock(s: string): string {
    if (s.startsWith("{") && s.endsWith("}")) return s.slice(1, -1);
    return s;
  }

  private mapOp(op: string): string {
    switch (op) {
      case "div": return "/";      // integer division — optionally polyfill to match GM semantics
      case "mod": return "%";
      case "and": return "&&";
      case "or":  return "||";
      case "xor": return "^";      // you may want a boolean xor helper
      default:    return op;
    }
  }
  private mapUnary(op: string): string {
    if (op === "not") return "!";
    return op;
  }
}
```

Instantiate the emitter with semantic services and helper identifiers:

```typescript
const emitter = new GmlToJsEmitter(sem, {
  globalsIdent: "__gm_globals",
  builtinsIdent: "__gm_bi",
  callScriptIdent: "__call_script",
  resolveWithTargetsIdent: "__resolve_with_targets"
});
```

## Runtime Helper Shims
Supplement the emitter output with lightweight runtime helpers that back built-ins, script indirection, global storage, and `with` target resolution.

```typescript
// runtime-shims.ts
export const __gm_globals: Record<string, any> = Object.create(null);

// Minimal set; expand as needed
export const __gm_bi = {
  array_length_1d(a: any[]) { return a.length | 0; },
  clamp(x: number, lo: number, hi: number) { return Math.max(lo, Math.min(hi, x)); },
  // ... add more built-ins here
};

// Script-call indirection (compatible with your wrapper)
export function __call_script(id: string, self: any, other: any, args: any[]) {
  const fn = (window as any).__hot?.scripts?.[id] || (window as any).__hot_call_script_original;
  if (typeof fn === "function") {
    // If it's the wrapper’s Function(self, other, args)
    if (fn.length === 3) return fn(self, other, args);
  }
  // Fallback: try original dispatcher if available
  if ((window as any).__hot_call_script_original) {
    return (window as any).__hot_call_script_original(id, self, other, args);
  }
  throw new Error(`script not found: ${id}`);
}

// with(...) target resolution
export function __resolve_with_targets(exprVal: any, self: any, other: any): any[] {
  // Policy:
  // - instance id -> [instance] if alive
  // - object index / constructor -> all instances of that object (implement via project-provided hook)
  // - 'all' -> instance list; 'noone' -> []
  // Provide hooks via window.__gm when running inside real game:
  const gm = (window as any).__gm;
  if (gm?.resolve_with_targets) return gm.resolve_with_targets(exprVal, self, other);
  // Dev fallback: best-effort
  if (exprVal === undefined || exprVal === null) return [];
  if (Array.isArray(exprVal)) return exprVal;
  return [exprVal];
}
```

Semantic analysis produces the annotated IR, the emitter converts those annotations into runnable JavaScript that respects the identifier policy, and the runtime shims supply the minimal host APIs the generated code expects. Storing the same IR in SQLite keeps downstream tooling and dependency checks fast without sacrificing portability.

## Canonical Symbol Index (SCIP)
Use the Sourcegraph Code Intelligence Protocol (SCIP) as the single, canonical representation of symbol definitions and references. SCIP is standardized, compact, and expressive enough to power hot-reload dependency analysis without bespoke formats.

### Why SCIP?
- **Standardized:** actively used within the Sourcegraph ecosystem with stable protobuf definitions and tooling.
- **Compact:** `.scip` protobuf binaries are significantly leaner than LSIF JSON, ideal for rapid reload cycles.
- **Complete for hot reload:** documents, symbols, and occurrences (definition vs. reference) answer “what changed?” and “who depends on it?” instantly.
- **Extensible:** hover text, docstrings, diagnostics, and relationships can be added later without rethinking storage.

### Core Concepts
- **Document:** one source unit (for example, a `.gml` file or embedded event script).
- **Symbol:** fully qualified identifier (script, object, event, macro, enum member, resolved variable).
- **Occurrence:** a range in a document where a symbol appears, tagged as definition or reference.

This structure answers:
- “Changed file → which symbols were defined here?”
- “For each changed symbol → where are its references?” (impacted call sites and owning objects).
- “For each reference → what symbol defines that document?” (maps back to patch targets).

### Deterministic Symbol Naming
Adopt a URI-like scheme: `gml/<kind>/<qualified-name>`. Keep identifiers ASCII and stable.

Examples:
- `gml/script/scr_damage_enemy`
- `gml/object/obj_enemy`
- `gml/event/obj_enemy#Step`
- `gml/macro/MAX_HP`
- `gml/enum/eState::Idle`
- `gml/var/obj_enemy::hp`

### Minimal Hot-Reload Queries
1. **Definitions in file `F`:** read definition occurrences for `F` → `S = {s1, s2, …}`.
2. **Direct dependents:** for each `s ∈ S`, collect reference occurrences; the documents housing those references are impacted.
3. **Patch targets:** always recompile symbols in `S`; optionally recompile direct dependents if closures or cached delegates require rebinding.

Events map cleanly: `gml/event/obj_enemy#Step` ↔ `object:obj_enemy#Step`.

### Performance Guidance
- Load `project.scip` once at dev-server start (typically a few megabytes).
- Maintain in-memory maps:
  - `docPath → occurrences[]`.
  - `symbol → {defs[], refs[]}`.
- On change, update just the affected document’s occurrences and recompute deltas in microseconds—no external database required.

### Workflow Integration
1. Watch `.gml` and embedded `.yy` code.
2. Re-parse on change, run semantics, produce SCIP occurrences for that document.
3. Upsert the document in the in-memory index, gather changed symbols, and query dependents.
4. Emit GML → JS patches for each target symbol and push them through the WebSocket pipeline.

## SCIP Implementation Blueprint
Pragmatic TypeScript snippets below show how to emit and query SCIP using `protobufjs`. Wire them to your grammar and semantic analyzer.

### Install Dependencies
```
npm i protobufjs
# fetch scip.proto from https://github.com/sourcegraph/scip
# then generate TS or load at runtime with protobufjs
```

### Emit a SCIP Index
```typescript
// scip-writer.ts (sketch)
import protobuf from "protobufjs";
// load scip descriptor at init
const root = await protobuf.load("scip.proto");
const Index = root.lookupType("scip.Index");
const Document = root.lookupType("scip.Document");
const Occurrence = root.lookupType("scip.Occurrence");

export type Range = [number, number, number, number]; // [startLine, startCol, endLine, endCol]
export type Role = 0 | 1; // 0=Unspecified, 1=Definition; use Occurrence.Role enum in real code

export interface ScipDocInput {
  relativePath: string;
  occurrences: Array<{
    range: Range;
    symbol: string;
    role: Role;           // Occurrence.Role.DEFINITION or .REFERENCE
  }>;
  // plus: symbolInformation[] if you want docs/hover (optional)
}

export function makeIndex(docs: ScipDocInput[]) {
  const index = Index.create({
    metadata: { toolInfo: { name: "gml-scip", version: "0.1.0" } },
    documents: docs.map(d => Document.create({
      language: "gml",
      relativePath: d.relativePath.replace(/\\/g, "/"),
      occurrences: d.occurrences.map(o => Occurrence.create({
        range: o.range,
        symbol: o.symbol,
        symbolRoles: o.role // 1 = DEF, else REF
      }))
    }))
  });
  return Index.encode(index).finish(); // Uint8Array → write to .scip
}
```

### In-Memory Query Index
```typescript
// scip-index.ts
import protobuf from "protobufjs";
const root = await protobuf.load("scip.proto");
const Index = root.lookupType("scip.Index");

export type Occ = {
  docPath: string;
  range: [number, number, number, number];
  symbol: string;
  isDef: boolean;
};

export class ScipMemoryIndex {
  private byDoc = new Map<string, Occ[]>();
  private defs = new Map<string, Occ[]>(); // symbol -> DEF occurrences
  private refs = new Map<string, Occ[]>(); // symbol -> REF occurrences

  static fromBytes(bytes: Uint8Array) {
    const idx = Index.decode(bytes) as any;
    const m = new ScipMemoryIndex();
    for (const d of idx.documents ?? []) {
      const path = d.relativePath as string;
      const occs: Occ[] = [];
      for (const o of d.occurrences ?? []) {
        const occ: Occ = {
          docPath: path,
          range: o.range as any,
          symbol: o.symbol as string,
          isDef: (o.symbolRoles & 1) === 1 // Role.DEFINITION bit
        };
        occs.push(occ);
        const map = occ.isDef ? m.defs : m.refs;
        const arr = map.get(occ.symbol) ?? [];
        arr.push(occ); map.set(occ.symbol, arr);
      }
      m.byDoc.set(path, occs);
    }
    return m;
  }

  /** Replace (or insert) one document’s occurrences after a re-parse. */
  upsertDocument(path: string, occs: Occ[]) {
    // remove previous
    const prev = this.byDoc.get(path) ?? [];
    for (const p of prev) {
      const map = p.isDef ? this.defs : this.refs;
      const list = map.get(p.symbol);
      if (list) map.set(p.symbol, list.filter(x => !(x.docPath === p.docPath && x.range === p.range)));
    }
    // add new
    this.byDoc.set(path, occs);
    for (const o of occs) {
      const map = o.isDef ? this.defs : this.refs;
      const list = map.get(o.symbol) ?? [];
      list.push(o); map.set(o.symbol, list);
    }
  }

  /** Hot-reload query #1: which symbols are defined in this file? */
  defsInFile(path: string): string[] {
    const occs = this.byDoc.get(path) ?? [];
    const set = new Set<string>();
    for (const o of occs) if (o.isDef) set.add(o.symbol);
    return [...set];
  }

  /** Hot-reload query #2: where are references to a symbol? */
  refsOf(symbol: string): Occ[] {
    return this.refs.get(symbol) ?? [];
  }

  /** Helper: for a ref occurrence, find the defining symbol(s) in that document. */
  defsInDoc(path: string): Occ[] {
    return (this.byDoc.get(path) ?? []).filter(o => o.isDef);
  }
}
```

### Dev-Server Integration
```typescript
// hotdev-pipeline.ts (simplified)
import { ScipMemoryIndex } from "./scip-index";

let scipIndex = ScipMemoryIndex.fromBytes(await fs.readFile("project.scip"));

async function onFileChanged(filePath: string) {
  // 1) Re-parse + semantics → produce occurrences for this doc:
  const docOccs = analyzeToScipOccurrences(filePath); // your analyzer → {range, symbol, role}
  scipIndex.upsertDocument(rel(filePath), docOccs);

  // 2) Changed symbols:
  const changed = scipIndex.defsInFile(rel(filePath));

  // 3) Direct dependents:
  const impactedDocs = new Set<string>();
  for (const sym of changed) {
    for (const ref of scipIndex.refsOf(sym)) impactedDocs.add(ref.docPath);
  }

  // 4) Emit patches:
  const targets = new Set<string>(changed);
  // Optionally also add the defs in impacted docs (if runtime caches closures)
  for (const doc of impactedDocs) {
    for (const def of scipIndex.defsInDoc(doc)) targets.add(def.symbol);
  }

  // 5) For each target symbol, run your GML→JS emitter and push WS patch
  for (const sym of targets) {
    const patch = await emitPatchForSymbol(sym);
    wsBroadcast(patch);
  }
}
```

You can begin with scripts and events, then extend to macros, enums, and variables. Visualization or CI tooling can reuse the same `.scip` file, and if you later mirror data into SQLite you still preserve SCIP as the canonical source.

### Symbol Helpers
```typescript
// scip-symbols.ts
export type GmlSymbolKind = "script" | "event" | "object" | "macro" | "enum" | "var";

export function sym(kind: GmlSymbolKind, name: string): string {
  // Keep ASCII + stable; consumers rely on this for diffs
  return `gml/${kind}/${name}`;
}

// Examples:
// sym("script", "scr_damage_enemy")  -> "gml/script/scr_damage_enemy"
// sym("event", "obj_enemy#Step")     -> "gml/event/obj_enemy#Step"
// sym("var",   "obj_enemy::hp")      -> "gml/var/obj_enemy::hp"
```

### Occurrence Types
```typescript
// scip-types.ts
export type Range4 = [number, number, number, number]; // [startLine, startCol, endLine, endCol]
// Role bitmask per SCIP spec: DEFINITION bit is 1 << 0
export const ROLE_DEF = 1 as const;
export const ROLE_REF = 0 as const;

export interface ScipOccurrence {
  range: Range4;
  symbol: string;
  symbolRoles: typeof ROLE_DEF | typeof ROLE_REF;
}

export interface ScipDocInput {
  relativePath: string;
  occurrences: ScipOccurrence[];
}
```

### Semantic Oracle Interface
```typescript
// sem-oracle.ts
export type SemKind = "local" | "self_field" | "other_field" | "global_field" | "builtin" | "script";

export interface SemOracle {
  // identifier node → kind + resolved fully-qualified name (for scripts/vars)
  kindOfIdent(node: any): SemKind;
  nameOfIdent(node: any): string;         // raw text (e.g., "hp", "scr_damage_enemy")
  qualifiedSymbol(node: any): string | null; // e.g., "gml/script/scr_damage_enemy" or null if non-symbol

  // call node → is this a script call or builtin?
  callTargetKind(node: any): "script" | "builtin" | "unknown";
  callTargetSymbol(node: any): string | null; // symbol if known (e.g., gml/script/xxx)
}
```

### SCIP Occurrence Visitor
```typescript
// analyze-to-scip.ts
import antlr4 from "antlr4";
import { ROLE_DEF, ROLE_REF, ScipDocInput, ScipOccurrence, Range4 } from "./scip-types";
import { SemOracle } from "./sem-oracle";
// generated by ANTLR (adjust import paths to your build layout)
const { GMLLexer } = require("../generated/GMLLexer.js");
const { GMLParser } = require("../generated/GMLParser.js");
const { GMLParserVisitor } = require("../generated/GMLParserVisitor.js");

/** Utilities to build 0-based LSP-like ranges from tokens */
function tokRange(ctx: any): Range4 {
  // ANTLR tokens use 1-based lines, 0-based columns
  const s = ctx.start, e = ctx.stop ?? ctx.start;
  const sl = Math.max(0, (s?.line ?? 1) - 1);
  const sc = Math.max(0, s?.column ?? 0);
  const el = Math.max(sl, (e?.line ?? (s?.line ?? 1)) - 1);
  const ec = Math.max(0, (e?.column ?? sc) + (e?.text?.length ?? 1));
  return [sl, sc, el, ec];
}

export class ScipOccVisitor extends GMLParserVisitor {
  public occs: ScipOccurrence[] = [];
  constructor(private sem: SemOracle) { super(); }

  private push(range: Range4, symbol: string, isDef: boolean) {
    this.occs.push({ range, symbol, symbolRoles: isDef ? ROLE_DEF : ROLE_REF });
  }

  // === Wire these methods to your grammar rules ===

  /** Script/function declaration: mark the identifier token as a DEF */
  // GML 2.x often: function scr_name(...) block
  visitFuncDecl(ctx: any) {
    const idTok = ctx.Identifier?.();                 // adjust to your rule
    if (idTok) {
      const sym = this.sem.qualifiedSymbol(idTok) ?? null;
      if (sym) this.push(tokRange(idTok.symbol ?? idTok), sym, true);
    }
    // Visit children so we record references in the body
    return this.visitChildren(ctx);
  }

  /** Variable declarations (locals): you can skip adding DEF symbols for locals in SCIP */
  visitVarDecl(ctx: any) {
    // If you *do* want locals indexed, invent a var symbol scheme, e.g., gml/var/file::func::name
    return this.visitChildren(ctx);
  }

  /** Identifier use sites: add REFs for script names or global/instance fields you model as symbols */
  visitPrimaryIdentifier(ctx: any) {                  // rename to your identifier rule
    const kind = this.sem.kindOfIdent(ctx);
    // Only record global instance fields or scripts/macros/enums as symbols (skip locals)
    if (kind === "script" || kind === "global_field") {
      const sym = this.sem.qualifiedSymbol(ctx);
      if (sym) this.push(tokRange(ctx), sym, false);
    }
    return null; // don't double-visit children
  }

  /** Calls: add a REF to the target script symbol (builtins usually don't get symbols) */
  visitCallExpr(ctx: any) {                           // rename to your call expr rule
    const k = this.sem.callTargetKind(ctx);
    if (k === "script") {
      const sym = this.sem.callTargetSymbol(ctx);
      if (sym) this.push(tokRange(ctx.Identifier?.() ?? ctx), sym, false);
    }
    // still visit args
    if (ctx.argList) this.visit(ctx.argList);
    return null;
  }

  // Default: visit kids
  visitChildren(node: any) {
    if (!node || !node.children) return null;
    for (const ch of node.children) { if (ch.accept) ch.accept(this); }
    return null;
  }
}

/** Main entry: parse one file, run semantic pass (you provide the oracle), return SCIP doc input */
export function analyzeToScipOccurrences(source: string, relativePath: string, oracle: SemOracle): ScipDocInput {
  const chars = new antlr4.InputStream(source);
  const lexer = new GMLLexer(chars);
  const tokens = new antlr4.CommonTokenStream(lexer as any);
  const parser = new GMLParser(tokens);
  parser.buildParseTrees = true;

  // Root rule: replace with your start nonterminal (e.g., codeUnit / program)
  const tree = parser.codeUnit();

  // Walk & collect occurrences
  const v = new ScipOccVisitor(oracle);
  v.visit(tree);

  return { relativePath: relativePath.replace(/\\/g, "/"), occurrences: v.occs };
}
```

### Dummy Semantic Oracle
```typescript
// sem-oracle-dummy.ts
import { sym } from "./scip-symbols";
import type { SemOracle } from "./sem-oracle";

export function makeDummyOracle(userScripts: Set<string>): SemOracle {
  return {
    kindOfIdent(node: any) {
      const name = node.getText?.() ?? "";
      if (userScripts.has(name)) return "script";
      if (name.startsWith("global_")) return "global_field";
      return "local";
    },
    nameOfIdent(node: any) { return node.getText?.() ?? ""; },
    qualifiedSymbol(node: any) {
      const name = node.getText?.() ?? "";
      if (userScripts.has(name)) return sym("script", name);
      if (name.startsWith("global_")) return sym("var", `global::${name}`);
      return null;
    },
    callTargetKind(node: any) {
      const callee = node.Identifier?.().getText?.() ?? "";
      return userScripts.has(callee) ? "script" : "unknown";
    },
    callTargetSymbol(node: any) {
      const callee = node.Identifier?.().getText?.() ?? "";
      return userScripts.has(callee) ? sym("script", callee) : null;
    }
  };
}
```

### Dev-Server Wiring
```typescript
// hotdev-wire.ts
import fs from "node:fs/promises";
import path from "node:path";
import { analyzeToScipOccurrences } from "./analyze-to-scip";
import { makeDummyOracle } from "./sem-oracle-dummy";
import { ScipMemoryIndex } from "./scip-index";  // from earlier message
import { emitPatchForSymbol, wsBroadcast } from "./your-patch-pipeline"; // your implementation

const scip = new ScipMemoryIndex(); // start empty; or load from file if you persisted one

export async function onFileChanged(absPath: string) {
  const rel = path.relative(process.cwd(), absPath).replace(/\\/g, "/");
  const source = await fs.readFile(absPath, "utf8");

  // TODO: query your symbol table to know which names are scripts. For now, stub:
  const userScripts = new Set<string>(["scr_damage_enemy", "scr_apply_knockback"]);
  const oracle = makeDummyOracle(userScripts);

  // 1) Analyze -> occurrences for this doc
  const doc = analyzeToScipOccurrences(source, rel, oracle);

  // 2) Update in-memory SCIP
  const occs = doc.occurrences.map(o => ({ docPath: doc.relativePath, range: o.range, symbol: o.symbol, isDef: (o.symbolRoles & 1) === 1 }));
  scip.upsertDocument(doc.relativePath, occs);

  // 3) Changed symbols (DEFs in this file)
  const changed = scip.defsInFile(doc.relativePath);

  // 4) Direct dependents (REFs to changed symbols)
  const targets = new Set<string>(changed);
  for (const s of changed) for (const ref of scip.refsOf(s)) {
    for (const def of scip.defsInDoc(ref.docPath)) targets.add(def.symbol);
  }

  // 5) Emit patches
  for (const sym of targets) {
    const patch = await emitPatchForSymbol(sym); // run your GML->JS emitter here
    if (patch) wsBroadcast(patch);
  }
}
```

## Scope-Aware Refactors
Sharing the SCIP index and semantic analyzer across refactoring and formatting enables capture-avoiding renames and scope-aware edits without introducing bespoke formats.

### Architecture Overview
- **Canonical index:** `.scip` file in memory (`ScipMemoryIndex`) plus the semantic analyzer’s scope model.
- **Bidirectional maps:** symbol → occurrences, `docPath` → CST/token stream, and occurrence ↔ CST node locators.
- **Refactor engine:** consumes scopes and occurrences to produce conflict-free workspace edits.
- **Formatter integration:** the Prettier plugin reads CST nodes with semantic hints to preserve qualifiers and trivia.
- **Validation loop:** apply edits in memory, reparse, recompute semantics, verify resolution, format, persist, and hot-reload.

Semantic data flowing back into parser/formatter steps includes symbol identities (`gml/script/...`, `gml/var/...`), occurrence ranges, and binding classifications (local, self, global, script). The formatter looks up these hints while emitting tokens.

### Capture-Avoiding Rename Workflow
Inputs:

- `targetSymbol`: canonical identifier (e.g., `gml/var/obj_enemy::hp`).
- `newName`: desired name.
- `index`: `ScipMemoryIndex`.
- `sem`: semantic oracle providing scope resolution.
- `cstProvider(docPath)`: returns the parsed CST with node locators.

Steps:

1. **Collect sites:** union of definition and reference occurrences for `targetSymbol`.
2. **Determine binding scope:** use the semantic model to locate the definition’s scope node.
3. **Per-file simulation:** locate identifier tokens, build lexical scope chains, and run conflict checks (shadowing, capture, same-scope clashes, resolution drift).
4. **Auto-avoidance strategies:**
   - Alpha-rename conflicting locals within minimal scopes (`name`, `name_1`, …).
   - Qualify instance fields or globals (inject `self.` or `global.`) when locals would capture.
   - Treat `with` bodies in the lowered environment (`self := withTarget`, `other := previousSelf`); block renames there until fully supported.
5. **Workspace edits:** create `TextEdit` entries for primary renames and qualifier/alpha edits; sort edits descending by offset per file.
6. **Dry-run validation:** apply edits in memory, reparse changed files, regenerate SCIP occurrences, remap the symbol to `newName`, and verify references still resolve to the same entity.
7. **Finalize:** format changed files, write to disk, and emit hot-reload patches.

### Workspace Edit Utilities
```typescript
type TextEdit = { path: string; start: number; end: number; newText: string };
type FileEdits = { path: string; edits: TextEdit[] };
type WorkspaceEdit = FileEdits[];

function applyEditsToText(src: string, edits: TextEdit[]): string {
  // edits must be sorted by start DESC
  let out = src;
  for (const e of edits) {
    out = out.slice(0, e.start) + e.newText + out.slice(e.end);
  }
  return out;
}
```

### Rename Planner Skeleton
```typescript
async function planRename(
  targetSymbol: string,
  newName: string,
  scip: ScipMemoryIndex,
  sem: SemanticOracle,
  cstProvider: (path: string) => Promise<CST>
): Promise<WorkspaceEdit> {
  const defs = scip.defsOf(targetSymbol);   // implement: list of Occ
  if (defs.length !== 1) throw new Error("Ambiguous rename target; need exactly one DEF.");
  const sites = [...defs, ...scip.refsOf(targetSymbol)];

  const byFile = new Map<string, TextEdit[]>();

  for (const site of sites) {
    const cst = await cstProvider(site.docPath);
    const node = cst.locate(site.range);  // your node locator returning token node
    if (!node || node.kind !== "Identifier") continue;

    // 1) Compute scope chain at node
    const chain = sem.scopeChain(site.docPath, node.start); // closest → outer

    // 2) Conflict checks
    const conflicts = detectConflicts(chain, newName, sem, site, targetSymbol);

    // 3) Auto-avoidance & extra edits
    const extraEdits: TextEdit[] = [];
    for (const c of conflicts) {
      if (c.kind === "capture") {
        // alpha-rename the inner local that would capture
        const newLocal = suggestSafeVariant(c.localName, sem, c.scope);
        extraEdits.push(...renameLocalInScope(c.scope, c.localName, newLocal, cst, sem));
      } else if (c.kind === "shadow_local_uses") {
        // qualify uses as self.newName or global.newName
        extraEdits.push(...qualifyUses(site.docPath, c.uses, c.qualifier)); // inject "self." or "global."
      } else if (c.kind === "same_scope_clash") {
        throw new Error(`Name '${newName}' already declared in the same scope at ${c.at.path}:${c.at.startLine}`);
      }
    }

    // 4) Primary edit: rename token
    const primary: TextEdit = { path: site.docPath, start: node.start, end: node.end, newText: newName };

    const arr = byFile.get(site.docPath) ?? [];
    arr.push(primary, ...extraEdits);
    byFile.set(site.docPath, arr);
  }

  // Sort edits per file (descending by start)
  const ws: WorkspaceEdit = [];
  for (const [path, edits] of byFile) {
    edits.sort((a, b) => b.start - a.start);
    ws.push({ path, edits });
  }
  return ws;
}
```

Helpers such as `detectConflicts`, `renameLocalInScope`, `qualifyUses`, and `suggestSafeVariant` draw on the scope tree and can expand over time.

### Apply, Validate, and Format
```typescript
async function applyRenameWithValidation(ws: WorkspaceEdit, read: (p:string)=>Promise<string>, write:(p:string,s:string)=>Promise<void>) {
  // In-memory apply + reparse changed docs
  const changed: string[] = [];
  for (const fe of ws) {
    const src = await read(fe.path);
    const text = applyEditsToText(src, fe.edits);
    await write(fe.path + ".tmp", text); // or keep in memory if your parser takes strings
    changed.push(fe.path);
  }

  // Reparse + recompute semantics for changed docs only
  await reindexScipForDocuments(changed); // updates your ScipMemoryIndex in RAM

  // Verify: all reference occurrences for the *entity* still resolve to the new symbol id
  // You’ll remap the symbol id: e.g., gml/var/obj_enemy::hp -> gml/var/obj_enemy::newName
  const ok = await verifyResolutionStability(changed);
  if (!ok) throw new Error("Post-rename semantic verification failed.");

  // Replace physical files, run Prettier on them
  for (const fe of ws) {
    const tmp = await read(fe.path + ".tmp");
    await write(fe.path, prettierFormat(tmp, fe.path));
  }
}
```

### Formatter Semantic Hints
```typescript
type SemHints = {
  // by (docPath, offset) → resolved symbol (‘self_field’, ‘global_field’, etc.)
  identifiers: Record<number, { kind: "local"|"self_field"|"global_field"|"script", symbol?: string }>;
};

format(source, { semHints: SemHints });
```

Semantic hints let the formatter decide when to emit qualifiers (`self.`, `global.`), enforce enum/macro casing, and maintain wrapping after refactors.

### GML-Specific Policies
- **`with(...)`:** plan renames in the lowered environment; initially block renames there until the scope simulation is complete.
- **Collision events:** remember `other` flips context; prefer qualifying identifiers.
- **Macros/enums:** treat as global constants; prevent collisions unless declarations are updated.
- **Generated IDs:** if resource IDs depend on names, add migration hooks to update metadata alongside code edits.

### Refactor Checklist
1. Provide occurrence ↔ CST node locators.
2. Implement conflict detection for locals and instance fields.
3. Auto-qualify uses when locals would shadow renamed fields.
4. Validate by reparsing and verifying definition/reference stability.
5. Feed semantic hints into the formatter to preserve qualifiers.
6. Expose a CLI (for example, `gm refactor rename --symbol gml/var/obj_enemy::hp --to health`).
7. Emit hot-reload patches for affected scripts/events after writes.



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
