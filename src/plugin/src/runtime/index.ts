export type {
    FeatherRenameContext,
    FeatherRenamePlanEntry,
    FeatherRenamePlanRequest,
    FeatherRenameResolution,
    LoopHoistIdentifierContext,
    LoopHoistIdentifierResolution
} from "./semantic-safety-runtime.js";
export {
    prepareFeatherRenamePlan,
    resolveFeatherRename,
    resolveLoopHoistIdentifier,
    runWithFeatherRenamePlan
} from "./semantic-safety-runtime.js";
