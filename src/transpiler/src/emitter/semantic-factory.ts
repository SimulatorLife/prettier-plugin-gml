import { Core } from "@gml-modules/core";
import { Semantic } from "@gml-modules/semantic";
import type { CallTargetAnalyzer, IdentifierAnalyzer } from "./ast.js";

/**
 * Configuration options for creating a semantic oracle for the transpiler.
 */
export interface SemanticOracleOptions {
    /**
     * Set of built-in function names. If not provided, loads from GameMaker
     * manual metadata via Core.loadManualFunctionNames().
     */
    readonly builtinNames?: Set<string>;

    /**
     * Set of known script names for script call classification.
     * Defaults to empty set if not provided.
     */
    readonly scriptNames?: Set<string>;
}

/**
 * Create a semantic oracle configured for transpiler use.
 *
 * This factory provides a properly configured `BasicSemanticOracle` that:
 * - Knows about all GameMaker built-in functions from manual metadata
 * - Can classify scripts when provided with script names
 * - Resolves local variables through an optional scope tracker
 *
 * The returned oracle implements both `IdentifierAnalyzer` and `CallTargetAnalyzer`
 * interfaces expected by the transpiler emitter.
 *
 * @param options Configuration for the semantic oracle
 * @returns An oracle instance that can classify identifiers and call targets
 *
 * @example
 * ```typescript
 * // Basic usage with just built-in functions
 * const oracle = createSemanticOracle();
 * const emitter = new GmlToJsEmitter({
 *   identifier: oracle,
 *   callTarget: oracle
 * });
 *
 * // With script tracking for hot reload
 * const oracle = createSemanticOracle({
 *   scriptNames: new Set(['scr_player_move', 'scr_enemy_ai'])
 * });
 * ```
 */
export function createSemanticOracle(options: SemanticOracleOptions = {}): IdentifierAnalyzer & CallTargetAnalyzer {
    const builtinNames = options.builtinNames ?? Core.loadManualFunctionNames();
    const scriptNames = options.scriptNames ?? new Set<string>();

    // SCOPE TRACKING DECISION: We pass `null` for the scope tracker parameter.
    //
    // The transpiler operates on individual AST nodes in isolation, emitting
    // JavaScript code without needing full project context or cross-file scope
    // information. The semantic oracle's built-in function knowledge and script
    // name classification are sufficient for code generation.
    //
    // Scope tracking would only be beneficial if the transpiler needed to:
    //   1. Distinguish between local variables and instance fields with the same name
    //   2. Handle shadowing across nested function scopes
    //   3. Generate different code based on declaration site
    //
    // Currently, the transpiler relies on GML's runtime semantics where undeclared
    // identifiers are treated as instance variables. This matches GameMaker's
    // behavior and avoids requiring full project analysis for transpilation.
    //
    // If scope-aware transpilation becomes necessary in the future, the integration
    // point would be through the public Semantic API (SemanticScopeCoordinator),
    // not the internal ScopeTracker class.
    const scopeTracker = null;

    // eslint-disable-next-line @typescript-eslint/no-unsafe-argument -- null is a valid ScopeTracker parameter per BasicSemanticOracle interface
    return new Semantic.BasicSemanticOracle(scopeTracker, builtinNames, scriptNames);
}
