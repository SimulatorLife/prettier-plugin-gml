import path from "node:path";

import { findProjectRoot, createProjectIndexCoordinator } from "./index.js";
function isNonEmptyString(value) {
    return typeof value === "string" && value.trim().length > 0;
}

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
    if (!options || typeof options !== "object") {
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

function resolveProjectRoot(options) {
    if (isNonEmptyString(options?.__identifierCaseProjectRoot)) {
        return path.resolve(options.__identifierCaseProjectRoot);
    }

    if (isNonEmptyString(options?.gmlIdentifierCaseProjectRoot)) {
        const configuredRoot = options.gmlIdentifierCaseProjectRoot.trim();
        return path.resolve(configuredRoot);
    }

    return null;
}

export async function bootstrapProjectIndex(options = {}, storeOption) {
    if (!options || typeof options !== "object") {
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

    if (!projectRoot) {
        const filepath = options?.filepath ?? null;
        if (!isNonEmptyString(filepath)) {
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

    const coordinator =
        coordinatorOverride ??
        createProjectIndexCoordinator({ fsFacade: fsFacade ?? undefined });

    const descriptor = {
        projectRoot,
        cacheFilePath: options?.identifierCaseProjectIndexCachePath ?? null,
        formatterVersion: getFormatterVersion(options) ?? undefined,
        pluginVersion: getPluginVersion(options) ?? undefined,
        buildOptions: {
            logger: options?.logger ?? null,
            logMetrics: options?.logIdentifierCaseMetrics === true
        }
    };

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
    if (!options || typeof options !== "object") {
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
