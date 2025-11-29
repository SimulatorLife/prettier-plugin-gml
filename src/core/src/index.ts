// Do NOT add any additional exports or 'compatibility' layers here
// This is aligned with the target state and consumers should be updated accordingly
// Do NOT modify or extend this file to nested namespaces or re-export shims

import * as AST from "./ast/index.js";
import * as Comments from "./comments/index.js";
import * as FS from "./fs/index.js";
import * as Metrics from "./metrics/index.js";
import * as Utils from "./utils/index.js";
import * as Resources from "./resources/index.js";
import * as IdentifierMetadata from "./resources/gml-identifier-loading.js";
import * as DeprecatedBuiltinVariables from "./utils/deprecated-builtin-variable-replacements.js";

// Define the Core namespace type from existing module types
type CoreNamespace = typeof AST &
    typeof Utils &
    typeof Metrics &
    typeof FS &
    typeof Resources &
    typeof IdentifierMetadata &
    typeof DeprecatedBuiltinVariables &
    typeof Comments & {
        // Explicitly include the repo root helper for cross-package typing
        // so consumers can call `Core.findRepoRoot` without type errors.
        findRepoRoot(startDir: string): Promise<string>;
        findRepoRootSync(startDir: string): string;
    };

// Public namespace flattening mirrors the monorepo convention: expose each
// helper directly flattened into the Core namespace so consumers always
// import from a single entry point without deep paths or re-export shims.
export const Core: CoreNamespace = Object.freeze({
    ...AST,
    ...FS,
    findRepoRoot: FS.findRepoRoot,
    findRepoRootSync: FS.findRepoRootSync,
    ...Metrics,
    ...Utils,
    ...Resources,
    ...IdentifierMetadata,
    ...DeprecatedBuiltinVariables,
    ...Comments
});

// Publicly export key AST types at the package root for other packages to
// import without deep imports. This is the preferred path for type imports
// across the monorepo.
export type {
    GameMakerAstLocation,
    GameMakerAstNode,
    MutableGameMakerAstNode
} from "./ast/types.js";
export type {
    DocCommentLines,
    MutableDocCommentLines
} from "./comments/comment-utils.js";
