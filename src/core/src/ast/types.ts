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
    /** Location of the node’s start. */
    start?: GameMakerAstLocation | null;
    /** Location of the node’s end. */
    end?: GameMakerAstLocation | null;
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
