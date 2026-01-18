import * as TranspilerAPI from "./src/index.js";

export const Transpiler = Object.freeze({
    ...TranspilerAPI
});

export type { GmlTranspiler, ScriptPatch, TranspilerDependencies, TranspileScriptRequest } from "./src/api/index.js";
