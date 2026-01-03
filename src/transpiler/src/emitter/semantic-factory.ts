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

    // TODO: Implement scope tracker integration for local variable resolution.
    // The BasicSemanticOracle supports a ScopeTracker parameter, but ScopeTracker
    // is not part of the public Semantic API. For now, we pass null to use
    // default classification without scope resolution.
    const scopeTracker = null;

    return new Semantic.BasicSemanticOracle(scopeTracker, builtinNames, scriptNames);
}
