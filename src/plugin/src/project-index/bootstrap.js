import path from "node:path";

import { normalizeNumericOption } from "../../../shared/numeric-option-utils.js";
import { isNonEmptyTrimmedString } from "../../../shared/string-utils.js";
import { coalesceOption, isObjectLike } from "../../../shared/object-utils.js";
import { toNormalizedInteger } from "../../../shared/number-utils.js";
import {
    findProjectRoot,
    createProjectIndexCoordinator,
    getProjectIndexParserOverride
} from "./index.js";

const PROJECT_INDEX_CACHE_MAX_BYTES_INTERNAL_OPTION_NAME =
    "__identifierCaseProjectIndexCacheMaxBytes";
const PROJECT_INDEX_CACHE_MAX_BYTES_OPTION_NAME =
    "gmlIdentifierCaseProjectIndexCacheMaxBytes";
const PROJECT_INDEX_CONCURRENCY_INTERNAL_OPTION_NAME =
    "__identifierCaseProjectIndexConcurrency";
const PROJECT_INDEX_CONCURRENCY_OPTION_NAME =
    "gmlIdentifierCaseProjectIndexConcurrency";

function readOptionWithOverride(options, { internalKey, externalKey }) {
    if (!isObjectLike(options)) {
        return;
    }

    if (internalKey != null) {
        const internalValue = options[internalKey];
        if (internalValue !== undefined) {
            return { value: internalValue, source: "internal" };
        }
    }

    if (externalKey != null) {
        const externalValue = options[externalKey];
        if (externalValue !== undefined) {
            return { value: externalValue, source: "external" };
        }
    }

    return;
}

function resolveOptionWithOverride(options, config) {
    const { onValue, onMissing, ...overrideKeys } = config ?? {};

    if (typeof onValue !== "function") {
        throw new TypeError("onValue must be a function");
    }

    const entry = readOptionWithOverride(options, overrideKeys);

    if (!entry) {
        return typeof onMissing === "function" ? onMissing() : onMissing;
    }

    return onValue(entry);
}

function getFsFacade(options) {
    return coalesceOption(options, ["__identifierCaseFs", "identifierCaseFs"], {
        fallback: null
    });
}

function getFormatterVersion(options) {
    return coalesceOption(
        options,
        [
            "identifierCaseFormatterVersion",
            "__identifierCaseFormatterVersion",
            "prettierVersion",
            "__prettierVersion"
        ],
        { fallback: null }
    );
}

function getPluginVersion(options) {
    return coalesceOption(
        options,
        [
            "identifierCasePluginVersion",
            "__identifierCasePluginVersion",
            "pluginVersion"
        ],
        { fallback: null }
    );
}

function createSkipResult(reason) {
    return {
        status: "skipped",
        reason,
        projectRoot: null,
        projectIndex: null,
        source: null,
        cache: null,
        dispose() {}
    };
}

const DEFAULT_OPTION_WRITER = (options, key, value) => {
    if (isObjectLike(options)) {
        options[key] = value;
    }
};

function getOptionWriter(storeOption) {
    return typeof storeOption === "function"
        ? storeOption
        : DEFAULT_OPTION_WRITER;
}

function storeBootstrapResult(
    options,
    result,
    writeOption = DEFAULT_OPTION_WRITER
) {
    writeOption(options, "__identifierCaseProjectIndexBootstrap", result);
    return result;
}

function formatCacheMaxSizeTypeError(optionName, type) {
    return `${optionName} must be provided as a non-negative integer (received type '${type}').`;
}

function formatCacheMaxSizeValueError(optionName, received) {
    return `${optionName} must be provided as a non-negative integer (received ${received}). Set to 0 to disable the size limit.`;
}

function formatConcurrencyTypeError(optionName, type) {
    return `${optionName} must be provided as a positive integer (received type '${type}').`;
}

function formatConcurrencyValueError(optionName, received) {
    return `${optionName} must be provided as a positive integer (received ${received}).`;
}

function coerceCacheMaxSize(
    numericValue,
    { optionName, received, invalidNumberMessage }
) {
    const normalized = toNormalizedInteger(numericValue);
    if (normalized === null) {
        throw new TypeError(invalidNumberMessage);
    }

    if (normalized < 0) {
        throw new Error(formatCacheMaxSizeValueError(optionName, received));
    }

    return normalized === 0 ? null : normalized;
}

function coerceProjectIndexConcurrency(numericValue, { optionName, received }) {
    const normalized = toNormalizedInteger(numericValue);
    if (normalized === null) {
        throw new TypeError(formatConcurrencyValueError(optionName, received));
    }

    if (normalized < 1) {
        throw new Error(formatConcurrencyValueError(optionName, received));
    }

    return normalized;
}

function normalizeCacheMaxSizeBytes(rawValue, { optionName }) {
    return normalizeNumericOption(rawValue, {
        optionName,
        coerce: coerceCacheMaxSize,
        formatTypeError: formatCacheMaxSizeTypeError,
        createCoerceOptions({ optionName, rawType, received, isString }) {
            return {
                optionName,
                received,
                invalidNumberMessage: isString
                    ? formatCacheMaxSizeValueError(optionName, received)
                    : formatCacheMaxSizeTypeError(optionName, rawType)
            };
        }
    });
}

function resolveCacheMaxSizeBytes(options) {
    return resolveOptionWithOverride(options, {
        internalKey: PROJECT_INDEX_CACHE_MAX_BYTES_INTERNAL_OPTION_NAME,
        externalKey: PROJECT_INDEX_CACHE_MAX_BYTES_OPTION_NAME,
        onValue(entry) {
            if (entry.source === "internal" && entry.value === null) {
                return null;
            }

            return normalizeCacheMaxSizeBytes(entry.value, {
                optionName: PROJECT_INDEX_CACHE_MAX_BYTES_OPTION_NAME
            });
        }
    });
}

function normalizeProjectIndexConcurrency(rawValue, { optionName }) {
    return normalizeNumericOption(rawValue, {
        optionName,
        coerce: coerceProjectIndexConcurrency,
        formatTypeError: formatConcurrencyTypeError,
        createCoerceOptions({ optionName, received }) {
            return { optionName, received };
        }
    });
}

function resolveProjectIndexConcurrency(options) {
    return resolveOptionWithOverride(options, {
        internalKey: PROJECT_INDEX_CONCURRENCY_INTERNAL_OPTION_NAME,
        externalKey: PROJECT_INDEX_CONCURRENCY_OPTION_NAME,
        onValue(entry) {
            return normalizeProjectIndexConcurrency(entry.value, {
                optionName: PROJECT_INDEX_CONCURRENCY_OPTION_NAME
            });
        }
    });
}

function resolveProjectRoot(options) {
    return resolveOptionWithOverride(options, {
        internalKey: "__identifierCaseProjectRoot",
        externalKey: "gmlIdentifierCaseProjectRoot",
        onMissing: null,
        onValue(entry) {
            if (!isNonEmptyTrimmedString(entry.value)) {
                return null;
            }

            const projectRoot =
                entry.source === "external" ? entry.value.trim() : entry.value;

            return path.resolve(projectRoot);
        }
    });
}

export async function bootstrapProjectIndex(options = {}, storeOption) {
    if (!isObjectLike(options)) {
        return createSkipResult("invalid-options");
    }

    if (options.__identifierCaseProjectIndexBootstrap?.status) {
        return options.__identifierCaseProjectIndexBootstrap;
    }

    const writeOption = getOptionWriter(storeOption);

    if (options.__identifierCaseProjectIndex) {
        const projectRoot =
            options.__identifierCaseProjectRoot ?? resolveProjectRoot(options);
        return storeBootstrapResult(
            options,
            {
                status: "ready",
                reason: "provided",
                projectRoot,
                projectIndex: options.__identifierCaseProjectIndex,
                source: "provided",
                cache: null,
                dispose() {}
            },
            writeOption
        );
    }

    if (options.gmlIdentifierCaseDiscoverProject === false) {
        return storeBootstrapResult(
            options,
            createSkipResult("discovery-disabled"),
            writeOption
        );
    }

    const fsFacade = getFsFacade(options);

    let projectRoot = resolveProjectRoot(options);
    let rootResolution = projectRoot ? "configured" : null;

    const cacheMaxSizeBytes = resolveCacheMaxSizeBytes(options);
    if (cacheMaxSizeBytes !== undefined) {
        writeOption(
            options,
            PROJECT_INDEX_CACHE_MAX_BYTES_INTERNAL_OPTION_NAME,
            cacheMaxSizeBytes
        );
    }

    const projectIndexConcurrency = resolveProjectIndexConcurrency(options);
    if (projectIndexConcurrency !== undefined) {
        writeOption(
            options,
            PROJECT_INDEX_CONCURRENCY_INTERNAL_OPTION_NAME,
            projectIndexConcurrency
        );
    }

    if (!projectRoot) {
        const filepath = options?.filepath ?? null;
        if (!isNonEmptyTrimmedString(filepath)) {
            return storeBootstrapResult(
                options,
                createSkipResult("missing-filepath"),
                writeOption
            );
        }

        projectRoot = await findProjectRoot(
            { filepath },
            fsFacade ?? undefined
        );
        if (!projectRoot) {
            return storeBootstrapResult(
                options,
                createSkipResult("project-root-not-found"),
                writeOption
            );
        }

        rootResolution = "discovered";
    }

    const coordinatorOverride =
        options.__identifierCaseProjectIndexCoordinator ?? null;

    const coordinatorOptions = { fsFacade: fsFacade ?? undefined };
    if (cacheMaxSizeBytes !== undefined) {
        coordinatorOptions.cacheMaxSizeBytes = cacheMaxSizeBytes;
    }

    const coordinator =
        coordinatorOverride ??
        createProjectIndexCoordinator(coordinatorOptions);

    const buildOptions = {
        logger: options?.logger ?? null,
        logMetrics: options?.logIdentifierCaseMetrics === true
    };

    if (projectIndexConcurrency !== undefined) {
        buildOptions.concurrency = {
            gml: projectIndexConcurrency,
            gmlParsing: projectIndexConcurrency
        };
    }

    const parserOverride = getProjectIndexParserOverride(options);
    if (parserOverride) {
        if (parserOverride.facade) {
            buildOptions.gmlParserFacade = parserOverride.facade;
        }
        buildOptions.parseGml = parserOverride.parse;
    }

    const descriptor = {
        projectRoot,
        cacheFilePath: options?.identifierCaseProjectIndexCachePath ?? null,
        formatterVersion: getFormatterVersion(options) ?? undefined,
        pluginVersion: getPluginVersion(options) ?? undefined,
        buildOptions
    };

    if (cacheMaxSizeBytes !== undefined) {
        descriptor.maxSizeBytes = cacheMaxSizeBytes;
    }

    const ready = await coordinator.ensureReady(descriptor);

    const dispose = coordinatorOverride
        ? () => {}
        : () => {
              coordinator.dispose();
          };

    const result = storeBootstrapResult(
        options,
        {
            status: ready?.projectIndex ? "ready" : "skipped",
            reason: ready?.projectIndex ? rootResolution : "no-project-index",
            projectRoot,
            projectIndex: ready?.projectIndex ?? null,
            source: ready?.source ?? rootResolution,
            cache: ready?.cache ?? null,
            coordinator,
            dispose
        },
        writeOption
    );

    if (result.projectIndex) {
        writeOption(
            options,
            "__identifierCaseProjectIndex",
            result.projectIndex
        );
        writeOption(options, "__identifierCaseProjectRoot", projectRoot);
    }

    return result;
}

export function applyBootstrappedProjectIndex(options, storeOption) {
    if (!isObjectLike(options)) {
        return null;
    }

    const writeOption = getOptionWriter(storeOption);

    const bootstrapResult = options.__identifierCaseProjectIndexBootstrap;
    if (
        bootstrapResult?.projectIndex &&
        !options.__identifierCaseProjectIndex
    ) {
        writeOption(
            options,
            "__identifierCaseProjectIndex",
            bootstrapResult.projectIndex
        );
        if (
            bootstrapResult.projectRoot &&
            !options.__identifierCaseProjectRoot
        ) {
            writeOption(
                options,
                "__identifierCaseProjectRoot",
                bootstrapResult.projectRoot
            );
        }
    }

    return options.__identifierCaseProjectIndex ?? null;
}
