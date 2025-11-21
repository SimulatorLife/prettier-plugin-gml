import * as AST from "./ast/index.js";
import * as FS from "./fs/index.js";
import * as Metrics from "./metrics/index.js";
import * as Utils from "./utils/index.js";
import * as Resources from "./resources/index.js";
import * as IdentifierMetadata from "./resources/gml-identifiers.js";
import * as DeprecatedBuiltinVariables from "./utils/deprecated-builtin-variable-replacements.js";

// Public namespace flattening mirrors the monorepo convention: expose both the
// grouped submodules and each helper directly on the Core namespace so
// consumers always import from a single entry point without deep paths or
// re-export shims.
export const Core = Object.freeze({
    AST,
    FS,
    Metrics,
    Utils,
    Resources,
    IdentifierMetadata,
    DeprecatedBuiltinVariables,
    ...AST,
    ...FS,
    ...Metrics,
    ...Utils,
    ...Resources,
    ...IdentifierMetadata,
    ...DeprecatedBuiltinVariables
});

export type { GameMakerAstLocation, GameMakerAstNode } from "./ast/types.js";
