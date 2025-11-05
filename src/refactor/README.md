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
- `async validateHotReloadCompatibility(workspace, options)` - Check hot reload compatibility
- `async applyWorkspaceEdit(workspace, options)` - Apply edits to files
- `async prepareHotReloadUpdates(workspace)` - Prepare hot reload update metadata
- `async generateTranspilerPatches(hotReloadUpdates, readFile)` - Generate transpiled patches
- `async findSymbolAtLocation(filePath, offset)` - Find symbol at position
- `async validateSymbolExists(symbolId)` - Check if symbol exists
- `async gatherSymbolOccurrences(symbolName)` - Get all occurrences of a symbol
- `async detectRenameConflicts(oldName, newName, occurrences)` - Check for naming conflicts

### WorkspaceEdit

Container for text edits across multiple files.

**Methods:**

- `addEdit(path, start, end, newText)` - Add a text edit
- `groupByFile()` - Group edits by file path (sorted for safe application)

## Status
The refactor engine now includes comprehensive rename planning, batch operations, impact analysis,
and hot reload validation. It integrates with the semantic analyzer to provide safe, scope-aware
refactoring operations.
