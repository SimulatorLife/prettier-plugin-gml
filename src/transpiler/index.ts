import * as TranspilerAPI from "./src/index.js";

export const Transpiler = Object.freeze({
    ...TranspilerAPI
});

export type {
    ScriptPatch,
    TranspileScriptRequest,
    TranspilerDependencies,
    GmlTranspiler
} from "./src/api/index.js";
