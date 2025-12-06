# Refactor Engine Module

This package will power semantic refactoring workflows such as safe renames, as outlined in
`docs/semantic-scope-plan.md` and the hot-reload lifecycle in `docs/live-reloading-concept.md`.
It consumes parser spans and semantic bindings to plan WorkspaceEdits that the CLI can apply
atomically across the project.

## Responsibilities
- Query parser span data and semantic bindings to map identifiers to source ranges.
- Plan edits that avoid scope capture or shadowing, and surface validation diagnostics.
- Offer composable helpers so CLI commands can trigger refactors and post-formatting steps.
- Re-run targeted analysis after edits to ensure symbol bindings remain stable.
- Support batch rename operations for refactoring related symbols atomically.
- Provide detailed impact analysis for dry-run scenarios.
- Validate hot reload compatibility to ensure refactored code can be patched live.

## Features

### Rename Operations

#### Single Symbol Rename
```javascript
const engine = new RefactorEngine({ semantic, parser, formatter });

// Plan a rename
const workspace = await engine.planRename({
    symbolId: "gml/script/scr_old_name",
    newName: "scr_new_name"
});

// Execute the rename with hot reload support
const result = await engine.executeRename({
    symbolId: "gml/script/scr_old_name",
    newName: "scr_new_name",
    readFile: async (path) => await fs.readFile(path, 'utf8'),
    writeFile: async (path, content) => await fs.writeFile(path, content),
    prepareHotReload: true
});
```

#### Batch Rename
```javascript
// Rename multiple related symbols atomically
const workspace = await engine.planBatchRename([
    { symbolId: "gml/script/scr_enemy_old", newName: "scr_enemy_new" },
    { symbolId: "gml/script/scr_enemy_helper_old", newName: "scr_enemy_helper_new" }
]);

// Execute batch rename
const result = await engine.executeBatchRename({
    renames: [
        { symbolId: "gml/script/scr_a", newName: "scr_x" },
        { symbolId: "gml/script/scr_b", newName: "scr_y" }
    ],
    readFile,
    writeFile,
    prepareHotReload: true
});
```

### Impact Analysis

Analyze the potential impact of a rename before committing to it:

```javascript
const analysis = await engine.analyzeRenameImpact({
    symbolId: "gml/script/scr_player_attack",
    newName: "scr_player_combat"
});

// analysis.summary contains:
// - oldName, newName
// - totalOccurrences, definitionCount, referenceCount
// - affectedFiles (array of file paths)
// - hotReloadRequired (boolean)
// - dependentSymbols (array of symbol IDs that depend on this symbol)

// analysis.conflicts contains any blocking issues
// analysis.warnings contains advisory information
```

### Name Validation

Validate a proposed new name against the project's semantic index to detect
global symbol collisions before attempting a rename:

```javascript
// Check if a name is valid and doesn't conflict with existing symbols
const validation = await engine.validateNewName("scr_new_name");

if (!validation.valid) {
    for (const conflict of validation.conflicts) {
        console.error(`Conflict: ${conflict.message}`);
        if (conflict.existingSymbolId) {
            console.error(`  Existing symbol: ${conflict.existingSymbolId}`);
        }
    }
}

// Exclude the current symbol when renaming (to avoid self-collision)
const renameValidation = await engine.validateNewName(
    "scr_new_name",
    "gml/script/scr_current"  // Symbol being renamed
);

// Skip identifier validation when name is already validated
const globalOnlyValidation = await engine.validateNewName(
    "scr_validated_name",
    "gml/script/scr_current",
    { skipIdentifierValidation: true }
);
```

The `validateNewName` method detects:
- Invalid identifier characters (e.g., hyphens, spaces)
- Global symbol collisions via the semantic analyzer's `hasGlobalSymbol` hook
- Multiple symbol collisions via the `findGlobalSymbolsByName` hook

### Hot Reload Validation

Validate that workspace edits won't break hot reload functionality:

```javascript
const workspace = await engine.planRename({
    symbolId: "gml/script/scr_test",
    newName: "scr_renamed"
});

const validation = await engine.validateHotReloadCompatibility(workspace, {
    checkTranspiler: true
});

if (!validation.valid) {
    console.error("Hot reload issues:", validation.errors);
}

// Check warnings for potential issues
validation.warnings.forEach(warning => {
    console.warn(warning);
});
```

### Workspace Edit Management

```javascript
// Create workspace edits programmatically
const workspace = new WorkspaceEdit();
workspace.addEdit("scripts/player.gml", 10, 20, "newCode");
workspace.addEdit("scripts/enemy.gml", 30, 40, "moreCode");

// Group edits by file (sorted descending for safe application)
const grouped = workspace.groupByFile();

// Validate edits
const validation = await engine.validateRename(workspace);

// Apply edits
const results = await engine.applyWorkspaceEdit(workspace, {
    readFile: async (path) => await fs.readFile(path, 'utf8'),
    writeFile: async (path, content) => await fs.writeFile(path, content),
    dryRun: false
});
```

### Hot Reload Integration

Prepare and generate hot reload updates after a refactor:

```javascript
// Prepare hot reload updates
const hotReloadUpdates = await engine.prepareHotReloadUpdates(workspace);

// Generate transpiler patches
const patches = await engine.generateTranspilerPatches(hotReloadUpdates, readFile);

// patches array contains:
// - symbolId: the symbol being patched
// - patch: the transpiled code patch
// - filePath: source file path
```

#### Advanced: Dependency Cascade Computation

Compute the full transitive closure of dependencies for hot reload operations:

```javascript
// Compute which symbols need reloading and in what order
const cascade = await engine.computeHotReloadCascade([
    "gml/script/scr_changed1",
    "gml/script/scr_changed2"
]);

// cascade.cascade: Array of all symbols that need reloading with metadata
// [
//   { symbolId: "gml/script/scr_changed1", distance: 0, reason: "direct change" },
//   { symbolId: "gml/script/scr_dependent", distance: 1, reason: "depends on scr_changed1" },
//   { symbolId: "gml/script/scr_transitive", distance: 2, reason: "depends on scr_dependent" }
// ]

// cascade.order: Symbols ordered for safe hot reload application (dependencies first)
// ["gml/script/scr_changed1", "gml/script/scr_dependent", "gml/script/scr_transitive"]

// cascade.circular: Array of detected circular dependency chains
// [["gml/script/scr_a", "gml/script/scr_b", "gml/script/scr_a"]]

// cascade.metadata: Summary information
// {
//   totalSymbols: 3,
//   maxDistance: 2,
//   hasCircular: false
// }
```

This is particularly useful for:
- Ensuring all dependent code is reloaded when a base symbol changes
- Detecting circular dependencies that could cause hot reload failures
- Ordering hot reload operations to prevent temporary inconsistencies
- Providing detailed diagnostics about why each symbol needs reloading

## Directory layout
- `src/` – core refactoring primitives and orchestrators.
- `test/` – Node tests that validate refactor strategies against fixture projects.

## API Reference

### RefactorEngine

Main class for coordinating refactoring operations.

**Constructor:**
```javascript
new RefactorEngine({ parser, semantic, formatter })
```

**Methods:**

- `async planRename(request)` - Plan a single symbol rename
- `async planBatchRename(renames)` - Plan multiple renames atomically
- `async executeRename(request)` - Execute a rename with optional hot reload
- `async executeBatchRename(request)` - Execute multiple renames atomically
- `async analyzeRenameImpact(request)` - Analyze impact without applying changes
- `async validateRename(workspace)` - Validate a workspace edit
- `async validateNewName(newName, currentSymbolId, options)` - Validate a proposed name against the semantic index
- `async validateHotReloadCompatibility(workspace, options)` - Check hot reload compatibility
- `async applyWorkspaceEdit(workspace, options)` - Apply edits to files
- `async prepareHotReloadUpdates(workspace)` - Prepare hot reload update metadata
- `async generateTranspilerPatches(hotReloadUpdates, readFile)` - Generate transpiled patches
- `async findSymbolAtLocation(filePath, offset)` - Find symbol at position
- `async validateSymbolExists(symbolId)` - Check if symbol exists
- `async gatherSymbolOccurrences(symbolName)` - Get all occurrences of a symbol
- `async detectRenameConflicts(oldName, newName, occurrences, currentSymbolId)` - Check for naming conflicts
- `async computeHotReloadCascade(changedSymbolIds)` - Compute transitive dependency closure for hot reload

### WorkspaceEdit

Container for text edits across multiple files.

**Methods:**

- `addEdit(path, start, end, newText)` - Add a text edit
- `groupByFile()` - Group edits by file path (sorted for safe application)

## Status
The refactor engine now includes comprehensive rename planning, batch operations, impact analysis,
hot reload validation, and advanced dependency cascade computation. It integrates with the semantic
analyzer to provide safe, scope-aware refactoring operations with full transitive dependency tracking
for hot reload scenarios.
