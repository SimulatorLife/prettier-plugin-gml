export * from "@prettier-plugin-gml/shared";

export {
    isMissingModuleDependency,
    resolveModuleDefaultExport
} from "./shared/module.js";

export {
    createVerboseDurationLogger,
    formatDuration,
    timeSync
} from "./shared/time-utils.js";
