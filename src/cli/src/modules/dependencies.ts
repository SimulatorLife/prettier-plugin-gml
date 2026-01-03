export * from "../shared/skip-cli-run.js";
export * from "../shared/ancestor-directories.js";
export * from "../shared/enumerated-option-helpers.js";

export { applyStandardCommandOptions } from "../cli-core/command-standard-options.js";

export { resolveCommandUsage } from "../cli-core/command-usage.js";

export { CliUsageError, createCliErrorDetails } from "../cli-core/errors.js";

export {
    coercePositiveInteger,
    resolveIntegerOption,
    wrapInvalidArgumentResolver
} from "../cli-core/command-parsing.js";

export { applyEnvOptionOverrides } from "../cli-core/env-overrides.js";

export {
    SuiteOutputFormat,
    collectSuiteResults,
    createSuiteResultsPayload,
    emitSuiteResults,
    ensureSuitesAreKnown,
    resolveRequestedSuites,
    resolveSuiteOutputFormatOrThrow
} from "../cli-core/command-suite-helpers.js";

// Plugin runtime helpers live in ./plugin-runtime-dependencies.js to keep this
// bundle focused on shared CLI utilities.
export { formatByteSize, formatBytes } from "../shared/reporting/byte-format.js";

export {
    DEFAULT_PROGRESS_BAR_WIDTH,
    PROGRESS_BAR_WIDTH_ENV_VAR,
    applyProgressBarWidthEnvOverride,
    disposeProgressBars,
    getDefaultProgressBarWidth,
    renderProgressBar,
    resolveProgressBarWidth,
    setDefaultProgressBarWidth,
    withProgressBarCleanup,
    resetProgressBarRegistryForTesting
} from "../runtime-options/progress-bar.js";

export { ensureWorkflowPathsAllowed } from "../workflow/path-filter.js";

export { createCliRunSkippedError, isCliRunSkipped } from "../shared/skip-cli-run.js";

export { createPathFilter } from "../workflow/fixture-roots.js";

export { writeJsonArtifact, writeFileArtifact } from "../shared/fs-artifacts.js";

export { REPO_ROOT, resolveFromRepoRoot } from "../shared/workspace-paths.js";
