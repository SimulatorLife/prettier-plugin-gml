import * as TranspilerAPI from "./api/index.js";
import * as EmitterAPI from "./emitter/index.js";

export const Transpiler = Object.freeze({
    ...TranspilerAPI,
    ...EmitterAPI
});

export type { ScriptPatch, TranspileScriptRequest, TranspilerDependencies, GmlTranspiler } from "./api/index.js";
