import type { CallExpressionNode, CallTargetAnalyzer, IdentifierAnalyzer, IdentifierMetadata, SemKind } from "./ast.js";

/**
 * Semantic oracle adapter for GML object event transpilation.
 *
 * In a GML object event, any identifier that is not a locally declared `var`
 * variable, a recognized built-in function, a known script, or a global is
 * an **instance field** accessed through the implicit `self` reference. The
 * base `BasicSemanticOracle` cannot determine this without a live `ScopeTracker`,
 * and falls back to classifying such identifiers as `"local"`.
 *
 * `EventContextOracle` wraps a base oracle and overrides `kindOfIdent` to
 * upgrade those otherwise-unresolved `"local"` classifications to `"self_field"`.
 * The emitter then emits `self.<name>` for these identifiers, producing correct
 * JavaScript for the hot-reload event wrapper.
 *
 * Classification priority (evaluated in order):
 * 1. **Local variable** – name is in the provided `locals` set → `"local"`
 * 2. **Built-in / Script / Global** – base oracle returns a definitive kind
 *    that is NOT `"local"` → forwarded as-is
 * 3. **Unresolved identifier** – base oracle returns `"local"` but the name is
 *    not in `locals` → promoted to `"self_field"`
 *
 * All other oracle methods (`nameOfIdent`, `qualifiedSymbol`, `callTargetKind`,
 * `callTargetSymbol`) are forwarded unchanged to the base oracle.
 */
export class EventContextOracle implements IdentifierAnalyzer, CallTargetAnalyzer {
    private readonly base: IdentifierAnalyzer & CallTargetAnalyzer;
    private readonly locals: ReadonlySet<string>;

    /**
     * @param base - The underlying semantic oracle that handles built-in
     *               recognition, script classification, and global resolution.
     * @param locals - Set of variable names declared as `var` in the event body.
     *                 These are treated as bare locals; everything else is a
     *                 candidate for `self_field` promotion.
     */
    constructor(base: IdentifierAnalyzer & CallTargetAnalyzer, locals: ReadonlySet<string>) {
        this.base = base;
        this.locals = locals;
    }

    /**
     * Classify an identifier for code generation.
     *
     * Locally declared variables pass through as `"local"`. Known built-ins,
     * scripts, and globals are forwarded from the base oracle. Any remaining
     * unresolved identifier is promoted to `"self_field"` so the emitter
     * generates `self.<name>` instead of a bare reference that would fail
     * at runtime in the event wrapper.
     */
    kindOfIdent(node: IdentifierMetadata | null | undefined): SemKind {
        if (!node?.name) {
            return "local";
        }
        if (this.locals.has(node.name)) {
            return "local";
        }
        const baseKind = this.base.kindOfIdent(node);
        // Promote unresolved "local" to "self_field" in event context.
        // The base oracle returns "local" as a default when it has no scope
        // tracker and the identifier is not a builtin/script/global.
        return baseKind === "local" ? "self_field" : baseKind;
    }

    nameOfIdent(node: IdentifierMetadata | null | undefined): string {
        return this.base.nameOfIdent(node);
    }

    qualifiedSymbol(node: IdentifierMetadata | null | undefined): string | null {
        return this.base.qualifiedSymbol(node);
    }

    callTargetKind(node: CallExpressionNode): "script" | "builtin" | "unknown" {
        return this.base.callTargetKind(node);
    }

    callTargetSymbol(node: CallExpressionNode): string | null {
        return this.base.callTargetSymbol(node);
    }
}
