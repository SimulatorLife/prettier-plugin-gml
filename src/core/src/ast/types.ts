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

export interface GameMakerAstNode {
    /** AST node kind (e.g., "Identifier", "Literal"). */
    type?: string | null;
    /** Location of the node’s start. */
    start?: GameMakerAstLocation | null;
    /** Location of the node’s end. */
    end?: GameMakerAstLocation | null;
    /** Contained sub-node (eg. `foo.bar`). */
    object?: unknown;
    /** Contained sub-node (eg. `foo.bar`). */
    property?: unknown;
    /** Argument list attached to call/assign nodes. */
    arguments?: Array<unknown> | null;
    /** Block or list of statements inside structured nodes. */
    body?: Array<unknown> | null;
}

export type MutableGameMakerAstNode = GameMakerAstNode & Record<string, unknown>;
