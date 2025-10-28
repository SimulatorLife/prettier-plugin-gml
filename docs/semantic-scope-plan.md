# Semantic Scope & Transpiler Plan

This document captures the semantic analysis, scope management, and transpiler planning that underpin the live-reloading pipeline. The live runtime hooks described in [live-reloading concept](./live-reloading-concept.md) depend on these facilities to turn edited GML into hot-swappable JavaScript patches.

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
    // Returning `null` short-circuits ANTLR's default `visitChildren` fallback.
    // The semantic hooks above already captured the identifier occurrence, so
    // letting the base visitor run would enqueue the same node twice and emit
    // duplicate SCIP references. See "Formatter Semantic Hints" later in this
    // document for details on how the visitor cooperates with the symbol
    // pipeline.
    return null;
  }

  /** Calls: add a REF to the target script symbol (builtins usually don't get symbols) */
  visitCallExpr(ctx: any) {                           // rename to your call expr rule
    const k = this.sem.callTargetKind(ctx);
    if (k === "script") {
      const sym = this.sem.callTargetSymbol(ctx);
      if (sym) this.push(tokRange(ctx.Identifier?.() ?? ctx), sym, false);
    }
    // Even though we return `null` to suppress the base visitor, we still
    // descend into the argument list manually. That ensures nested call
    // expressions bubble up their own occurrences before this frame unwinds,
    // matching the expectations laid out in the "Semantic Oracle Interface"
    // section below.
    if (ctx.argList) this.visit(ctx.argList);
    return null;
  }

  // Default: visit kids. Falling back to the generic traversal keeps the
  // custom visitor aligned with ANTLR's breadth of grammar coverage while
  // still allowing the targeted overrides above to intercept special cases.
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
import { ScipMemoryIndex } from "./scip-index"; // from earlier message
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
  const occs = doc.occurrences.map((occurrence) => ({
    docPath: doc.relativePath,
    range: occurrence.range,
    symbol: occurrence.symbol,
    isDef: (occurrence.symbolRoles & 1) === 1
  }));
  scip.upsertDocument(doc.relativePath, occs);

  // 3) Changed symbols (DEFs in this file)
  const changed = scip.defsInFile(doc.relativePath);

  // 4) Direct dependents (REFs to changed symbols)
  const targets = new Set<string>(changed);
  for (const changedSymbol of changed) {
    for (const reference of scip.refsOf(changedSymbol)) {
      for (const definition of scip.defsInDoc(reference.docPath)) {
        targets.add(definition.symbol);
      }
    }
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
