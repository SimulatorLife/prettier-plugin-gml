export * from "../shared/dependencies.js";

export { applyStandardCommandOptions } from "../core/command-standard-options.js";

export { resolveCommandUsage } from "../core/command-usage.js";

export { CliUsageError, createCliErrorDetails } from "../core/errors.js";

export {
    coercePositiveInteger,
    resolveIntegerOption,
    wrapInvalidArgumentResolver
} from "../core/command-parsing.js";

export { applyEnvOptionOverrides } from "../core/env-overrides.js";

export { createIntegerOptionToolkit } from "../core/integer-option-toolkit.js";

export {
    SuiteOutputFormat,
    collectSuiteResults,
    createSuiteResultsPayload,
    emitSuiteResults,
    ensureSuitesAreKnown,
    resolveRequestedSuites,
    resolveSuiteOutputFormatOrThrow
} from "../core/command-suite-helpers.js";

// Plugin runtime helpers live in ./plugin-runtime-dependencies.js to keep this
// bundle focused on shared CLI utilities.
export { formatByteSize, formatBytes } from "../runtime-options/byte-format.js";

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
