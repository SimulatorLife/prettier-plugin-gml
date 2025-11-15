// Compatibility shim: re-export the parser-local implementation while the
// migration moves canonical helpers into `src/core`.
export {
    buildDeprecatedBuiltinVariableReplacements,
    getDeprecatedBuiltinReplacementEntry
} from "@gml-modules/parser";
