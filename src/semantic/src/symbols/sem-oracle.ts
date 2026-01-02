import type { ScopeTracker } from "../scopes/scope-tracker.js";
import { sym } from "./scip-symbols.js";

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
        return undefined as undefined;
    }

    const classifications = (declaration as Record<string, unknown>)
        .classifications;

    if (!Array.isArray(classifications)) {
        return undefined as undefined;
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
 * Analyzes identifiers to determine their semantic kind, name, and qualified
 * symbol. Used by the transpiler to generate correct variable references
 * (local vs global vs field access).
 */
export interface IdentifierAnalyzer {
    kindOfIdent(node: IdentifierMetadata | null | undefined): SemKind;
    nameOfIdent(node: IdentifierMetadata | null | undefined): string;
    qualifiedSymbol(node: IdentifierMetadata | null | undefined): string | null;
}

/**
 * Analyzes call expression targets to classify them as scripts, built-ins,
 * or unknown callables. Used by the transpiler to route script calls through
 * the runtime wrapper and handle built-in functions specially.
 */
export interface CallTargetAnalyzer {
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
 *
 * Implements both IdentifierAnalyzer and CallTargetAnalyzer interfaces to
 * support clients that need both capabilities. Clients should depend on the
 * specific interface(s) they need rather than requiring both.
 */
export class BasicSemanticOracle
    implements IdentifierAnalyzer, CallTargetAnalyzer
{
    private readonly tracker: ScopeTracker | null;
    private readonly builtinNames: Set<string>;
    private readonly scriptNames: Set<string>;

    /**
     * @param tracker Optional scope tracker instance. If null, falls back to
     *                sensible defaults without scope resolution.
     * @param builtinNames Set of built-in function names for call target
     *                     classification. Defaults to empty set.
     * @param scriptNames Set of known script names for script classification
     *                    and SCIP symbol generation. Defaults to empty set.
     */
    constructor(
        tracker: ScopeTracker | null = null,
        builtinNames: Set<string> = new Set(),
        scriptNames: Set<string> = new Set()
    ) {
        this.tracker = tracker;
        this.builtinNames = builtinNames;
        this.scriptNames = scriptNames;
    }

    /**
     * Classify an identifier based on its scope resolution and metadata.
     * Returns the semantic kind that drives transpiler code generation.
     *
     * Classification priority:
     * 1. Global identifiers (explicit `global.` or marked as global)
     * 2. Built-in functions (matched against known builtin set)
     * 3. Script names (matched against provided script set)
     * 4. Locally declared variables (resolved in scope chain)
     * 5. Default to "local" for unresolved identifiers
     *
     * Note: This implementation does not yet distinguish "self_field" or
     * "other_field" kinds. Those require richer context from the parser or
     * project index and are deferred to future iterations.
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

        if (this.scriptNames.has(node.name)) {
            return "script";
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
     * Generate a qualified SCIP-style symbol identifier for cross-reference
     * tracking and hot reload coordination.
     *
     * Returns SCIP symbols in the format:
     * - Scripts: "gml/script/{name}"
     * - Global variables: "gml/var/global::{name}"
     * - Built-ins: "gml/builtin/{name}"
     * - null for local variables (they don't need project-wide tracking)
     *
     * This enables hot reload pipelines to track dependencies and coordinate
     * invalidation when symbols change.
     */
    qualifiedSymbol(
        node: IdentifierMetadata | null | undefined
    ): string | null {
        if (!node?.name) {
            return null;
        }

        const kind = this.kindOfIdent(node);

        switch (kind) {
            case "script": {
                return sym("script", node.name);
            }
            case "global_field": {
                return sym("var", `global::${node.name}`);
            }
            case "builtin": {
                return sym("macro", node.name);
            }
            case "local":
            case "self_field":
            case "other_field": {
                return null;
            }
            default: {
                return null;
            }
        }
    }

    /**
     * Determine the kind of a call target (script, builtin, or unknown).
     * Uses the builtin and script name sets to classify known functions.
     *
     * Classification enables the transpiler to:
     * - Route script calls through the hot reload wrapper
     * - Handle built-in functions with native shims
     * - Defer unknown calls to runtime resolution
     */
    callTargetKind(node: CallExpressionNode): "script" | "builtin" | "unknown" {
        if (!isIdentifierMetadata(node.object)) {
            return "unknown";
        }

        if (this.builtinNames.has(node.object.name)) {
            return "builtin";
        }

        if (this.scriptNames.has(node.object.name)) {
            return "script";
        }

        return "unknown";
    }

    /**
     * Return a qualified SCIP-style symbol for the call target to enable
     * hot reload dependency tracking.
     *
     * Returns:
     * - Scripts: "gml/script/{name}"
     * - Built-ins: "gml/macro/{name}" (treated as macros for SCIP)
     * - null for unknown call targets
     */
    callTargetSymbol(node: CallExpressionNode): string | null {
        if (!isIdentifierMetadata(node.object)) {
            return null;
        }

        const kind = this.callTargetKind(node);

        switch (kind) {
            case "script": {
                return sym("script", node.object.name);
            }
            case "builtin": {
                return sym("macro", node.object.name);
            }
            case "unknown": {
                return null;
            }
            default: {
                return null;
            }
        }
    }
}

/**
 * Legacy standalone functions for backward compatibility. These delegate to
 * a default oracle instance with no scope tracker, builtin knowledge, or
 * script tracking.
 *
 * @deprecated Use `BasicSemanticOracle` directly for better control and testing.
 */
const defaultOracle = new BasicSemanticOracle(null, new Set(), new Set());

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
