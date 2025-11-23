import * as AST from "./ast/index.js";
import * as Comments from "./comments/index.js";
import * as FS from "./fs/index.js";
import * as Metrics from "./metrics/index.js";
import * as Utils from "./utils/index.js";
import * as Resources from "./resources/index.js";
import * as IdentifierMetadata from "./resources/gml-identifiers.js";
import * as DeprecatedBuiltinVariables from "./utils/deprecated-builtin-variable-replacements.js";

// Define the Core namespace type from existing module types
type CoreNamespace = 
    typeof AST &
    typeof Utils &
    typeof Metrics &
    typeof FS &
    typeof Resources &
    typeof IdentifierMetadata &
    typeof DeprecatedBuiltinVariables &
    typeof Comments;


// Public namespace flattening mirrors the monorepo convention: expose each
// helper directly flattened into the Core namespace so consumers always
// import from a single entry point without deep paths or re-export shims.
export const Core: CoreNamespace = Object.freeze({
    ...AST,
    ...FS,
    ...Metrics,
    ...Utils,
    ...Resources,
    ...IdentifierMetadata,
    ...DeprecatedBuiltinVariables,
    ...Comments
});
