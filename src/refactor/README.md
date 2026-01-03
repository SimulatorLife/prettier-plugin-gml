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

### Rename Validation (Pre-flight Check)

Before planning a rename, validate the request to provide user-friendly feedback without throwing errors:

```javascript
const engine = new RefactorEngine({ semantic, parser, formatter });

// Validate rename request before committing to planning
const validation = await engine.validateRenameRequest({
    symbolId: "gml/script/scr_player",
    newName: "scr_hero"
});

if (!validation.valid) {
    console.error("Cannot rename:", validation.errors);
    // Display errors to user without stack traces
} else {
    console.log(`Found ${validation.occurrenceCount} occurrences to rename`);
    if (validation.warnings.length > 0) {
        console.warn("Warnings:", validation.warnings);
    }
    // Proceed with planRename()
}
```

This is especially useful for:
- IDE integrations that need to show inline validation errors
- CLI tools that want to provide friendly error messages before processing
- Dry-run scenarios where you want to check feasibility without side effects

### Batch Rename Validation (Pre-flight Check for Multiple Renames)

Validate multiple rename operations before planning edits, detecting conflicts between renames:

```javascript
const engine = new RefactorEngine({ semantic, parser, formatter });

// Validate batch rename request
const validation = await engine.validateBatchRenameRequest([
    { symbolId: "gml/script/scr_enemy_old", newName: "scr_enemy_new" },
    { symbolId: "gml/script/scr_enemy_helper_old", newName: "scr_enemy_helper_new" }
]);

if (!validation.valid) {
    console.error("Batch rename has errors:", validation.errors);
    
    // Show per-rename validation results
    for (const [symbolId, result] of validation.renameValidations) {
        if (!result.valid) {
            console.error(`  ${symbolId}:`, result.errors);
        }
    }
    
    // Show conflicting sets (e.g., duplicate target names, circular renames)
    if (validation.conflictingSets.length > 0) {
        console.error("Conflicting rename sets detected:");
        for (const set of validation.conflictingSets) {
            console.error(`  - ${set.join(", ")}`);
        }
    }
} else {
    console.log("Batch rename validation passed!");
    if (validation.warnings.length > 0) {
        console.warn("Warnings:", validation.warnings);
    }
    // Proceed with planBatchRename()
}
```

The batch validation detects:
- Invalid individual rename requests
- Duplicate target names (multiple symbols renamed to the same name)
- Circular rename chains (A→B, B→A or A→B→C→A)
- Cross-rename confusion (renaming to names that were original symbols in the batch)
- Each rename's individual validation status with hot reload checks (if requested)

This is essential for:
- Large refactoring operations affecting multiple related symbols
- IDE batch rename features
- Automated refactoring tools
- Ensuring atomicity and consistency in complex rename operations

### Direct Conflict Detection

Detect conflicts for a rename operation without going through full validation, useful for inline IDE warnings:

```javascript
const engine = new RefactorEngine({ semantic, parser, formatter });

// Get occurrences from semantic analyzer or parser
const occurrences = await engine.gatherSymbolOccurrences("player_hp");

// Check for conflicts directly
const conflicts = await engine.detectRenameConflicts({
    oldName: "player_hp",
    newName: "playerHealth",
    occurrences: occurrences
});

if (conflicts.length > 0) {
    for (const conflict of conflicts) {
        console.warn(`${conflict.type}: ${conflict.message}`);
        if (conflict.path) {
            console.warn(`  in file: ${conflict.path}`);
        }
    }
} else {
    console.log("No conflicts detected - rename is safe to proceed");
}
```

This method is especially useful for:
- IDE integrations that need real-time conflict checking as users type
- Custom refactoring tools that want low-level conflict information
- Building advanced rename workflows with custom conflict resolution
- Showing inline warnings before users commit to a rename operation

The method detects:
- Invalid identifier names (syntax errors)
- Reserved keyword conflicts
- Shadowing conflicts (new name collides with existing symbols in scope)
- Uses both default GML keywords and semantic analyzer's custom keyword list

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

### Hot Reload Safety Check

Check if a rename is safe for hot reload before planning:

```javascript
const safety = await engine.checkHotReloadSafety({
    symbolId: "gml/script/scr_player_attack",
    newName: "scr_player_combat"
});

if (!safety.safe) {
    console.error("Rename not safe:", safety.reason);
    if (safety.canAutoFix) {
        console.log("Auto-fix available. Suggestions:");
        safety.suggestions.forEach(s => console.log(`  - ${s}`));
    }
} else {
    console.log("✓ Rename is hot-reload-safe");
    console.log("Requires restart:", safety.requiresRestart);
}

// Example outputs for different symbol types:
// - Scripts: safe=true, requiresRestart=false
// - Instance vars: safe=true, requiresRestart=false
// - Macros/enums: safe=false (recompilation needed), requiresRestart=false, canAutoFix=true
// - Reserved keywords: safe=false, requiresRestart=true, canAutoFix=false
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

### Post-Edit Semantic Validation

Verify that applied edits maintain semantic integrity and hot reload safety:

```javascript
// After applying a rename
const workspace = await engine.planRename({
    symbolId: "gml/script/scr_old",
    newName: "scr_new"
});

const results = await engine.applyWorkspaceEdit(workspace, {
    readFile: async (path) => await fs.readFile(path, 'utf8'),
    writeFile: async (path, content) => await fs.writeFile(path, content)
});

// Verify the rename maintained semantic integrity
const validation = await engine.verifyPostEditIntegrity({
    symbolId: "gml/script/scr_old",
    oldName: "scr_old",
    newName: "scr_new",
    workspace,
    readFile: async (path) => await fs.readFile(path, 'utf8')
});

if (!validation.valid) {
    console.error("Post-edit validation failed:", validation.errors);
    // Consider reverting changes or alerting the user
} else if (validation.warnings.length > 0) {
    console.warn("Post-edit warnings:", validation.warnings);
    // Review warnings but proceed with hot reload
}

// validation contains:
// - valid: boolean indicating if edits maintained integrity
// - errors: blocking issues that indicate the rename broke something
// - warnings: advisory information about potential issues
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

### Semantic Analyzer Integration

The refactor engine provides helper methods for querying the semantic analyzer,
making it easier to coordinate hot reload operations and dependency tracking:

#### Query File Symbols

Get all symbols defined in a specific file for targeted recompilation:

```javascript
// When a file changes, determine which symbols need recompilation
const symbols = await engine.getFileSymbols("scripts/scr_player.gml");

console.log(`File defines ${symbols.length} symbols:`);
for (const symbol of symbols) {
    console.log(`  - ${symbol.id}`);
}

// Use with hot reload cascade to find all affected symbols
const cascade = await engine.computeHotReloadCascade(
    symbols.map(s => s.id)
);
```

#### Query Symbol Dependencies

Find which symbols depend on changed symbols to coordinate hot reload:

```javascript
// After modifying base scripts, find all dependents
const dependents = await engine.getSymbolDependents([
    "gml/script/scr_base_movement",
    "gml/script/scr_base_combat"
]);

console.log(`Found ${dependents.length} dependent symbols:`);
for (const dep of dependents) {
    console.log(`  - ${dep.symbolId} in ${dep.filePath}`);
}

// Recompile all dependents to maintain consistency
for (const dep of dependents) {
    await recompileSymbol(dep.symbolId, dep.filePath);
}
```

These methods provide a clean interface to the semantic analyzer and handle
cases where the analyzer is unavailable, making the refactor engine more
robust in partial-analysis scenarios.

### Occurrence Analysis Utilities

The refactor package provides utility functions to classify and analyze symbol
occurrences for rename planning and hot reload coordination:

#### Classify Occurrences

Break down occurrences into categories:

```javascript
const occurrences = await engine.gatherSymbolOccurrences("player_hp");
const classification = classifyOccurrences(occurrences);

console.log(`Total: ${classification.total}`);
console.log(`Definitions: ${classification.definitions}`);
console.log(`References: ${classification.references}`);
console.log(`Affected files: ${classification.byFile.size}`);

// Examine per-file breakdown
for (const [filePath, count] of classification.byFile) {
    console.log(`  ${filePath}: ${count} occurrences`);
}

// Examine by kind
for (const [kind, count] of classification.byKind) {
    console.log(`  ${kind}: ${count}`);
}
```

#### Filter and Group Occurrences

Focus on specific categories or files:

```javascript
import {
    filterOccurrencesByKind,
    groupOccurrencesByFile,
    findOccurrencesInFile,
    countAffectedFiles
} from "@gml-modules/refactor";

// Get only definition sites
const definitions = filterOccurrencesByKind(occurrences, ["definition"]);

// Group by file for file-level analysis
const grouped = groupOccurrencesByFile(occurrences);
for (const [filePath, fileOccurrences] of grouped) {
    console.log(`${filePath}: ${fileOccurrences.length} occurrences`);
}

// Find occurrences in a specific file
const playerOccurrences = findOccurrencesInFile(
    occurrences,
    "scripts/scr_player.gml"
);

// Quick count of affected files
const fileCount = countAffectedFiles(occurrences);
console.log(`Rename will affect ${fileCount} files`);
```

These utilities are particularly useful for:
- Building rename preview UIs that show occurrence breakdowns
- Determining hot reload safety based on occurrence types
- Providing detailed impact summaries in CLI tools
- Filtering occurrences for targeted analysis

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

#### Rename Operations
- `async validateRenameRequest(request, options)` - Validate a single rename request without creating edits (returns validation results instead of throwing)
- `async validateBatchRenameRequest(renames, options)` - Validate multiple rename requests before planning, detecting conflicts between renames
- `async planRename(request)` - Plan a single symbol rename
- `async planBatchRename(renames)` - Plan multiple renames atomically
- `async executeRename(request)` - Execute a rename with optional hot reload
- `async executeBatchRename(request)` - Execute multiple renames atomically

#### Analysis &amp; Validation
- `async analyzeRenameImpact(request)` - Analyze impact without applying changes
- `async validateRename(workspace)` - Validate a workspace edit
- `async validateHotReloadCompatibility(workspace, options)` - Check hot reload compatibility
- `async checkHotReloadSafety(request)` - Check if a rename is safe for hot reload
- `async verifyPostEditIntegrity(request)` - Verify semantic integrity after applying edits

#### Workspace Operations
- `async applyWorkspaceEdit(workspace, options)` - Apply edits to files
- `async prepareRenamePlan(request, options)` - Prepare a comprehensive rename plan with validation

#### Hot Reload Integration
- `async prepareHotReloadUpdates(workspace)` - Prepare hot reload update metadata
- `async generateTranspilerPatches(hotReloadUpdates, readFile)` - Generate transpiled patches
- `async computeHotReloadCascade(changedSymbolIds)` - Compute transitive dependency closure for hot reload

#### Symbol Queries
- `async findSymbolAtLocation(filePath, offset)` - Find symbol at position
- `async validateSymbolExists(symbolId)` - Check if symbol exists
- `async gatherSymbolOccurrences(symbolName)` - Get all occurrences of a symbol
- `async getFileSymbols(filePath)` - Query symbols defined in a specific file
- `async getSymbolDependents(symbolIds)` - Query symbols that depend on given symbols

#### Conflict Detection
- `async detectRenameConflicts(request)` - Detect conflicts for a proposed rename operation without throwing errors

### Occurrence Analysis Functions

Standalone utilities for analyzing symbol occurrences:

- `classifyOccurrences(occurrences)` - Classify occurrences into categories (definitions, references, by file, by kind)
- `filterOccurrencesByKind(occurrences, kinds)` - Filter occurrences by kind (e.g., ["definition"], ["reference"])
- `groupOccurrencesByFile(occurrences)` - Group occurrences by file path
- `findOccurrencesInFile(occurrences, filePath)` - Find occurrences within a specific file
- `countAffectedFiles(occurrences)` - Count unique files affected by occurrences

### WorkspaceEdit

Container for text edits across multiple files.

**Methods:**

- `addEdit(path, start, end, newText)` - Add a text edit
- `groupByFile()` - Group edits by file path (sorted for safe application)

## Status
The refactor engine now includes comprehensive rename planning, batch operations, impact analysis,
hot reload validation, occurrence analysis utilities, and advanced dependency cascade computation.
It integrates with the semantic analyzer to provide safe, scope-aware refactoring operations with
full transitive dependency tracking for hot reload scenarios.
