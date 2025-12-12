import type { ScopeTracker } from "../scopes/scope-tracker.js";

/**
 * Semantic kind classification for identifiers, matching the transpiler's
 * expected vocabulary for code generation.
 */
export type SemKind =
    | "local"
    | "self_field"
    | "other_field"
    | "global_field"
    | "builtin"
    | "script";

/**
 * Minimal identifier metadata required for semantic analysis.
 */
export interface IdentifierMetadata {
    readonly name: string;
    readonly isGlobalIdentifier?: boolean;
}

/**
 * Call expression node structure expected by semantic oracle methods.
 */
export interface CallExpressionNode {
    readonly type: "CallExpression";
    readonly object: unknown;
}

/**
 * Semantic oracle interface required by the transpiler for accurate code
 * generation. Provides identifier classification, symbol resolution, and
 * call target analysis.
 */
export interface SemOracle {
    kindOfIdent(node: IdentifierMetadata | null | undefined): SemKind;
    nameOfIdent(node: IdentifierMetadata | null | undefined): string;
    qualifiedSymbol(node: IdentifierMetadata | null | undefined): string | null;
    callTargetKind(node: CallExpressionNode): "script" | "builtin" | "unknown";
    callTargetSymbol(node: CallExpressionNode): string | null;
}

/**
 * Basic semantic oracle implementation that bridges the scope tracker and
 * transpiler. Provides identifier classification and symbol resolution using
 * scope chain lookups without requiring full project analysis.
 *
 * This implementation prioritizes correctness over performance—it queries the
 * scope tracker for each identifier rather than caching results. Future
 * optimizations can add memoization if profiling indicates bottlenecks.
 */
export class BasicSemanticOracle implements SemOracle {
    private readonly tracker: ScopeTracker | null;
    private readonly builtinNames: Set<string>;

    /**
     * @param tracker Optional scope tracker instance. If null, falls back to
     *                sensible defaults without scope resolution.
     * @param builtinNames Set of built-in function names for call target
     *                     classification. Defaults to empty set.
     */
    constructor(
        tracker: ScopeTracker | null = null,
        builtinNames: Set<string> = new Set()
    ) {
        this.tracker = tracker;
        this.builtinNames = builtinNames;
    }

    /**
     * Classify an identifier based on its scope resolution and metadata.
     * Returns the semantic kind that drives transpiler code generation.
     *
     * Classification priority:
     * 1. Global identifiers (explicit `global.` or marked as global)
     * 2. Built-in functions (matched against known builtin set)
     * 3. Locally declared variables (resolved in scope chain)
     * 4. Default to "local" for unresolved identifiers
     *
     * Note: This implementation does not yet distinguish "self_field",
     * "other_field", or "script" kinds. Those require richer context from
     * the parser or project index and are deferred to future iterations.
     */
    kindOfIdent(node: IdentifierMetadata | null | undefined): SemKind {
        if (!node?.name) {
            return "local";
        }

        if (node.isGlobalIdentifier) {
            return "global_field";
        }

        if (this.builtinNames.has(node.name)) {
            return "builtin";
        }

        if (this.tracker) {
            const declaration = this.tracker.resolveIdentifier(node.name);
            if (declaration && typeof declaration === "object") {
                const classifications = Array.isArray(
                    (declaration as Record<string, unknown>).classifications
                )
                    ? ((declaration as Record<string, unknown>)
                          .classifications as string[])
                    : undefined;
                if (classifications?.includes("global")) {
                    return "global_field";
                }
                return "local";
            }
        }

        return "local";
    }

    /**
     * Extract the identifier name from a node. Returns empty string if the
     * node is null or lacks a name property.
     */
    nameOfIdent(node: IdentifierMetadata | null | undefined): string {
        return node?.name ?? "";
    }

    /**
     * Generate a qualified symbol identifier for cross-reference tracking.
     * Returns null for now since we don't yet have project-wide symbol IDs.
     *
     * Future enhancement: Return SCIP-style symbols (e.g., "gml/script/my_func")
     * when connected to the project index or symbol registry.
     */
    qualifiedSymbol(
        node: IdentifierMetadata | null | undefined
    ): string | null {
        if (!node?.name) {
            return null;
        }
        return null;
    }

    /**
     * Determine the kind of a call target (script, builtin, or unknown).
     * Uses the builtin name set to classify known functions. Scripts require
     * project-level analysis not yet implemented.
     */
    callTargetKind(node: CallExpressionNode): "script" | "builtin" | "unknown" {
        const callee = node.object as IdentifierMetadata | null | undefined;
        if (!callee?.name) {
            return "unknown";
        }

        if (this.builtinNames.has(callee.name)) {
            return "builtin";
        }

        return "unknown";
    }

    /**
     * Return a qualified symbol for the call target. Returns null for now
     * since we don't track script symbols yet.
     */
    callTargetSymbol(node: CallExpressionNode): string | null {
        const callee = node.object as IdentifierMetadata | null | undefined;
        if (!callee?.name) {
            return null;
        }
        return null;
    }
}

/**
 * Legacy standalone functions for backward compatibility. These delegate to
 * a default oracle instance with no scope tracker or builtin knowledge.
 *
 * @deprecated Use `BasicSemanticOracle` directly for better control and testing.
 */
const defaultOracle = new BasicSemanticOracle(null, new Set());

export function kindOfIdent(node?: IdentifierMetadata | null): SemKind {
    return defaultOracle.kindOfIdent(node);
}

export function nameOfIdent(node?: IdentifierMetadata | null): string {
    return defaultOracle.nameOfIdent(node);
}

export function qualifiedSymbol(
    node?: IdentifierMetadata | null
): string | null {
    return defaultOracle.qualifiedSymbol(node);
}

export function callTargetKind(
    node: CallExpressionNode
): "script" | "builtin" | "unknown" {
    return defaultOracle.callTargetKind(node);
}

export function callTargetSymbol(node: CallExpressionNode): string | null {
    return defaultOracle.callTargetSymbol(node);
}

export default {
    kindOfIdent,
    nameOfIdent,
    qualifiedSymbol,
    callTargetKind,
    callTargetSymbol,
    BasicSemanticOracle
};
