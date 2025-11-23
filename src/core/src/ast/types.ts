/**
 * Minimal AST type declarations that get shared across packages without
 * introducing circular runtime dependencies. These interfaces only describe
 * the portions of the parser AST that the semantic layer consumes.
 */
export interface GameMakerAstLocation {
    /** One-based line number when available. */
    line?: number | null;
    /** Zero-based index when available (typically same as Character/Column). */
    index?: number | null;
    /** Optional column (human-friendly one-based column) for diagnostics. */
    column?: number | null;
}

export interface FeatherFixRange {
    /** Character offset where the fix range begins (inclusive). */
    start: number | null;
    /** Character offset where the fix range ends (exclusive). */
    end: number | null;
}

export interface FeatherFixDetail {
    id: string | null;
    title: string | null;
    description: string | null;
    correction: string | null;
    replacement?: string | null;
    target: string | null;
    range: FeatherFixRange | null;
    automatic: boolean;
}

export interface GameMakerAstNode {
    /** AST node kind (e.g., "Identifier", "Literal"). */
    type?: string | null;
    /** Location of the node’s start. Some transforms normalize the start to a numeric index. */
    start?: number | GameMakerAstLocation | null;
    /** Location of the node’s end. Some transforms normalize the end to a numeric index. */
    end?: number | GameMakerAstLocation | null;
    /** Source text captured alongside the node when available. */
    sourceText?: string | null;
    /** Attached comments or documentation metadata. */
    comments?: Array<GameMakerAstNode> | null;
    docComments?: Array<GameMakerAstNode> | null;
    /** Feathers fix metadata registered against the node. */
    _appliedFeatherDiagnostics?: Array<FeatherFixDetail> | null;
    /** Helper metadata preserved by consolidation utilities. */
    _structTrailingComments?: Array<unknown> | null;
    _hasTrailingInlineComment?: boolean;
    _removedByConsolidation?: boolean;
    _featherMaterializedTrailingUndefined?: boolean;
    /** Opt-in runtime metadata flags used by semantic modules */
    isGlobalIdentifier?: boolean;
    /** Scope identifier assigned by semantic scope tracker */
    scopeId?: string | null;
    /** Declaration metadata attached to identifier nodes */
    declaration?: MutableGameMakerAstNode | null;
    /** Classification tags assigned by semantic passes (e.g., 'declaration', 'reference') */
    classifications?: Array<string> | null;
    /** Contained sub-node (eg. `foo.bar`). */
    object?: unknown;
    /** Contained sub-node (eg. `foo.bar`). */
    property?: unknown;
    /** Argument list attached to call/assign nodes. */
    arguments?: Array<unknown> | null;
    /** Block or list of statements inside structured nodes. */
    body?: Array<unknown> | null;
}

export type MutableGameMakerAstNode = GameMakerAstNode &
    Record<string, unknown>;
