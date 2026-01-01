// This module defines the public API surface for the Core package. Do NOT add
// re-export wrappers, compatibility shims, or transitional helpers here. The Core
// namespace is intentionally minimal and exposes only the canonical functionality
// defined in the submodules (AST, Comments, FS, Metrics, Utils, Resources). Adding
// legacy-support layers or pass-through exports would:
//   1. Dilute the single-responsibility principle by mixing compatibility concerns
//      with the core domain logic.
//   2. Create maintenance burden as deprecated APIs linger indefinitely.
//   3. Confuse consumers by presenting multiple paths to the same functionality.
//
// The target architecture mandates that external consumers update their imports
// to use the current namespace structure rather than expecting Core to accommodate
// old or inconsistent usage patterns. If a breaking change is necessary, document
// it clearly in the changelog and provide a migration guide—do NOT mask it with
// compatibility code here. This file should remain a thin aggregation point, not
// a backward-compatibility layer.
//
// For detailed module structure conventions, see AGENTS.md § "Module structure,
// imports, and TypeScript / ESM strategy".

import * as AST from "./ast/index.js";
import * as Comments from "./comments/index.js";
import * as FS from "./fs/index.js";
import * as Metrics from "./metrics/index.js";
import * as Utils from "./utils/index.js";
import * as Resources from "./resources/index.js";
import * as IdentifierMetadata from "./resources/gml-identifier-loading.js";

// Define the Core namespace type from existing module types
type CoreNamespace = typeof AST &
    typeof Utils &
    typeof Metrics &
    typeof FS &
    typeof Resources &
    typeof IdentifierMetadata &
    typeof Comments & {
        // Explicitly include capability probe for WorkspaceEdit-like objects
        // to support polymorphic refactor operations across module boundaries.
        isWorkspaceEditLike(value: unknown): boolean;
    };

// Public namespace flattening mirrors the monorepo convention: expose each
// helper directly flattened into the Core namespace so consumers always
// import from a single entry point without deep paths or re-export shims.
export const Core: CoreNamespace = Object.freeze({
    ...AST,
    ...FS,
    ...Metrics,
    ...Utils,
    isWorkspaceEditLike: Utils.isWorkspaceEditLike,
    ...Resources,
    ...IdentifierMetadata,
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
export type { AbortSignalLike } from "./utils/abort.js";
