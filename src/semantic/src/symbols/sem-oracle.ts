import type { ScopeTracker } from "../scopes/scope-tracker.js";

/**
 * Type guard to check if a value is an identifier metadata object.
 */
function isIdentifierMetadata(
    value: unknown
): value is { name: string; isGlobalIdentifier?: boolean } {
    return (
        typeof value === "object" &&
        value !== null &&
        "name" in value &&
        typeof (value as { name: unknown }).name === "string"
    );
}

/**
 * Extract classifications array from a declaration object safely.
 */
function getClassifications(declaration: unknown): string[] | undefined {
    if (typeof declaration !== "object" || declaration === null) {
        return undefined;
    }

    const classifications = (declaration as Record<string, unknown>)
        .classifications;

    if (!Array.isArray(classifications)) {
        return undefined;
    }

    return classifications as string[];
}

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
            if (declaration) {
                const classifications = getClassifications(declaration);
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
     *
     * TODO: Return SCIP-style symbols (e.g., "gml/script/my_func") when
     * connected to the project index or symbol registry. Currently returns
     * null as project-wide symbol tracking is not yet implemented.
     */
    qualifiedSymbol(
        node: IdentifierMetadata | null | undefined
    ): string | null {
        void node;
        return null;
    }

    /**
     * Determine the kind of a call target (script, builtin, or unknown).
     * Uses the builtin name set to classify known functions.
     *
     * TODO: Add script classification when project-level analysis is
     * implemented. Currently only distinguishes builtins from unknown.
     */
    callTargetKind(node: CallExpressionNode): "script" | "builtin" | "unknown" {
        if (!isIdentifierMetadata(node.object)) {
            return "unknown";
        }

        if (this.builtinNames.has(node.object.name)) {
            return "builtin";
        }

        return "unknown";
    }

    /**
     * Return a qualified symbol for the call target.
     *
     * TODO: Return SCIP-style symbols when script tracking is implemented.
     * Currently returns null since we don't track script symbols yet.
     */
    callTargetSymbol(node: CallExpressionNode): string | null {
        void node;
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
