import { createSampleLimitRuntimeOption } from "./sample-limit-toolkit.js";

/**
 * Consolidated sample limit configurations for CLI reporting.
 *
 * Previously fragmented across three separate modules (ignored-file-sample-limit,
 * skipped-directory-sample-limit, unsupported-extension-sample-limit), each
 * duplicating the same factory pattern with different parameters. This
 * consolidation groups related configuration together, reducing module
 * proliferation while maintaining the same public API.
 *
 * Each configuration is frozen and exported under its original name to ensure
 * drop-in compatibility with existing consumers.
 */

export const ignoredFileSampleLimit = Object.freeze(
    createSampleLimitRuntimeOption({
        defaultValue: 5,
        envVar: "PRETTIER_PLUGIN_GML_IGNORED_FILE_SAMPLE_LIMIT",
        subjectLabel: "Ignored file"
    })
);

export const {
    defaultValue: DEFAULT_IGNORED_FILE_SAMPLE_LIMIT,
    envVar: IGNORED_FILE_SAMPLE_LIMIT_ENV_VAR,
    getDefault: getDefaultIgnoredFileSampleLimit,
    setDefault: setDefaultIgnoredFileSampleLimit,
    resolve: resolveIgnoredFileSampleLimit,
    applyEnvOverride: applyIgnoredFileSampleLimitEnvOverride
} = ignoredFileSampleLimit;

export const skippedDirectorySampleLimit = Object.freeze(
    createSampleLimitRuntimeOption({
        defaultValue: 5,
        envVar: "PRETTIER_PLUGIN_GML_SKIPPED_DIRECTORY_SAMPLE_LIMIT",
        subjectLabel: "Skipped directory"
    })
);

export const {
    defaultValue: DEFAULT_SKIPPED_DIRECTORY_SAMPLE_LIMIT,
    envVar: SKIPPED_DIRECTORY_SAMPLE_LIMIT_ENV_VAR,
    getDefault: getDefaultSkippedDirectorySampleLimit,
    setDefault: setDefaultSkippedDirectorySampleLimit,
    resolve: resolveSkippedDirectorySampleLimit,
    applyEnvOverride: applySkippedDirectorySampleLimitEnvOverride
} = skippedDirectorySampleLimit;

export const unsupportedExtensionSampleLimit = Object.freeze(
    createSampleLimitRuntimeOption({
        defaultValue: 5,
        envVar: "PRETTIER_PLUGIN_GML_UNSUPPORTED_EXTENSION_SAMPLE_LIMIT",
        subjectLabel: "Unsupported extension"
    })
);

export const {
    defaultValue: DEFAULT_UNSUPPORTED_EXTENSION_SAMPLE_LIMIT,
    envVar: UNSUPPORTED_EXTENSION_SAMPLE_LIMIT_ENV_VAR,
    getDefault: getDefaultUnsupportedExtensionSampleLimit,
    setDefault: setDefaultUnsupportedExtensionSampleLimit,
    resolve: resolveUnsupportedExtensionSampleLimit,
    applyEnvOverride: applyUnsupportedExtensionSampleLimitEnvOverride
} = unsupportedExtensionSampleLimit;
