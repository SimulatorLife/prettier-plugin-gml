/**
 * Hot reload coordination for the refactor engine.
 * Handles dependency cascade computation, safety checks, patch generation,
 * and hot reload update preparation.
 */

import { Core } from "@gml-modules/core";

import * as SymbolQueries from "./symbol-queries.js";
import {
    type CascadeEntry,
    ConflictType,
    type HotReloadCascadeResult,
    type HotReloadSafetySummary,
    type HotReloadUpdate,
    parseSymbolKind,
    type PartialSemanticAnalyzer,
    type RenameImpactGraph,
    type RenameImpactNode,
    type RenameRequest,
    SymbolKind,
    type TranspilerBridge,
    type TranspilerPatch,
    type WorkspaceReadFile
} from "./types.js";
import { detectRenameConflicts } from "./validation.js";
import { assertValidIdentifierName, extractSymbolName, parseSymbolIdParts } from "./validation-utils.js";
import type { WorkspaceEdit } from "./workspace-edit.js";

/**
 * Prepare hot reload updates from a workspace edit.
 * Determines which symbols need recompilation and expands to transitive dependents.
 */
export async function prepareHotReloadUpdates(
    workspace: WorkspaceEdit,
    semantic: PartialSemanticAnalyzer | null
): Promise<Array<HotReloadUpdate>> {
    const updates: Array<HotReloadUpdate> = [];

    if (!workspace || workspace.edits.length === 0) {
        return updates;
    }

    // Group edits by file
    const grouped = workspace.groupByFile();
    const updatesBySymbol = new Map<string, HotReloadUpdate>();

    // Parallelize file symbol queries for better hot reload performance.
    // Each file's symbol lookup is independent, so we can query them concurrently
    // to reduce total latency during hot reload preparation.
    const fileResults = await Promise.all(
        Array.from(grouped.entries()).map(async ([filePath, edits]) => {
            // Determine which symbols are defined in this file
            let affectedSymbols = [];

            if (Core.hasMethods(semantic, "getFileSymbols")) {
                affectedSymbols = await semantic.getFileSymbols(filePath);
            }

            const fileUpdates: Array<HotReloadUpdate> = [];

            // If we have specific symbol information, create targeted updates
            if (affectedSymbols.length > 0) {
                for (const symbol of affectedSymbols) {
                    const update: HotReloadUpdate = {
                        symbolId: symbol.id,
                        action: "recompile",
                        filePath,
                        affectedRanges: edits.map((e) => ({
                            start: e.start,
                            end: e.end
                        }))
                    };
                    fileUpdates.push(update);
                }
                return fileUpdates;
            }

            // Fallback: create a generic update for the file
            const update: HotReloadUpdate = {
                symbolId: `file://${filePath}`,
                action: "recompile",
                filePath,
                affectedRanges: edits.map((e) => ({
                    start: e.start,
                    end: e.end
                }))
            };
            fileUpdates.push(update);
            return fileUpdates;
        })
    );

    // Flatten results and build the updatesBySymbol map
    for (const fileUpdates of fileResults) {
        for (const update of fileUpdates) {
            updates.push(update);
            updatesBySymbol.set(update.symbolId, update);
        }
    }

    // Expand to transitive dependents using the cascade helper so hot reload
    // consumers receive a full picture of which symbols should be refreshed.
    const cascade = await computeHotReloadCascade(Array.from(updatesBySymbol.keys()), semantic);
    for (const entry of cascade.cascade) {
        if (updatesBySymbol.has(entry.symbolId)) {
            continue;
        }

        if (!entry.filePath) {
            continue;
        }

        const dependentUpdate: HotReloadUpdate = {
            symbolId: entry.symbolId,
            action: "notify",
            filePath: entry.filePath,
            affectedRanges: []
        };
        updates.push(dependentUpdate);
        updatesBySymbol.set(entry.symbolId, dependentUpdate);
    }

    return updates;
}

/**
 * Compute the full dependency cascade for hot reload operations.
 * Takes a set of changed symbols and computes all transitive dependents
 * that need to be reloaded, ordered for safe application.
 */
export async function computeHotReloadCascade(
    changedSymbolIds: Array<string>,
    semantic: PartialSemanticAnalyzer | null
): Promise<HotReloadCascadeResult> {
    Core.assertArray(changedSymbolIds, {
        errorMessage: "computeHotReloadCascade requires an array of symbol IDs"
    });

    if (changedSymbolIds.length === 0) {
        return {
            cascade: [],
            order: [],
            circular: [],
            metadata: {
                totalSymbols: 0,
                maxDistance: 0,
                hasCircular: false
            }
        };
    }

    // BFS traversal: symbols visited so far (prevents re-exploring shared dependencies
    // or infinite loops in cyclic graphs). Unlike a DFS `visiting` stack, a BFS
    // `visited` set never causes false-positive cycle reports in diamond-shaped graphs
    // (A→B→D, A→C→D) because sibling branches share only the "already seen" bit, not
    // an "on the current recursive path" bit.
    const visited = new Set<string>(changedSymbolIds);
    const cascade = new Map<string, CascadeEntry>();
    const dependencyGraph = new Map<string, Array<string>>();

    // Initialize root symbols at distance 0. These are the symbols directly
    // modified by the user (e.g., a renamed function or edited variable). All other
    // symbols in the cascade are transitively impacted through dependency edges.
    for (const symbolId of changedSymbolIds) {
        cascade.set(symbolId, {
            symbolId,
            distance: 0,
            reason: "direct change"
        });
    }

    // Level-parallel BFS: all symbols at the same dependency depth are queried
    // concurrently, reducing total async round trips to O(max_depth) instead of
    // O(total_nodes). The `visited` set (not a DFS `visiting` stack) prevents
    // false-positive cycle reports in diamond patterns while still terminating
    // correctly on genuine cycles.
    //
    // Implemented as tail-recursive levels rather than a while-loop to satisfy the
    // no-await-in-loop rule: each level awaits only its own Promise.all batch.
    const processLevel = async (level: ReadonlyArray<{ id: string; distance: number }>): Promise<void> => {
        if (level.length === 0 || !Core.hasMethods(semantic, "getDependents")) {
            return;
        }

        // Fetch dependents for every node in this level concurrently.
        const levelResults = await Promise.all(
            level.map(async ({ id, distance }) => {
                const deps = (await semantic.getDependents([id])) ?? [];
                return { id, distance, deps };
            })
        );

        const nextLevel: Array<{ id: string; distance: number }> = [];

        for (const { id: parentId, distance, deps } of levelResults) {
            for (const dep of deps) {
                const depId = dep.symbolId;

                // Record the dependency edge so the topological sort has complete
                // edge information. We record all edges (even to already-visited nodes)
                // because Kahn's algorithm needs them to compute correct in-degrees.
                const edges = dependencyGraph.get(parentId) ?? [];
                edges.push(depId);
                dependencyGraph.set(parentId, edges);

                // Skip already-visited symbols. BFS handles shared dependencies
                // (diamond patterns) correctly here: the second path to a shared
                // node just skips it without any false cycle detection.
                if (visited.has(depId)) {
                    continue;
                }

                visited.add(depId);
                cascade.set(depId, {
                    symbolId: depId,
                    distance: distance + 1,
                    reason: `depends on ${extractSymbolName(parentId)}`,
                    filePath: dep.filePath
                });

                nextLevel.push({ id: depId, distance: distance + 1 });
            }
        }

        await processLevel(nextLevel);
    };

    await processLevel(changedSymbolIds.map((id) => ({ id, distance: 0 })));

    // Detect cycles on the completed dependency graph using a sequential DFS pass.
    // Separating cycle detection from BFS traversal ensures the DFS `visiting` stack
    // is never shared with concurrent async branches, eliminating the false positives
    // that occur when a DFS stack is mutated during parallel exploration.
    const circular = detectCyclesInDependencyGraph(dependencyGraph);

    // Convert cascade to array and compute topological order.
    const cascadeArray = Array.from(cascade.values());

    // Topological sort using Kahn's algorithm.
    // Build in-degree map.
    const inDegree = new Map<string, number>();
    for (const item of cascadeArray) {
        inDegree.set(item.symbolId, 0);
    }

    for (const [, toList] of dependencyGraph.entries()) {
        for (const to of toList) {
            if (inDegree.has(to)) {
                inDegree.set(to, (inDegree.get(to) ?? 0) + 1);
            }
        }
    }

    // Process symbols with no incoming edges first (leaves of dependency tree).
    // In a dependency graph, leaves are symbols that other symbols depend on but
    // which themselves have no dependencies. Processing these first is essential
    // for hot-reload because we must reload foundational symbols before their
    // dependents—attempting to reload a dependent before its dependencies are
    // ready would trigger runtime errors. This topological sort ensures the reload
    // sequence is safe and deterministic, preventing cascade failures where one
    // bad reload corrupts the entire symbol table.
    const queue: Array<string> = [];
    for (const [symbolId, degree] of inDegree.entries()) {
        if (degree === 0) {
            queue.push(symbolId);
        }
    }

    const order: Array<string> = [];
    let queueIndex = 0;
    while (queueIndex < queue.length) {
        const current = queue[queueIndex];
        queueIndex += 1;
        order.push(current);

        // Reduce in-degree for dependents.
        const dependents = dependencyGraph.get(current) ?? [];
        for (const dep of dependents) {
            if (inDegree.has(dep)) {
                const newDegree = (inDegree.get(dep) ?? 0) - 1;
                inDegree.set(dep, newDegree);
                if (newDegree === 0) {
                    queue.push(dep);
                }
            }
        }
    }

    // If order doesn't include all symbols, we have cycles.
    const hasUnorderedSymbols = order.length < cascadeArray.length;

    // Add any remaining symbols (those in cycles) to the end of the order.
    const orderSet = new Set(order);
    for (const item of cascadeArray) {
        if (!orderSet.has(item.symbolId)) {
            order.push(item.symbolId);
            orderSet.add(item.symbolId);
        }
    }

    // Compute metadata.
    const maxDistance = cascadeArray.reduce((max, item) => Math.max(max, item.distance), 0);

    return {
        cascade: cascadeArray,
        order,
        circular,
        metadata: {
            totalSymbols: cascadeArray.length,
            maxDistance,
            hasCircular: circular.length > 0 || hasUnorderedSymbols
        }
    };
}

/**
 * Detect cycles in a completed dependency graph using sequential DFS.
 * Returns all discovered cycles as arrays of symbol IDs.
 *
 * This is intentionally separate from BFS traversal so the DFS `visiting`/`path`
 * state is never shared with concurrent async branches—the root cause of false
 * positives when DFS cycle detection is interleaved with parallel exploration.
 *
 * @param graph - Adjacency list: parent symbolId → array of dependent symbolIds
 * @returns Each cycle as an ordered sequence of symbol IDs with the start node
 *   repeated at the end to close the loop (e.g., `["A", "B", "C", "A"]` for A→B→C→A)
 *
 * @example
 * // Given A→B→C→A cycle in the dependency graph:
 * const graph = new Map([
 *   ["A", ["B"]],
 *   ["B", ["C"]],
 *   ["C", ["A"]]
 * ]);
 * detectCyclesInDependencyGraph(graph);
 * // Returns [["A", "B", "C", "A"]]
 */
function detectCyclesInDependencyGraph(graph: Map<string, Array<string>>): Array<Array<string>> {
    const cycles: Array<Array<string>> = [];
    const fullyExplored = new Set<string>();
    const visiting = new Set<string>();
    const path: Array<string> = [];

    const dfs = (node: string): void => {
        if (fullyExplored.has(node)) {
            return;
        }

        if (visiting.has(node)) {
            // Back edge: reconstruct cycle from current path.
            const cycleStart = path.indexOf(node);
            if (cycleStart !== -1) {
                cycles.push([...path.slice(cycleStart), node]);
            }
            return;
        }

        visiting.add(node);
        path.push(node);

        for (const neighbor of graph.get(node) ?? []) {
            dfs(neighbor);
        }

        path.pop();
        visiting.delete(node);
        fullyExplored.add(node);
    };

    for (const node of graph.keys()) {
        dfs(node);
    }

    return cycles;
}

/**
 * Check whether a rename operation is safe for hot reload.
 * This method performs a comprehensive analysis of whether a rename can be
 * applied without requiring a full game restart, taking into account symbol
 * types, scope changes, and runtime implications.
 */
export async function checkHotReloadSafety(
    request: RenameRequest,
    semantic: PartialSemanticAnalyzer | null
): Promise<HotReloadSafetySummary> {
    const { symbolId, newName } = request ?? {};
    const suggestions: Array<string> = [];

    if (!symbolId || !newName) {
        return {
            safe: false,
            reason: "Invalid rename request: missing symbolId or newName",
            requiresRestart: true,
            canAutoFix: false,
            suggestions
        };
    }

    // Validate identifier format first
    try {
        assertValidIdentifierName(newName);
    } catch (error) {
        return {
            safe: false,
            reason: `Invalid identifier name: ${error.message}`,
            requiresRestart: true,
            canAutoFix: false,
            suggestions
        };
    }

    // Hot reload safety analysis relies on semantic knowledge to confirm the
    // symbol exists and to reason about scope conflicts. When the semantic
    // analyzer is unavailable, return a guarded failure instead of throwing so
    // callers receive actionable feedback they can surface to users.
    if (!semantic) {
        return {
            safe: false,
            reason: "Hot reload safety checks require a semantic analyzer to verify the rename",
            requiresRestart: true,
            canAutoFix: false,
            suggestions: [
                "Run the semantic analysis pass before requesting hot reload safety",
                "Provide a semantic analyzer implementation when constructing RefactorEngine"
            ]
        };
    }

    // Check if symbol exists
    const exists = await SymbolQueries.validateSymbolExists(symbolId, semantic);
    if (!exists) {
        return {
            safe: false,
            reason: `Symbol '${symbolId}' not found in semantic index`,
            requiresRestart: true,
            canAutoFix: false,
            suggestions: [
                "Ensure the project has been analyzed before attempting renames",
                "Verify the symbolId is correct"
            ]
        };
    }

    // Extract symbol metadata from the ID
    // SymbolId format: gml/{kind}/{name}, e.g., "gml/script/scr_player"
    const symbolParts = parseSymbolIdParts(symbolId);
    if (!symbolParts) {
        return {
            safe: false,
            reason: `Malformed symbolId '${symbolId}'`,
            requiresRestart: true,
            canAutoFix: false,
            suggestions: [
                "Ensure symbolId follows the pattern: gml/{kind}/{name}",
                "Example: gml/script/scr_player, gml/var/hp, gml/event/create"
            ]
        };
    }

    const rawSymbolKind = symbolParts.symbolKind;
    const symbolKind = parseSymbolKind(rawSymbolKind);
    const symbolName = symbolParts.symbolName;

    // Validate symbol kind
    if (symbolKind === null) {
        const validKinds = Object.values(SymbolKind).join(", ");
        return {
            safe: false,
            reason: `Invalid symbol kind '${rawSymbolKind}' in symbolId`,
            requiresRestart: true,
            canAutoFix: false,
            suggestions: [
                `Valid symbol kinds are: ${validKinds}`,
                "Ensure symbolId follows the pattern: gml/{kind}/{name}"
            ]
        };
    }

    // Check for name conflict
    if (symbolName === newName) {
        return {
            safe: false,
            reason: "New name matches the existing identifier",
            requiresRestart: false,
            canAutoFix: false,
            suggestions: ["Choose a different name"]
        };
    }

    // Gather occurrences to analyze scope and usage patterns
    const occurrences = await SymbolQueries.gatherSymbolOccurrences(symbolName, semantic);

    // Detect potential conflicts
    const conflicts = await detectRenameConflicts(symbolName, newName, occurrences, semantic, semantic);

    if (conflicts.length > 0) {
        const hasReservedConflict = conflicts.some((c) => c.type === ConflictType.RESERVED);
        const hasShadowConflict = conflicts.some((c) => c.type === ConflictType.SHADOW);

        if (hasReservedConflict) {
            return {
                safe: false,
                reason: "Cannot rename to a reserved keyword",
                requiresRestart: true,
                canAutoFix: false,
                suggestions: ["Choose a different name that isn't a reserved keyword"]
            };
        }

        if (hasShadowConflict) {
            return {
                safe: false,
                reason: "Rename would introduce shadowing conflicts",
                requiresRestart: false,
                canAutoFix: true,
                suggestions: [
                    "The refactor engine can automatically qualify identifiers to avoid shadowing",
                    "Consider using a less common name to avoid conflicts"
                ]
            };
        }

        return {
            safe: false,
            reason: `Rename has ${conflicts.length} conflict(s)`,
            requiresRestart: false,
            canAutoFix: false,
            suggestions: conflicts.map((c) => c.message)
        };
    }

    // Analyze hot reload implications based on symbol kind
    switch (symbolKind) {
        case SymbolKind.SCRIPT: {
            // Script renames are generally safe for hot reload as long as
            // we update all call sites simultaneously
            return {
                safe: true,
                reason: "Script renames are hot-reload-safe",
                requiresRestart: false,
                canAutoFix: true,
                suggestions: [
                    "All script call sites will be updated atomically",
                    "The hot reload system will recompile dependent scripts"
                ]
            };
        }

        case SymbolKind.VAR: {
            // Instance and global variable renames are safe if we update
            // all references, but need careful handling of self/other context
            if (symbolId.includes("::")) {
                // Instance variable (e.g., gml/var/obj_enemy::hp)
                return {
                    safe: true,
                    reason: "Instance variable renames are hot-reload-safe",
                    requiresRestart: false,
                    canAutoFix: true,
                    suggestions: [
                        "All references will be updated with proper scope qualification",
                        "Existing instances will retain their current values"
                    ]
                };
            } else {
                // Global variable
                return {
                    safe: true,
                    reason: "Global variable renames are hot-reload-safe",
                    requiresRestart: false,
                    canAutoFix: true,
                    suggestions: ["Global state will be preserved during hot reload"]
                };
            }
        }

        case SymbolKind.EVENT: {
            // Event renames require special handling but are generally safe
            return {
                safe: true,
                reason: "Event renames are hot-reload-safe with reinit",
                requiresRestart: false,
                canAutoFix: true,
                suggestions: [
                    "Event dispatch will be updated to use the new name",
                    "Existing instances will have their event handlers updated"
                ]
            };
        }

        case SymbolKind.MACRO:
        case SymbolKind.ENUM: {
            // Macros and enums are compile-time constructs, so renaming them
            // requires recompiling all dependent code
            return {
                safe: false,
                reason: "Macro/enum renames require dependent script recompilation",
                requiresRestart: false,
                canAutoFix: true,
                suggestions: [
                    "The hot reload system will automatically recompile all dependent scripts",
                    "Consider using the batch rename API to update multiple related symbols"
                ]
            };
        }

        default: {
            // Exhaustiveness check - TypeScript ensures all cases are handled
            const _exhaustive: never = symbolKind;
            return _exhaustive;
        }
    }
}

/**
 * Integrate refactor results with the transpiler for hot reload.
 * Takes hot reload updates and generates transpiled patches.
 */
export async function generateTranspilerPatches(
    hotReloadUpdates: Array<HotReloadUpdate>,
    readFile: WorkspaceReadFile,
    formatter: TranspilerBridge | null
): Promise<Array<TranspilerPatch>> {
    Core.assertArray(hotReloadUpdates, {
        errorMessage: "generateTranspilerPatches requires an array of hot reload updates"
    });
    Core.assertFunction(readFile, "readFile", {
        errorMessage: "generateTranspilerPatches requires a readFile function"
    });

    const patches: Array<TranspilerPatch> = [];

    // Parallelize transpilation for faster hot reload patch generation.
    // Each update's file read and transpilation is independent, so we can
    // process them concurrently to minimize total latency during hot reload.
    const patchResults = await Promise.all(
        hotReloadUpdates.map(async (update) => {
            // Filter to recompile actions since only script recompilations produce
            // runtime patches that can be hot-reloaded. Asset renames and other
            // non-code changes don't require transpilation or runtime updates.
            if (update.action !== "recompile") {
                return null;
            }

            try {
                const sourceText = await readFile(update.filePath);

                // Transpile the updated script into a hot-reload patch if a transpiler
                // is available. The patch contains executable JavaScript code that the
                // GameMaker runtime can inject without restarting the game.
                if (Core.hasMethods(formatter, "transpileScript")) {
                    const patch = await formatter.transpileScript({
                        sourceText,
                        symbolId: update.symbolId
                    });

                    return {
                        symbolId: update.symbolId,
                        patch,
                        filePath: update.filePath
                    };
                } else {
                    // Fall back to a basic patch structure containing only the source
                    // text when transpilation isn't available. This still allows the
                    // caller to process the updated files, though it won't be directly
                    // executable by GameMaker's runtime without manual intervention.
                    return {
                        symbolId: update.symbolId,
                        patch: {
                            kind: "script" as const,
                            id: update.symbolId,
                            sourceText,
                            version: Date.now()
                        },
                        filePath: update.filePath
                    };
                }
            } catch (error) {
                // Log error but continue processing other updates
                if (typeof console !== "undefined" && console.warn) {
                    console.warn(`Failed to generate patch for ${update.symbolId}: ${Core.getErrorMessage(error)}`);
                }
                return null;
            }
        })
    );

    // Filter out null results (skipped updates or errors) and collect patches
    for (const patch of patchResults) {
        if (patch !== null) {
            patches.push(patch);
        }
    }

    return patches;
}

/**
 * Compute a detailed dependency impact graph for a rename operation.
 * This provides visualization-ready data showing how a rename will propagate
 * through the dependency graph, essential for hot reload planning.
 *
 * @param symbolId - The symbol being renamed
 * @param semantic - Semantic analyzer for dependency queries
 * @returns Impact graph with nodes, edges, and critical path analysis
 *
 * @example
 * const graph = await computeRenameImpactGraph("gml/script/scr_base", semantic);
 * console.log(`Rename will affect ${graph.totalAffectedSymbols} symbols`);
 * console.log(`Critical path: ${graph.criticalPath.join(" → ")}`);
 * console.log(`Estimated reload time: ${graph.estimatedTotalReloadTime}ms`);
 */
export async function computeRenameImpactGraph(
    symbolId: string,
    semantic: PartialSemanticAnalyzer | null
): Promise<RenameImpactGraph> {
    Core.assertNonEmptyString(symbolId, {
        errorMessage: "computeRenameImpactGraph requires a valid symbolId"
    });

    const nodes = new Map<string, RenameImpactNode>();
    const symbolName = extractSymbolName(symbolId);

    // Initialize root node. This is the starting point for the breadth-first
    // traversal that will explore all transitive dependents. Setting distance=0
    // and isDirectlyAffected=true marks this as the origin symbol (the one being
    // renamed), which allows downstream logic to distinguish between the renamed
    // symbol itself and its transitive dependents. The root node anchors the
    // impact graph so we can trace back from any dependent to understand the
    // chain of references that caused it to be affected, and provides the baseline
    // for estimating reload times during hot-reload operations.
    nodes.set(symbolId, {
        symbolId,
        symbolName,
        distance: 0,
        isDirectlyAffected: true,
        dependents: [],
        dependsOn: [],
        estimatedReloadTime: 50
    });

    // If no semantic analyzer, return minimal graph
    if (!semantic) {
        return {
            nodes,
            rootSymbol: symbolId,
            totalAffectedSymbols: 1,
            maxDepth: 0,
            criticalPath: [symbolId],
            estimatedTotalReloadTime: 50
        };
    }

    // Level-parallel BFS: query all nodes at the same dependency depth concurrently.
    // Each level's getDependents calls are independent, so we fire them with
    // Promise.all and process results after the entire level resolves. This reduces
    // total latency from O(total_nodes) sequential async roundtrips to O(max_depth)
    // batched ones—critical for fast hot-reload turnaround when the dependency graph
    // has high branching factors (many dependents per symbol).
    //
    // The recursion is on levels (not individual nodes), so depth is bounded by the
    // dependency tree height rather than the total node count.
    //
    // Cycle-safety: the visited set is checked synchronously when building the next
    // level from the resolved results, so circular dependencies (A→B→C→A) still
    // terminate correctly even with parallel fetching.
    const visited = new Set<string>([symbolId]);

    const processLevel = async (currentLevel: ReadonlyArray<{ id: string; distance: number }>): Promise<void> => {
        if (currentLevel.length === 0) {
            return;
        }

        // Fetch dependents for every node in this level in parallel
        const levelResults = await Promise.all(
            currentLevel.map(async ({ id: currentId, distance: currentDistance }) => {
                const dependents = await SymbolQueries.getSymbolDependents([currentId], semantic);
                return { currentId, currentDistance, dependents };
            })
        );

        const nextLevel: Array<{ id: string; distance: number }> = [];

        for (const { currentId, currentDistance, dependents } of levelResults) {
            for (const dep of dependents) {
                const depId = dep.symbolId;
                const depName = extractSymbolName(depId);

                // Record the dependent edge on the parent node so callers can traverse
                // the graph in either direction. We do this before the visited check so
                // diamond-shaped graphs (two parents sharing the same child) correctly
                // record both parent→child edges even when the child is already in the
                // visited set from the first parent.
                const currentNode = nodes.get(currentId);
                if (currentNode && !currentNode.dependents.includes(depId)) {
                    currentNode.dependents.push(depId);
                }

                // Skip already-visited symbols to prevent infinite cycles in the
                // dependency graph. Without this guard, circular dependencies (A→B→C→A)
                // would cause the traversal to loop indefinitely, consuming unbounded
                // memory and CPU. The visited set acts as a termination condition: once a
                // symbol has been explored, we record its impact and move on.
                if (visited.has(depId)) {
                    continue;
                }

                visited.add(depId);

                nodes.set(depId, {
                    symbolId: depId,
                    symbolName: depName,
                    distance: currentDistance + 1,
                    isDirectlyAffected: false,
                    dependents: [],
                    dependsOn: [currentId],
                    filePath: dep.filePath,
                    estimatedReloadTime: 30
                });

                nextLevel.push({ id: depId, distance: currentDistance + 1 });
            }
        }

        await processLevel(nextLevel);
    };

    await processLevel([{ id: symbolId, distance: 0 }]);

    // Compute metrics
    const maxDepth = Math.max(...Array.from(nodes.values()).map((n) => n.distance));
    const totalAffectedSymbols = nodes.size;

    // Find critical path (longest dependency chain)
    const criticalPath = findCriticalPath(nodes, symbolId);

    // Estimate total reload time
    const estimatedTotalReloadTime = Array.from(nodes.values()).reduce(
        (sum, node) => sum + (node.estimatedReloadTime ?? 0),
        0
    );

    return {
        nodes,
        rootSymbol: symbolId,
        totalAffectedSymbols,
        maxDepth,
        criticalPath,
        estimatedTotalReloadTime
    };
}

/**
 * Find the critical path (longest dependency chain) in the impact graph.
 * Uses DFS to find the path with maximum depth.
 * @private
 */
function findCriticalPath(nodes: Map<string, RenameImpactNode>, rootSymbol: string): Array<string> {
    const visited = new Set<string>();
    let longestPath: Array<string> = [];

    function dfs(symbolId: string, currentPath: Array<string>): void {
        if (visited.has(symbolId)) {
            return;
        }

        visited.add(symbolId);
        currentPath.push(symbolId);

        const node = nodes.get(symbolId);
        if (!node) {
            visited.delete(symbolId);
            currentPath.pop();
            return;
        }

        // If this is a leaf node and the path is longer, update longest path
        if (node.dependents.length === 0 && currentPath.length > longestPath.length) {
            longestPath = [...currentPath];
        }

        // Recurse into dependents
        for (const depId of node.dependents) {
            dfs(depId, currentPath);
        }

        visited.delete(symbolId);
        currentPath.pop();
    }

    dfs(rootSymbol, []);
    return longestPath.length > 0 ? longestPath : [rootSymbol];
}
