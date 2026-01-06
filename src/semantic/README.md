# Semantic Analyzer Subsystem

This `src/semantic` subsystem is a semantic layer that annotates parse tree(s) to add *meaning* to the parsed GML code so the emitter/transpiler can make correct decisions. See the plan for this component/feature in [../../docs/semantic-scope-plan.md](../../docs/semantic-scope-plan.md).

## Semantic Oracle

The `BasicSemanticOracle` class bridges the scope tracker and transpiler, providing identifier classification and symbol resolution for accurate code generation.

### Usage

```typescript
import { Semantic } from "@gml-modules/semantic";

const tracker = new Semantic.ScopeTracker({ enabled: true });
const builtins = new Set(["show_debug_message", "array_length"]);
const scripts = new Set(["scr_player_move", "scr_enemy_attack"]);
const oracle = new Semantic.BasicSemanticOracle(tracker, builtins, scripts);

// Classify an identifier
const kind = oracle.kindOfIdent({ name: "myVar" }); 
// Returns: "local" | "global_field" | "builtin" | "script"

// Generate SCIP-style symbol for hot reload tracking
const symbol = oracle.qualifiedSymbol({ name: "scr_player_move" });
// Returns: "gml/script/scr_player_move"

// Determine call target type
const callKind = oracle.callTargetKind({
    type: "CallExpression",
    object: { name: "array_length" }
}); 
// Returns: "builtin" | "script" | "unknown"

// Get SCIP symbol for call target
const callSymbol = oracle.callTargetSymbol({
    type: "CallExpression",
    object: { name: "scr_player_move" }
});
// Returns: "gml/script/scr_player_move"
```

### Features

- **Identifier classification**: Uses scope resolution to classify identifiers as `local`, `global_field`, `builtin`, or `script`
- **SCIP symbol generation**: Produces SCIP-style symbols for project-wide tracking and hot reload coordination
- **Call target analysis**: Distinguishes builtin functions from script calls and unknown callables
- **Fallback mode**: Works without a scope tracker by returning sensible defaults
- **Type safety**: Uses type guards and helper functions for safe object validation

### Classification Priority

1. Global identifiers (explicit `isGlobalIdentifier` flag)
2. Built-in functions (matched against provided builtin set)
3. Script names (matched against provided script set)
4. Scope-resolved declarations (using scope chain walking)
5. Default to `local` for unresolved identifiers

**Note**: The oracle currently does not distinguish `self_field` or `other_field` kinds. These require richer context from the parser or project index and are deferred to future iterations.

### SCIP Symbol Format

SCIP symbols follow a deterministic URI-like format for cross-reference tracking:

- Scripts: `gml/script/{name}` (e.g., `gml/script/scr_player_move`)
- Global variables: `gml/var/global::{name}` (e.g., `gml/var/global::player_hp`)
- Built-ins: `gml/macro/{name}` (e.g., `gml/macro/array_length`)
- Local variables: `null` (locals don't need project-wide tracking)

These symbols enable hot reload pipelines to track dependencies and coordinate invalidation when symbols change.

## Declaration Metadata

Each symbol declaration tracked by the `ScopeTracker` includes rich metadata that enables precise analysis and efficient hot reload coordination:

### Declaration Metadata Structure

```javascript
{
  name: string,                    // Symbol name
  scopeId: string,                 // Scope where declared
  classifications: string[],       // Classification tags (e.g., ["identifier", "declaration", "variable"])
  declarationKind: string | null,  // Explicit kind: "variable", "parameter", "function", etc.
  start: { line, index, column },  // Start location
  end: { line, index, column }     // End location
}
```

### Declaration Kind

The `declarationKind` field provides a first-class property for identifying the type of declaration, making queries faster and more explicit than parsing the `classifications` array. Common declaration kinds include:

- `"variable"` - Variable declarations
- `"parameter"` - Function parameters
- `"function"` - Function declarations
- `"script"` - Script definitions
- `"enum"` - Enum members
- `"macro"` - Macro definitions

The declaration kind is captured from the `kind` field in the `role` parameter passed to `declare()`:

```javascript
tracker.declare("myVar", node, { kind: "variable" });
tracker.declare("x", node, { kind: "parameter" });
tracker.declare("initGame", node, { kind: "function" });
```

When no `kind` is provided, `declarationKind` is `null`.

**Use case:** Hot reload systems can query declarations by kind to implement targeted invalidation strategies. For example, when function signatures change, query all `"parameter"` declarations to validate arity; when updating variable initializers, query all `"variable"` declarations to rebuild initialization sequences.

## Symbol Resolution Queries

The `ScopeTracker` provides query methods that enable hot reload coordination and dependency tracking:

### `getAllSymbolsSummary()`

Get a global summary of all symbols across all scopes. Returns aggregated metadata for each unique symbol showing which scopes declare and reference it, along with occurrence counts. This provides a bird's-eye view of the entire symbol table without iterating through individual scopes.

```javascript
const tracker = new ScopeTracker({ enabled: true });
// ... track declarations and references across multiple scopes ...
const summary = tracker.getAllSymbolsSummary();
// Returns: [
//   {
//     name: "GameState",
//     scopeCount: 3,
//     declarationCount: 1,
//     referenceCount: 5,
//     scopes: [
//       { scopeId: "scope-0", scopeKind: "program", hasDeclaration: true, hasReference: false },
//       { scopeId: "scope-1", scopeKind: "function", hasDeclaration: false, hasReference: true },
//       { scopeId: "scope-2", scopeKind: "function", hasDeclaration: false, hasReference: true }
//     ]
//   },
//   { name: "localVar", scopeCount: 1, declarationCount: 1, referenceCount: 2, scopes: [...] }
// ]
```

**Use case:** Quick assessment of symbol usage patterns for hot reload coordination. Provides a global view of which symbols are most widely used across the project, helping identify high-impact symbols that require careful invalidation when modified. The aggregated counts enable prioritization of hot reload optimizations and detection of potential bottlenecks in dependency graphs.

### `getScopeOccurrences(scopeId, options)`

Export declaration and reference metadata for a single scope without scanning
the entire graph. Useful when responding to focused hot reload events that only
touch one file.

```javascript
const result = tracker.getScopeOccurrences("scope-1", {
    includeReferences: false
});
// Returns:
// {
//   scopeId: "scope-1",
//   scopeKind: "block",
//   lastModified: 1703123458000,
//   modificationCount: 2,
//   identifiers: [
//     {
//       name: "localVar",
//       declarations: [...],
//       references: []
//     }
//   ]
// }
```

**Use case:** Emit targeted invalidation payloads for a single scope. The method
mirrors `exportOccurrences` but avoids iterating through every scope in the
tracker, making per-file queries cheaper during hot reload. The response also
includes modification timestamps and counters so hot reload pipelines can
detect freshness without issuing separate metadata lookups.

### `getSymbolOccurrences(name)`

Find all occurrences (declarations and references) of a specific symbol across all scopes. Returns an array of occurrence records with scope context.

```javascript
const tracker = new ScopeTracker({ enabled: true });
// ... track declarations and references ...
const occurrences = tracker.getSymbolOccurrences("myVariable");
// Returns: [
//   { scopeId: "scope-0", scopeKind: "function", kind: "declaration", occurrence: {...} },
//   { scopeId: "scope-1", scopeKind: "block", kind: "reference", occurrence: {...} }
// ]
```

**Use case:** Identify what needs to be recompiled when a symbol changes, supporting faster invalidation in hot reload pipelines.

### `getScopeSymbols(scopeId)`

Get all unique identifier names declared or referenced in a specific scope. Returns an array of symbol names.

```javascript
const symbols = tracker.getScopeSymbols("scope-0");
// Returns: ["param1", "param2", "localVar"]
```

**Use case:** Track dependencies and enable selective recompilation by understanding which symbols are used in each scope.

### `resolveIdentifier(name, scopeId)`

Resolve an identifier to its declaration metadata by walking up the scope chain. Implements proper lexical scoping rules with shadowing support.

```javascript
const declaration = tracker.resolveIdentifier("myVar", "scope-1");
// Returns: { name: "myVar", scopeId: "scope-0", classifications: [...], start: {...}, end: {...} }
```

**Use case:** Accurate binding resolution for transpilation, enabling correct code generation that respects lexical scope boundaries.

### `getScopeChain(scopeId)`

Get the parent scope chain for a given scope, walking from the specified scope up to the root. Returns an array of scope descriptors from nearest to root.

```javascript
const chain = tracker.getScopeChain("scope-2");
// Returns: [
//   { id: "scope-2", kind: "block" },
//   { id: "scope-1", kind: "function" },
//   { id: "scope-0", kind: "program" }
// ]
```

**Use case:** Efficient dependency tracking and faster invalidation in hot reload pipelines by traversing lexical scope hierarchies without walking the full scope stack.

### `getScopeDefinitions(scopeId)`

Get all declarations defined directly in a specific scope (not including parent scopes). Returns an array of declaration records with names and metadata.

```javascript
const definitions = tracker.getScopeDefinitions("scope-1");
// Returns: [
//   { name: "localVar", metadata: { scopeId: "scope-1", classifications: [...], start: {...}, end: {...} } },
//   { name: "param", metadata: { scopeId: "scope-1", classifications: [...], start: {...}, end: {...} } }
// ]
```

**Use case:** Identify what symbols are defined in a particular file or scope unit for hot reload coordination. When a file changes, query its scope's definitions to determine which symbols need to be recompiled and which dependent files need to be invalidated.

### `getAllDeclarations()`

Get all symbol declarations across all scopes in the tracker. Returns an array of declaration records with scope context, enabling project-wide symbol analysis for dependency graphs, refactoring, and hot reload coordination.

```javascript
const tracker = new ScopeTracker({ enabled: true });
// ... track declarations across multiple scopes ...
const allDeclarations = tracker.getAllDeclarations();
// Returns: [
//   { name: "GameState", scopeId: "scope-0", scopeKind: "program", metadata: {...} },
//   { name: "globalVar", scopeId: "scope-0", scopeKind: "program", metadata: {...} },
//   { name: "localVar", scopeId: "scope-1", scopeKind: "function", metadata: {...} },
//   { name: "param", scopeId: "scope-1", scopeKind: "function", metadata: {...} }
// ]
```

**Use case:** Build a complete symbol table for the project to power IDE features (go-to-definition, find-all-references), refactoring tools (rename, extract function), and hot reload dependency tracking. The method returns declarations sorted by scope ID then symbol name for consistent iteration.

### `getDeclarationInScope(name, scopeId)`

Get metadata for a specific symbol declaration by name and scope. Returns the declaration metadata if found, or null if the symbol is not declared in the specified scope.

```javascript
const metadata = tracker.getDeclarationInScope("localVar", "scope-1");
// Returns: { name: "localVar", scopeId: "scope-1", classifications: [...], start: {...}, end: {...} }
```

**Use case:** Efficient single-symbol lookup when you need to check if a symbol is declared in a known scope. This is more efficient than `getAllDeclarations()` for targeted queries during incremental analysis or refactoring validation.

### `getDeclarationsByKind(declarationKind)`

Get all declarations of a specific kind across all scopes. This enables targeted queries for hot reload coordination and refactoring tools that need to find all declarations of a particular type.

```javascript
const tracker = new ScopeTracker({ enabled: true });
// ... track declarations across multiple scopes ...

// Find all function declarations
const functions = tracker.getDeclarationsByKind("function");
// Returns: [
//   { name: "initGame", scopeId: "scope-0", scopeKind: "program", metadata: {...} },
//   { name: "update", scopeId: "scope-0", scopeKind: "program", metadata: {...} }
// ]

// Find all parameters
const parameters = tracker.getDeclarationsByKind("parameter");
// Returns: [
//   { name: "x", scopeId: "scope-1", scopeKind: "function", metadata: {...} },
//   { name: "y", scopeId: "scope-1", scopeKind: "function", metadata: {...} }
// ]
```

**Use case:** When a declaration kind's semantics change (e.g., function signature updates), query all declarations of that kind to identify affected scopes for selective recompilation. For example, finding all function declarations to rebuild function tables, or all parameter declarations to validate arity changes during hot reload.

### `getScopeDeclarationKindStats(scopeId)`

Get declaration kind statistics for a specific scope. This aggregates counts of each declaration kind to provide a quick overview of what types of symbols are defined in a scope.

```javascript
const stats = tracker.getScopeDeclarationKindStats("scope-1");
// Returns: {
//   total: 5,
//   byKind: Map {
//     "parameter" => 2,
//     "variable" => 3
//   }
// }
```

**Use case:** During hot reload, query scope statistics to determine whether a scope defines functions, variables, or parameters, and optimize the recompilation strategy accordingly. Scopes with many function declarations may require different invalidation strategies than scopes with only variable declarations.

### `getScopesForSymbol(name)`

Get all scope IDs that contain occurrences (declarations or references) of a specific symbol. This method uses an internal index for O(1) average-case lookup, making it significantly faster than scanning all scopes.

```javascript
const scopeIds = tracker.getScopesForSymbol("myVariable");
// Returns: ["scope-0", "scope-2", "scope-5"]
```

**Use case:** Hot reload invalidation optimization. When a symbol changes, quickly identify all scopes that need recompilation without iterating through the entire scope tree. This is particularly valuable for large projects where linear scans would be prohibitively expensive. The index-based lookup provides near-constant-time performance regardless of project size.

### `getScopeExternalReferences(scopeId)`

Get all external references from a specific scope—references to symbols declared in parent or ancestor scopes. Returns an array where each entry includes the symbol name, the scope where it was declared (or `null` if undeclared), and all occurrence records.

```javascript
const externalRefs = tracker.getScopeExternalReferences("scope-1");
// Returns: [
//   { 
//     name: "globalVar", 
//     declaringScopeId: "scope-0", 
//     referencingScopeId: "scope-1",
//     occurrences: [{kind: "reference", name: "globalVar", scopeId: "scope-1", ...}]
//   }
// ]
```

**Use case:** Cross-scope dependency tracking for hot reload coordination. When editing a file/scope, query its external references to understand which parent symbols it depends on. This enables precise invalidation: if a parent scope's symbol changes, you can quickly identify all child scopes that reference it and selectively recompile only the affected code paths. This is essential for efficient hot reload in large projects where rebuilding everything would be prohibitively slow.

### `getScopeDependencies(scopeId)`

Get all scopes that a given scope depends on (scopes it references symbols from). This builds a direct dependency list by analyzing external references and resolving where those symbols are declared.

```javascript
const tracker = new ScopeTracker({ enabled: true });

// Program scope declares symbols
tracker.enterScope("program");
tracker.declare("globalConfig", {...});

// Function scope references global symbols
const fnScope = tracker.enterScope("function");
tracker.reference("globalConfig", {...});

const dependencies = tracker.getScopeDependencies(fnScope.id);
// Returns: [
//   {
//     dependencyScopeId: "scope-0",
//     dependencyScopeKind: "program",
//     symbols: ["globalConfig"]
//   }
// ]
```

**Use case:** When a scope changes, query which scopes it depends on to determine if those dependencies have changed and require recompilation. This enables precise invalidation in hot reload pipelines by understanding the dependency graph.

### `getScopeDependents(scopeId)`

Get all scopes that depend on a given scope (scopes that reference symbols declared in the queried scope). This is the inverse of `getScopeDependencies` and is critical for hot reload invalidation.

```javascript
const tracker = new ScopeTracker({ enabled: true });

// Program scope declares a symbol
const programScope = tracker.enterScope("program");
tracker.declare("globalVar", {...});

// Function scope references the global symbol
const fnScope = tracker.enterScope("function");
tracker.reference("globalVar", {...});

const dependents = tracker.getScopeDependents(programScope.id);
// Returns: [
//   {
//     dependentScopeId: "scope-1",
//     dependentScopeKind: "function",
//     symbols: ["globalVar"]
//   }
// ]
```

**Use case:** When a scope changes, query which scopes depend on it to identify what needs to be invalidated and recompiled. This is essential for efficient hot reload: if scope A declares symbol X and scope B references X, then changing scope A requires recompiling scope B.

### `exportScipOccurrences(options?)`

Export occurrences in SCIP (SCIP Code Intelligence Protocol) format for hot reload coordination and cross-file dependency tracking. SCIP format represents each occurrence with a range tuple `[startLine, startCol, endLine, endCol]`, a qualified symbol identifier, and role flags indicating DEF (declaration) or REF (reference).

```javascript
const tracker = new ScopeTracker({ enabled: true });
tracker.enterScope("program");
tracker.declare("gameState", {
    name: "gameState",
    start: { line: 1, column: 0, index: 0 },
    end: { line: 1, column: 9, index: 9 }
});
tracker.reference("gameState", {
    name: "gameState",
    start: { line: 5, column: 4, index: 50 },
    end: { line: 5, column: 13, index: 59 }
});

const scipData = tracker.exportScipOccurrences();
// Returns: [
//   {
//     scopeId: "scope-0",
//     scopeKind: "program",
//     occurrences: [
//       { range: [1, 0, 1, 9], symbol: "scope-0::gameState", symbolRoles: 1 },  // DEF
//       { range: [5, 4, 5, 13], symbol: "scope-0::gameState", symbolRoles: 0 }  // REF
//     ]
//   }
// ]
```

**Options:**
- `scopeId`: Limit export to a specific scope (omit for all scopes)
- `includeReferences`: Include reference occurrences (default: `true`)
- `symbolGenerator`: Custom function to generate qualified symbol names. Default format is `"scopeId::name"`.

**Use case:** When a file changes during hot reload, export its SCIP occurrences to determine which symbols changed and which dependent files need recompilation. The SCIP format enables:
- Tracking which symbols are defined/referenced in each file
- Building cross-file dependency graphs for selective recompilation
- Identifying downstream code that needs invalidation when symbols change
- Supporting IDE features like go-to-definition and find-all-references

The custom symbol generator allows integration with project-wide symbol naming schemes. For example, use `(name, scopeId) => "gml/script/" + name` to match the transpiler's qualified symbol format for scripts.

## Scope Modification Tracking

The `ScopeTracker` maintains modification metadata for each scope, enabling efficient incremental hot reload by tracking when scopes change and identifying which scopes need recompilation.

### `getScopeModificationMetadata(scopeId)`

Get modification metadata for a specific scope, including the last modification timestamp and total modification count.

```javascript
const metadata = tracker.getScopeModificationMetadata("scope-1");
// Returns: {
//   scopeId: "scope-1",
//   scopeKind: "function",
//   lastModified: 1703123456789,
//   modificationCount: 5
// }
```

**Use case:** Track when specific scopes were last modified to determine if they need recompilation during hot reload.

### `getModifiedScopes(sinceTimestamp)`

Get all scopes modified after a specific timestamp. This enables incremental hot reload by identifying only the scopes that have changed since the last compilation.

```javascript
const lastCompileTime = Date.now();
// ... user makes changes ...
const modifiedScopes = tracker.getModifiedScopes(lastCompileTime);
// Returns: [
//   { scopeId: "scope-2", scopeKind: "block", lastModified: 1703123457000, modificationCount: 3 }
// ]
```

**Use case:** Incremental compilation during hot reload. Instead of rebuilding the entire project, identify and recompile only the scopes that changed since the last build, dramatically reducing compilation time.

### `getMostRecentlyModifiedScope()`

Get the most recently modified scope across all tracked scopes.

```javascript
const mostRecent = tracker.getMostRecentlyModifiedScope();
// Returns: {
//   scopeId: "scope-3",
//   scopeKind: "function",
//   lastModified: 1703123458000,
//   modificationCount: 2
// }
```

**Use case:** Quick identification of the latest change in the symbol table for hot reload coordination and incremental invalidation.

### `getScopeModificationDetails(scopeId)`

Get detailed modification metadata for a specific scope, including counts of declarations and references tracked. This provides richer information than `getScopeModificationMetadata` for hot reload systems that need to understand what type of changes occurred in a scope.

```javascript
const details = tracker.getScopeModificationDetails("scope-1");
// Returns: {
//   scopeId: "scope-1",
//   scopeKind: "function",
//   lastModified: 1703123456789,
//   modificationCount: 5,
//   declarationCount: 2,
//   referenceCount: 3,
//   symbolCount: 2,
//   symbols: [
//     { name: "localVar", declarationCount: 1, referenceCount: 2 },
//     { name: "param", declarationCount: 1, referenceCount: 1 }
//   ]
// }
```

**Use case:** Smart hot reload invalidation decisions. When a scope changes, query its modification details to understand the nature of the change. For example, if only references were added (no new declarations), dependent scopes may not need full recompilation. The per-symbol breakdown enables precise tracking of which symbols drive the modification count, helping hot reload systems prioritize invalidation of high-impact symbols over low-impact ones.

## Usage Context Tracking

Occurrences now include `usageContext` metadata that distinguishes how identifiers are used (read vs. write, call target, etc.), enabling smarter dependency analysis and invalidation.

### `getSymbolWrites(name)`

Get all write operations (assignments) for a specific symbol across all scopes. This supports hot reload invalidation by identifying which scopes write to a symbol.

```javascript
const writes = tracker.getSymbolWrites("counter");
// Returns: [
//   {
//     scopeId: "scope-1",
//     scopeKind: "function",
//     occurrence: {
//       kind: "reference",
//       name: "counter",
//       usageContext: { isWrite: true, isAssignmentTarget: true },
//       ...
//     }
//   }
// ]
```

**Use case:** Precise dependency tracking. When a variable's value changes, identify exactly which scopes perform writes to enable targeted invalidation for hot reload.

### `getSymbolReads(name)`

Get all read operations for a specific symbol across all scopes. This helps identify dependencies when a symbol's value changes.

```javascript
const reads = tracker.getSymbolReads("gameState");
// Returns: [
//   {
//     scopeId: "scope-2",
//     scopeKind: "block",
//     occurrence: {
//       kind: "reference",
//       name: "gameState",
//       usageContext: { isRead: true },
//       ...
//     }
//   }
// ]
```

**Use case:** Identify which scopes read a symbol to enable targeted invalidation during hot reload. When a symbol's value changes, recompile only the scopes that actually read it.

### Usage Context Properties

Each reference occurrence includes a `usageContext` object with the following properties:

- `isRead`: `true` if the identifier is read
- `isWrite`: `true` if the identifier is written/assigned to
- `isAssignmentTarget`: `true` if the identifier appears on the left side of an assignment
- `isCallTarget`: `true` if the identifier is being called as a function
- `parentType`: Optional string indicating the parent AST node type

**Note:** Declarations have `usageContext: null` since they establish bindings rather than use them.

## Identifier Case Bootstrap Controls

Formatter options that tune project discovery and cache behaviour now live in
the semantic layer. They continue to be part of the plugin’s public surface,
but their canonical documentation sits here alongside the implementation.

| Option | Default | Summary |
| --- | --- | --- |
| `gmlIdentifierCaseDiscoverProject` | `true` | Controls whether the formatter auto-discovers the nearest `.yyp` manifest to bootstrap the project index. |
| `gmlIdentifierCaseProjectRoot` | `""` | Pins project discovery to a specific directory when auto-detection is undesirable (e.g. CI or monorepos). |
| `gmlIdentifierCaseProjectIndexCacheMaxBytes` | `8 MiB` | Upper bound for the persisted project-index cache. Set the option or `GML_PROJECT_INDEX_CACHE_MAX_SIZE` to `0` to disable the size guard when coordinating cache writes manually. |
| `gmlIdentifierCaseProjectIndexConcurrency` | `4` (overridable via `GML_PROJECT_INDEX_CONCURRENCY`, clamped between `1` and the configured max; defaults to `16` via `GML_PROJECT_INDEX_MAX_CONCURRENCY`) | Caps how many GameMaker source files are parsed in parallel while building the identifier-case project index. |

When rolling out rename scopes, continue to warm the project index cache
before enabling write mode so the semantic layer can reuse cached dependency
analysis. The bootstrap generates `.prettier-plugin-gml/project-index-cache.json`
the first time a rename-enabled scope executes; pin `gmlIdentifierCaseProjectRoot`
in CI builds to avoid repeated discovery work.

## Resource Metadata Extension Hook
> TODO: Remove this option/extension – handling custom resource metadata is out of scope. Keep this implementation 'opinionated'.

**Pre-change analysis.** The project index previously treated only `.yy`
resource documents as metadata, so integrations experimenting with alternate
GameMaker exports (for example, bespoke build pipelines that emit `.meta`
descriptors) had to fork the scanner whenever they wanted those files to be
indexed. The formatter’s defaults remain correct for the vast majority of
users, so the new seam keeps the behavior opinionated while allowing internal
callers to extend it on demand.

Use `setProjectResourceMetadataExtensions()` from the semantic project-index
package to register additional metadata suffixes. The helper normalizes and
deduplicates the list, seeds it with the default `.yy` entry, and is intended
for host integrations, tests, or future live tooling—not end-user
configuration. `resetProjectResourceMetadataExtensions()` restores the
defaults, and `getProjectResourceMetadataExtensions()` exposes the frozen list
for diagnostics. Production consumers should treat the defaults as canonical
until downstream formats stabilize; the hook exists to unblock experimentation
without diluting the formatter’s standard behavior.


## TODO
- Align the structure of `semantic` with the plan outlined in
  [../../docs/semantic-scope-plan.md](../../docs/semantic-scope-plan.md).