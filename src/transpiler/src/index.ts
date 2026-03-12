import * as API from "./api/index.js";
import * as Emitter from "./emitter/index.js";

export const Transpiler = Object.freeze({
    ...API,
    ...Emitter
});

export type {
    EventPatch,
    GmlTranspiler,
    ScriptPatch,
    TranspileEventRequest,
    TranspilerDependencies,
    TranspileScriptRequest
} from "./api/index.js";
