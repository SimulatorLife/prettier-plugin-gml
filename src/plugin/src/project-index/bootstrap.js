import path from "node:path";

import { isNonEmptyTrimmedString } from "../../../shared/string-utils.js";
import { isObjectLike } from "../../../shared/object-utils.js";
import { findProjectRoot, createProjectIndexCoordinator } from "./index.js";

const PROJECT_INDEX_CACHE_MAX_BYTES_INTERNAL_OPTION_NAME =
    "__identifierCaseProjectIndexCacheMaxBytes";
const PROJECT_INDEX_CACHE_MAX_BYTES_OPTION_NAME =
    "gmlIdentifierCaseProjectIndexCacheMaxBytes";

function getFsFacade(options) {
    return options?.__identifierCaseFs ?? options?.identifierCaseFs ?? null;
}

function getFormatterVersion(options) {
    return (
        options?.identifierCaseFormatterVersion ??
        options?.__identifierCaseFormatterVersion ??
        options?.prettierVersion ??
        options?.__prettierVersion ??
        null
    );
}

function getPluginVersion(options) {
    return (
        options?.identifierCasePluginVersion ??
        options?.__identifierCasePluginVersion ??
        options?.pluginVersion ??
        null
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

function defaultStoreOption(options, key, value) {
    if (!isObjectLike(options)) {
        return;
    }

    options[key] = value;
}

function storeOptionValue(storeOption, options, key, value) {
    if (typeof storeOption === "function") {
        storeOption(options, key, value);
    } else {
        defaultStoreOption(options, key, value);
    }
}

function storeBootstrapResult(options, result, storeOption) {
    storeOptionValue(
        storeOption,
        options,
        "__identifierCaseProjectIndexBootstrap",
        result
    );
    return result;
}

function normalizeCacheMaxSizeBytes(rawValue, { optionName }) {
    if (rawValue === undefined || rawValue === null) {
        return undefined;
    }

    const typeMessage = `${optionName} must be provided as a non-negative integer (received type '${typeof rawValue}').`;
    const rangeMessage = (received) =>
        `${optionName} must be provided as a non-negative integer (received ${received}). Set to 0 to disable the size limit.`;

    if (typeof rawValue === "number") {
        if (!Number.isFinite(rawValue)) {
            throw new Error(typeMessage);
        }

        const normalized = Math.trunc(rawValue);
        if (normalized < 0) {
            throw new Error(rangeMessage(rawValue));
        }

        return normalized === 0 ? null : normalized;
    }

    if (typeof rawValue === "string") {
        const trimmed = rawValue.trim();
        if (trimmed === "") {
            return undefined;
        }

        const numericValue = Number(trimmed);
        const received = `'${rawValue}'`;
        if (!Number.isFinite(numericValue)) {
            throw new Error(rangeMessage(received));
        }

        const normalized = Math.trunc(numericValue);
        if (normalized < 0) {
            throw new Error(rangeMessage(received));
        }

        return normalized === 0 ? null : normalized;
    }

    throw new Error(typeMessage);
}

function resolveCacheMaxSizeBytes(options) {
    if (!isObjectLike(options)) {
        return undefined;
    }

    if (
        options[PROJECT_INDEX_CACHE_MAX_BYTES_INTERNAL_OPTION_NAME] !==
        undefined
    ) {
        const stored =
            options[PROJECT_INDEX_CACHE_MAX_BYTES_INTERNAL_OPTION_NAME];
        if (stored === null) {
            return null;
        }

        return normalizeCacheMaxSizeBytes(stored, {
            optionName: PROJECT_INDEX_CACHE_MAX_BYTES_OPTION_NAME
        });
    }

    if (options[PROJECT_INDEX_CACHE_MAX_BYTES_OPTION_NAME] === undefined) {
        return undefined;
    }

    return normalizeCacheMaxSizeBytes(
        options[PROJECT_INDEX_CACHE_MAX_BYTES_OPTION_NAME],
        {
            optionName: PROJECT_INDEX_CACHE_MAX_BYTES_OPTION_NAME
        }
    );
}

function resolveProjectRoot(options) {
    if (isNonEmptyTrimmedString(options?.__identifierCaseProjectRoot)) {
        return path.resolve(options.__identifierCaseProjectRoot);
    }

    if (isNonEmptyTrimmedString(options?.gmlIdentifierCaseProjectRoot)) {
        const configuredRoot = options.gmlIdentifierCaseProjectRoot.trim();
        return path.resolve(configuredRoot);
    }

    return null;
}

export async function bootstrapProjectIndex(options = {}, storeOption) {
    if (!isObjectLike(options)) {
        return createSkipResult("invalid-options");
    }

    if (options.__identifierCaseProjectIndexBootstrap?.status) {
        return options.__identifierCaseProjectIndexBootstrap;
    }

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
            storeOption
        );
    }

    if (options.gmlIdentifierCaseDiscoverProject === false) {
        return storeBootstrapResult(
            options,
            createSkipResult("discovery-disabled"),
            storeOption
        );
    }

    const fsFacade = getFsFacade(options);

    let projectRoot = resolveProjectRoot(options);
    let rootResolution = projectRoot ? "configured" : null;

    const cacheMaxSizeBytes = resolveCacheMaxSizeBytes(options);
    if (cacheMaxSizeBytes !== undefined) {
        storeOptionValue(
            storeOption,
            options,
            PROJECT_INDEX_CACHE_MAX_BYTES_INTERNAL_OPTION_NAME,
            cacheMaxSizeBytes
        );
    }

    if (!projectRoot) {
        const filepath = options?.filepath ?? null;
        if (!isNonEmptyTrimmedString(filepath)) {
            return storeBootstrapResult(
                options,
                createSkipResult("missing-filepath"),
                storeOption
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
                storeOption
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

    const parserFacadeOverride =
        options.identifierCaseProjectIndexParserFacade ??
        options.gmlParserFacade ??
        options.parserFacade ??
        null;
    if (parserFacadeOverride != null) {
        buildOptions.gmlParserFacade = parserFacadeOverride;
    } else if (typeof options.parseGml === "function") {
        buildOptions.parseGml = options.parseGml;
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
        storeOption
    );

    if (result.projectIndex) {
        storeOptionValue(
            storeOption,
            options,
            "__identifierCaseProjectIndex",
            result.projectIndex
        );
        storeOptionValue(
            storeOption,
            options,
            "__identifierCaseProjectRoot",
            projectRoot
        );
    }

    return result;
}

export function applyBootstrappedProjectIndex(options, storeOption) {
    if (!isObjectLike(options)) {
        return null;
    }

    const bootstrapResult = options.__identifierCaseProjectIndexBootstrap;
    if (
        bootstrapResult?.projectIndex &&
        !options.__identifierCaseProjectIndex
    ) {
        storeOptionValue(
            storeOption,
            options,
            "__identifierCaseProjectIndex",
            bootstrapResult.projectIndex
        );
        if (
            bootstrapResult.projectRoot &&
            !options.__identifierCaseProjectRoot
        ) {
            storeOptionValue(
                storeOption,
                options,
                "__identifierCaseProjectRoot",
                bootstrapResult.projectRoot
            );
        }
    }

    return options.__identifierCaseProjectIndex ?? null;
}
