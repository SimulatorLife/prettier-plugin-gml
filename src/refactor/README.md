# Refactor Engine Module

This package powers GML-native codemods and semantic refactoring transactions, as outlined in the [formatter/linter split plan](../../docs/formatter-linter-split-plan.md). It implements a native, GML-centric Collection API (inspired by `jscodeshift`) to handle atomic cross-file edits, metadata updates (`.yy`, `.yyp`), and structural migrations.

## Ownership Boundaries

`@gml-modules/refactor` is the owner of **Global Transactions (Codemods)**.

- Depends on `@gml-modules/semantic` for symbol/scope analysis inputs.
- Owns atomic cross-file edits, metadata updates, and structural migrations.
- Implements a jscodeshift-like Collection API for GML ASTs.
- Is the ONLY layer that should decide whether a rename requires cross-file edits or metadata changes.

It does not replace lint or formatter domains:

- `@gml-modules/lint` owns **Diagnostic Reporting** and **Local Repairs** (single-file fixes).
- `@gml-modules/plugin` is **Formatter-only** (layout/canonical rendering) and does not own refactor transactions.
- `@gml-modules/cli` is the composition root that invokes refactor workflows through the `refactor` command.

## Responsibilities
- Query parser span data and semantic bindings to map identifiers to source ranges.
- Plan edits that avoid scope capture or shadowing, and surface validation diagnostics.
- Offer composable helpers so CLI commands can trigger explicit refactor transactions.
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

### Cross-File Consistency Validation

Ensure renames maintain semantic consistency across file boundaries:

```javascript
import { validateCrossFileConsistency } from "@gml-modules/refactor";

// Get occurrences for the symbol being renamed
const occurrences = await engine.gatherSymbolOccurrences("scr_player");

// Validate cross-file consistency
const errors = await validateCrossFileConsistency(
    "gml/script/scr_player",
    "scr_hero",
    occurrences,
    semantic
);

if (errors.length > 0) {
    console.error("Cross-file issues detected:");
    for (const error of errors) {
        if (error.severity === "warning") {
            console.warn(`  [${error.type}] ${error.message} in ${error.path}`);
        } else {
            console.error(`  [${error.type}] ${error.message} in ${error.path}`);
        }
    }
} else {
    console.log("✓ Rename maintains cross-file semantic consistency");
}
```

This validation is particularly useful for:
- Multi-file refactorings where symbols are imported/exported
- Detecting file-level symbol name conflicts before applying renames
- Warning about large-scale renames that affect many occurrences in a single file
- IDE integrations that need to show file-specific validation errors
- Ensuring import statements and references remain valid after renaming

### Structural Validation (Pre-flight Check)

Validate rename request structure before expensive operations like gathering occurrences. This provides fast fail-fast feedback for IDE integrations and CLI tools:

```javascript
import { validateRenameStructure } from "@gml-modules/refactor";

// Quick structural validation before planning
const errors = await validateRenameStructure(
    "gml/script/scr_player",
    "scr_hero",
    semantic // Optional: validates symbol existence if provided
);

if (errors.length > 0) {
    console.error("Invalid rename request:", errors);
    // Display errors immediately without waiting for occurrence gathering
    return;
}

// Proceed with full rename planning
const workspace = await engine.planRename({
    symbolId: "gml/script/scr_player",
    newName: "scr_hero"
});
```

This is especially useful for:
- Fast validation in IDE real-time feedback (as users type)
- CLI argument validation before expensive operations
- API endpoint input validation
- Early error detection in batch operations

The function validates:
- Request parameter presence and types
- Identifier syntax (must match GML identifier pattern)
- Symbol existence (if semantic resolver provided)
- New name differs from old name

Unlike full validation, this does **not** check for:
- Shadowing conflicts (requires occurrence analysis)
- Reserved keywords (handled by `detectRenameConflicts`)
- Impact analysis (handled by `analyzeRenameImpact`)

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

### Batch Scope Validation

Efficiently validate rename safety across multiple scopes for hot reload scenarios:

```javascript
import { batchValidateScopeConflicts } from "@gml-modules/refactor";

// Get occurrences from semantic analyzer
const occurrences = await engine.gatherSymbolOccurrences("player_hp");

// Batch validate across all scopes (more efficient than per-occurrence checks)
const conflicts = await batchValidateScopeConflicts(
    occurrences,
    "playerHealth",
    semantic
);

if (conflicts.size > 0) {
    console.log("Scope conflicts detected:");
    for (const [scopeId, conflict] of conflicts) {
        console.log(`  Scope ${scopeId}:`);
        console.log(`    ${conflict.message}`);
        console.log(`    Existing symbol: ${conflict.existingSymbol}`);
    }
} else {
    console.log("No scope conflicts - rename is safe across all scopes");
}
```

This function is especially useful for:
- Hot reload workflows that need to validate changes quickly before patching
- IDE integrations that show scope-specific warnings in real-time
- Batch rename operations where many occurrences need validation
- Reducing validation overhead by checking each unique scope only once instead of per-occurrence

Benefits:
- Groups occurrences by scope automatically
- Performs only one lookup per unique scope (not per occurrence)
- Returns structured conflict information per scope
- Handles both scoped and global (unscoped) occurrences correctly

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

### Batch Rename Planning

Prepare a comprehensive plan for multiple coordinated renames before applying changes:

```javascript
const engine = new RefactorEngine({ semantic, parser, formatter });

// Plan multiple related renames with full validation and impact analysis
const plan = await engine.prepareBatchRenamePlan([
    { symbolId: "gml/script/scr_enemy_old", newName: "scr_enemy_new" },
    { symbolId: "gml/script/scr_helper_old", newName: "scr_helper_new" }
], { 
    validateHotReload: true,
    hotReloadOptions: { checkTranspiler: true }
});

// Check batch-level validation
if (!plan.batchValidation.valid) {
    console.error("Batch validation failed:", plan.batchValidation.errors);
    
    // Show conflicting sets (e.g., duplicate target names, circular renames)
    for (const set of plan.batchValidation.conflictingSets) {
        console.error("Conflicting symbols:", set);
    }
    return;
}

// Review hot reload dependency cascade
if (plan.cascadeResult) {
    console.log(`Total symbols to reload: ${plan.cascadeResult.metadata.totalSymbols}`);
    console.log(`Max dependency distance: ${plan.cascadeResult.metadata.maxDistance}`);
    
    if (plan.cascadeResult.metadata.hasCircular) {
        console.warn("Circular dependencies detected:");
        for (const cycle of plan.cascadeResult.circular) {
            console.warn("  Cycle:", cycle.join(" → "));
        }
    }
    
    // Show reload order
    console.log("Reload order:", plan.cascadeResult.order);
}

// Review per-symbol impact analysis
for (const [symbolId, analysis] of plan.impactAnalyses) {
    console.log(`${symbolId}:`);
    console.log(`  Files affected: ${analysis.summary.affectedFiles.length}`);
    console.log(`  Total occurrences: ${analysis.summary.totalOccurrences}`);
    console.log(`  Definitions: ${analysis.summary.definitionCount}`);
    console.log(`  References: ${analysis.summary.referenceCount}`);
    console.log(`  Hot reload required: ${analysis.summary.hotReloadRequired}`);
    console.log(`  Dependent symbols: ${analysis.summary.dependentSymbols.length}`);
    
    if (analysis.conflicts.length > 0) {
        console.warn("  Conflicts:", analysis.conflicts.map(c => c.message));
    }
    
    if (analysis.warnings.length > 0) {
        console.warn("  Warnings:", analysis.warnings.map(w => w.message));
    }
}

// The plan includes:
// - plan.workspace: Combined workspace edit for all renames
// - plan.validation: Structural validation of merged edits
// - plan.hotReload: Hot reload compatibility validation (if requested)
// - plan.batchValidation: Batch-specific validation (conflicts, circular renames)
// - plan.impactAnalyses: Per-symbol impact analysis map
// - plan.cascadeResult: Full dependency cascade (if hot reload enabled)
```

This method provides a complete preview of batch rename operations, making it ideal for:
- IDE integrations that need to show comprehensive refactoring previews
- CLI tools that want to present detailed impact reports before applying changes
- Automated refactoring pipelines that need to validate complex multi-symbol renames
- Coordinated renames where dependencies between symbols must be considered

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

#### Compute Rename Impact Graph

Generate a detailed dependency graph showing how a rename will propagate through the codebase:

```javascript
// Get comprehensive impact visualization for a rename
const impactGraph = await engine.computeRenameImpactGraph("gml/script/scr_base");

console.log(`Rename will affect ${impactGraph.totalAffectedSymbols} symbols`);
console.log(`Maximum dependency depth: ${impactGraph.maxDepth}`);
console.log(`Critical path length: ${impactGraph.criticalPath.length}`);
console.log(`Estimated total reload time: ${impactGraph.estimatedTotalReloadTime}ms`);

// Visualize the dependency graph
for (const [symbolId, node] of impactGraph.nodes) {
    console.log(`${node.symbolName} (distance: ${node.distance}, reload: ${node.estimatedReloadTime}ms)`);
    
    if (node.dependents.length > 0) {
        console.log(`  Depends on this: ${node.dependents.map(id => id.split("/").pop()).join(", ")}`);
    }
    
    if (node.dependsOn.length > 0) {
        console.log(`  Depends on: ${node.dependsOn.map(id => id.split("/").pop()).join(", ")}`);
    }
}

// Display critical path (longest dependency chain)
console.log("Critical path:");
for (let i = 0; i < impactGraph.criticalPath.length; i++) {
    const symbolId = impactGraph.criticalPath[i];
    const node = impactGraph.nodes.get(symbolId);
    const indent = "  ".repeat(i);
    console.log(`${indent}→ ${node.symbolName}`);
}
```

This is particularly useful for:
- Understanding the full scope of a rename before applying it
- Estimating hot reload impact and timing
- Identifying critical dependency chains that affect reload performance
- Visualizing dependency relationships in IDE tooling
- Planning batch renames to minimize reload cascades
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

## Performance Optimization

### Semantic Query Cache

The refactor engine supports caching of semantic analyzer queries to optimize batch operations and impact analysis. During complex refactoring workflows, the same semantic data is often queried repeatedly (e.g., symbol occurrences, dependencies). The `SemanticQueryCache` memoizes these results within a session to reduce redundant queries.

```javascript
import { SemanticQueryCache } from "@gml-modules/refactor";

// Create cache with custom configuration
const cache = new SemanticQueryCache(semantic, {
    maxSize: 100,      // Maximum entries per cache type (default: 100)
    ttlMs: 60000,      // Time-to-live in milliseconds (default: 60000)
    enabled: true      // Enable/disable caching (default: true)
});

// First call queries the semantic analyzer
const occurrences1 = await cache.getSymbolOccurrences("player_hp");

// Second call returns cached result (no semantic query)
const occurrences2 = await cache.getSymbolOccurrences("player_hp");

// Clear cache when source files change
cache.invalidateAll();

// Or invalidate specific files
cache.invalidateFile("scripts/player.gml");

// Check cache performance
const stats = cache.getStats();
console.log(`Hits: ${stats.hits}, Misses: ${stats.misses}, Evictions: ${stats.evictions}`);
```

The cache is particularly beneficial for:

- **Batch rename operations**: Avoids re-querying the same symbol dependencies multiple times
- **Impact analysis**: Caches occurrence data when analyzing multiple related symbols
- **Hot reload workflows**: Reduces overhead when computing dependency cascades
- **IDE integrations**: Provides faster feedback during interactive refactoring

**Cache behavior:**

- Entries are evicted using FIFO when `maxSize` is exceeded
- Entries expire after `ttlMs` milliseconds
- Each cache type (occurrences, file symbols, dependents, existence) has its own storage
- The cache is session-scoped and should be created per refactoring workflow
- Call `invalidateAll()` when source files change to prevent stale results
- Call `invalidateFile(path)` to selectively invalidate affected entries

### Rename Validation Cache

The refactor engine also provides a specialized cache for rename validation results. During interactive rename sessions (e.g., IDE rename dialogs), the same symbol-to-name combinations are often validated repeatedly as users type new names. The `RenameValidationCache` caches validation results to provide faster feedback for IDE integrations.

```javascript
import { RenameValidationCache } from "@gml-modules/refactor";

// Create cache with custom configuration
const validationCache = new RenameValidationCache({
    maxSize: 50,       // Maximum cached validation results (default: 50)
    ttlMs: 30000,      // Time-to-live in milliseconds (default: 30000)
    enabled: true      // Enable/disable caching (default: true)
});

// First validation: performs full validation with occurrence gathering and conflict detection
const result1 = await validationCache.getOrCompute(
    "gml/script/scr_player",
    "scr_hero",
    async () => engine.validateRenameRequest({
        symbolId: "gml/script/scr_player",
        newName: "scr_hero"
    })
);

// Second validation within TTL: returns cached result instantly
const result2 = await validationCache.getOrCompute(
    "gml/script/scr_player",
    "scr_hero",
    async () => engine.validateRenameRequest({
        symbolId: "gml/script/scr_player",
        newName: "scr_hero"
    })
);

// Invalidate specific symbol-name pair when symbol changes
validationCache.invalidate("gml/script/scr_player", "scr_hero");

// Invalidate all validation results for a symbol when its definition changes
validationCache.invalidateSymbol("gml/script/scr_player");

// Clear all cached validations when source files change
validationCache.invalidateAll();

// Check cache performance
const stats = validationCache.getStats();
console.log(`Hits: ${stats.hits}, Misses: ${stats.misses}, Evictions: ${stats.evictions}`);
```

The validation cache is particularly beneficial for:

- **IDE rename dialogs**: Provides instant validation feedback as users type new names
- **Interactive refactoring**: Reduces latency during rename preview and validation
- **Autocomplete suggestions**: Enables fast validation of suggested names
- **Batch rename planning**: Speeds up validation when users adjust rename targets

**Cache behavior:**

- Entries are evicted using FIFO when `maxSize` is exceeded (oldest first)
- Entries expire after `ttlMs` milliseconds (shorter TTL than semantic cache)
- Each symbol-name pair has its own cache entry
- The cache is session-scoped and should be created per IDE session or refactoring workflow
- Call `invalidateAll()` when source files change to prevent stale validation results
- Call `invalidateSymbol(symbolId)` when a specific symbol's definition or dependencies change
- The cache stores the full validation result including errors, warnings, occurrence counts, and hot reload metadata

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
- `async prepareBatchRenamePlan(renames, options)` - Prepare a comprehensive batch rename plan with validation, impact analysis, and hot reload metadata

#### Hot Reload Integration
- `async prepareHotReloadUpdates(workspace)` - Prepare hot reload update metadata
- `async generateTranspilerPatches(hotReloadUpdates, readFile)` - Generate transpiled patches
- `async computeHotReloadCascade(changedSymbolIds)` - Compute transitive dependency closure for hot reload
- `async computeRenameImpactGraph(symbolId)` - Compute detailed dependency impact graph with critical path analysis

#### Symbol Queries
- `async findSymbolAtLocation(filePath, offset)` - Find symbol at position
- `async validateSymbolExists(symbolId)` - Check if symbol exists
- `async gatherSymbolOccurrences(symbolName)` - Get all occurrences of a symbol
- `async getFileSymbols(filePath)` - Query symbols defined in a specific file
- `async getSymbolDependents(symbolIds)` - Query symbols that depend on given symbols

#### Conflict Detection
- `async detectRenameConflicts(request)` - Detect conflicts for a proposed rename operation without throwing errors

### Validation Functions

Standalone utilities for validating rename requests:

- `async validateRenameStructure(symbolId, newName, resolver)` - Fast structural validation of rename parameters before planning
  - Validates parameter presence, identifier syntax, and optional symbol existence
  - Returns array of error messages (empty if valid)
  - Enables fail-fast pattern without expensive occurrence gathering
- `detectCircularRenames(renames)` - Detect circular rename chains in batch operations
  - Returns first detected cycle as array of symbol IDs (empty if no cycles)
- `async batchValidateScopeConflicts(occurrences, newName, resolver)` - Efficiently validate scope safety across multiple occurrences
  - Groups occurrences by scope to minimize redundant lookups
  - Returns map of scope IDs to conflict information
  - Essential for hot reload scenarios where many symbols need validation quickly
  - Reduces validation overhead by checking each unique scope only once
- `async validateCrossFileConsistency(symbolId, newName, occurrences, fileProvider)` - Validate cross-file semantic consistency for renames
  - Checks whether renaming would create ambiguous references across files
  - Detects file-level symbol conflicts where new name already exists
  - Warns about large rename operations (>20 occurrences per file)
  - Essential for multi-file refactorings and ensuring import/export consistency
  - Returns array of conflict entries with file paths and severity levels

### Occurrence Analysis Functions

Standalone utilities for analyzing symbol occurrences:

- `classifyOccurrences(occurrences)` - Classify occurrences into categories (definitions, references, by file, by kind)
- `filterOccurrencesByKind(occurrences, kinds)` - Filter occurrences by kind (e.g., ["definition"], ["reference"])
- `groupOccurrencesByFile(occurrences)` - Group occurrences by file path
- `findOccurrencesInFile(occurrences, filePath)` - Find occurrences within a specific file
- `countAffectedFiles(occurrences)` - Count unique files affected by occurrences

### Rename Preview Functions

Utilities for generating human-readable previews and reports of rename operations:

- `generateRenamePreview(workspace, oldName, newName)` - Generate a preview of changes that will be made by a workspace edit
- `formatRenamePlanReport(plan)` - Format a rename plan summary as a multi-line text report
- `formatBatchRenamePlanReport(plan)` - Format a batch rename plan summary as a multi-line text report
- `formatOccurrencePreview(occurrences, oldName, newName)` - Format occurrence locations as a diff-style preview

These functions are essential for:
- IDE integrations that need to show diff-like previews before applying renames
- CLI tools that want to present detailed impact reports to users
- Automated refactoring pipelines that need to log changes before applying them
- Debugging refactoring operations by visualizing what will change

### Hot Reload Functions

Standalone utilities for hot reload coordination and analysis:

- `computeHotReloadCascade(changedSymbolIds, semantic)` - Compute transitive dependency closure for hot reload
- `checkHotReloadSafety(request, semantic)` - Check if a rename is safe for hot reload
- `prepareHotReloadUpdates(workspace, semantic)` - Prepare hot reload update metadata from workspace edit
- `generateTranspilerPatches(hotReloadUpdates, readFile, formatter)` - Generate transpiled patches from hot reload updates
- `computeRenameImpactGraph(symbolId, semantic)` - Compute detailed dependency impact graph with critical path analysis

The `computeRenameImpactGraph` function is particularly useful for:
- Visualizing the full scope of a rename's impact on the codebase
- Understanding dependency relationships and reload propagation
- Estimating hot reload timing and identifying performance bottlenecks
- Planning complex refactorings that affect multiple interconnected symbols
- Building interactive dependency visualization tools in IDEs

#### Example: Generating a Rename Preview

```javascript
const plan = await engine.prepareRenamePlan({
    symbolId: "gml/script/scr_player",
    newName: "scr_hero"
}, { validateHotReload: true });

// Generate human-readable report
const report = formatRenamePlanReport(plan);
console.log(report);

// Output:
// Rename Plan Report
// ==================
// Symbol: scr_player → scr_hero
// Status: VALID
//
// Impact Summary:
//   Total Occurrences: 15
//   Definitions: 1
//   References: 14
//   Affected Files: 3
//   Hot Reload Required: Yes
//   Dependent Symbols: 2
//
// Workspace Changes:
//   Total Edits: 15
//   Files Modified: 3
//
// Hot Reload Status: SAFE
//   Reason: Script renames are hot-reload-safe
//   Requires Restart: No

// Generate detailed file-by-file preview
const preview = generateRenamePreview(plan.workspace, "scr_player", "scr_hero");
console.log(`Renaming ${preview.summary.oldName} → ${preview.summary.newName}`);
console.log(`Will modify ${preview.summary.affectedFiles} files with ${preview.summary.totalEdits} edits`);

for (const file of preview.files) {
    console.log(`\n${file.filePath}: ${file.editCount} changes`);
    for (const edit of file.edits) {
        console.log(`  Position ${edit.start}-${edit.end}: "${edit.oldText}" → "${edit.newText}"`);
    }
}

// Format occurrence preview for user review
const occurrences = await engine.gatherSymbolOccurrences("scr_player");
const occPreview = formatOccurrencePreview(occurrences, "scr_player", "scr_hero");
console.log(occPreview);

// Output:
// Symbol Occurrences: scr_player → scr_hero
// Total: 15 occurrences in 3 files
//
// scripts/player.gml (10 occurrences):
//   [definition] Position 0-10
//   [reference] Position 45-55
//   [reference] Position 123-133
//   ...
//
// scripts/game.gml (3 occurrences):
//   [reference] Position 200-210
//   ...
```

### WorkspaceEdit

Container for text edits across multiple files.

**Methods:**

- `addEdit(path, start, end, newText)` - Add a text edit
- `groupByFile()` - Group edits by file path (sorted for safe application)

### SemanticQueryCache

Caching layer for semantic analyzer queries during refactoring operations.

**Constructor:**
```javascript
new SemanticQueryCache(semantic, config)
```

**Configuration:**
- `maxSize` - Maximum entries per cache type (default: 100)
- `ttlMs` - Time-to-live in milliseconds (default: 60000)
- `enabled` - Enable/disable caching (default: true)

**Methods:**

- `async getSymbolOccurrences(symbolName)` - Get cached symbol occurrences
- `async getFileSymbols(filePath)` - Get cached file symbols
- `async getDependents(symbolIds)` - Get cached dependent symbols
- `async hasSymbol(symbolId)` - Check cached symbol existence
- `invalidateAll()` - Clear all cached entries
- `invalidateFile(filePath)` - Clear entries for specific file
- `getStats()` - Get cache performance statistics
- `resetStats()` - Reset performance counters

**Statistics:**
- `hits` - Number of cache hits
- `misses` - Number of cache misses
- `evictions` - Number of entries evicted due to size limits
- `size` - Current total cache size across all types

### RenameValidationCache

Caching layer for rename validation results during interactive refactoring.

**Constructor:**
```javascript
new RenameValidationCache(config)
```

**Configuration:**
- `maxSize` - Maximum cached validation results (default: 50)
- `ttlMs` - Time-to-live in milliseconds (default: 30000)
- `enabled` - Enable/disable caching (default: true)

**Methods:**

- `async getOrCompute(symbolId, newName, compute)` - Get cached validation or compute new result
- `invalidate(symbolId, newName)` - Invalidate specific symbol-name pair
- `invalidateSymbol(symbolId)` - Invalidate all cached validations for a symbol
- `invalidateAll()` - Clear all cached validation results
- `getStats()` - Get cache performance statistics
- `resetStats()` - Reset performance counters

**Statistics:**
- `hits` - Number of cache hits
- `misses` - Number of cache misses
- `evictions` - Number of entries evicted due to size limits
- `size` - Current cache size

## Status
The refactor engine now includes comprehensive rename planning, batch operations, impact analysis,
hot reload validation, occurrence analysis utilities, rename preview and reporting utilities,
advanced dependency cascade computation, detailed rename impact graph visualization, semantic
query caching, and rename validation caching for performance optimization. It integrates with the
semantic analyzer to provide safe, scope-aware refactoring operations with full transitive
dependency tracking for hot reload scenarios. The impact graph computation provides critical path
analysis and timing estimates, enabling IDE integrations and CLI tools to present detailed,
human-readable reports of planned changes and their hot reload implications before applying them.
The query cache layer optimizes repeated semantic queries during batch operations, while the
validation cache layer speeds up interactive rename workflows by caching validation results as
users type new names, significantly improving performance for complex refactoring workflows and
providing instant feedback in IDE rename dialogs.
