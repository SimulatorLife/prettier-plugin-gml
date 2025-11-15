/**
 * Shared semantic type stubs.
 *
 * Identifier-case modules and scope trackers reference the GameMaker AST node
 * structure in JSDoc comments via `import("../dependencies.js").GameMakerAstNode`.
 * Keep the definition centralized here so the type reference continues to work
 * without depending on any runtime re-exports.
 */

/**
 * @typedef {object} GameMakerAstLocation
 * @property {number | null | undefined} [line]
 * @property {number | null | undefined} [index]
 */

/**
 * @typedef {object} GameMakerAstNode
 * @property {string | null | undefined} [type]
 * @property {GameMakerAstLocation | null | undefined} [start]
 * @property {GameMakerAstLocation | null | undefined} [end]
 * @property {unknown} [object]
 * @property {unknown} [property]
 * @property {Array<unknown> | null | undefined} [arguments]
 * @property {Array<unknown> | null | undefined} [body]
 */

/**
 * Placeholder export so consumers can continue to reference
 * `import("../dependencies.js").GameMakerAstNode` in JSDoc comments.
 * @type {GameMakerAstNode | null}
 */
export const GameMakerAstNode = null;
