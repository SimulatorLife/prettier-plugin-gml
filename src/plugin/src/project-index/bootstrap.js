import path from "node:path";

import {
    findProjectRoot,
    createProjectIndexCoordinator
} from "../../../shared/project-index/index.js";
import { setIdentifierCaseOption } from "../identifier-case/option-store.js";

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

export async function bootstrapProjectIndex(options = {}) {
    if (!options || typeof options !== "object") {
        return createSkipResult("invalid-options");
    }

    if (options.__identifierCaseProjectIndexBootstrap?.status) {
        return options.__identifierCaseProjectIndexBootstrap;
    }

    if (options.__identifierCaseProjectIndex) {
        const projectRoot =
            options.__identifierCaseProjectRoot ?? resolveProjectRoot(options);
        const result = {
            status: "ready",
            reason: "provided",
            projectRoot,
            projectIndex: options.__identifierCaseProjectIndex,
            source: "provided",
            cache: null,
            dispose() {}
        };
        setIdentifierCaseOption(
            options,
            "__identifierCaseProjectIndexBootstrap",
            result
        );
        return result;
    }

    if (options.gmlIdentifierCaseDiscoverProject === false) {
        const result = createSkipResult("discovery-disabled");
        setIdentifierCaseOption(
            options,
            "__identifierCaseProjectIndexBootstrap",
            result
        );
        return result;
    }

    const fsFacade = getFsFacade(options);

    let projectRoot = resolveProjectRoot(options);
    let rootResolution = projectRoot ? "configured" : null;

    if (!projectRoot) {
        const filepath = options?.filepath ?? null;
        if (!isNonEmptyString(filepath)) {
            const result = createSkipResult("missing-filepath");
            setIdentifierCaseOption(
                options,
                "__identifierCaseProjectIndexBootstrap",
                result
            );
            return result;
        }

        projectRoot = await findProjectRoot(
            { filepath },
            fsFacade ?? undefined
        );
        if (!projectRoot) {
            const result = createSkipResult("project-root-not-found");
            setIdentifierCaseOption(
                options,
                "__identifierCaseProjectIndexBootstrap",
                result
            );
            return result;
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

    const result = {
        status: ready?.projectIndex ? "ready" : "skipped",
        reason: ready?.projectIndex ? rootResolution : "no-project-index",
        projectRoot,
        projectIndex: ready?.projectIndex ?? null,
        source: ready?.source ?? rootResolution,
        cache: ready?.cache ?? null,
        coordinator,
        dispose
    };

    setIdentifierCaseOption(
        options,
        "__identifierCaseProjectIndexBootstrap",
        result
    );

    if (result.projectIndex) {
        setIdentifierCaseOption(
            options,
            "__identifierCaseProjectIndex",
            result.projectIndex
        );
        setIdentifierCaseOption(
            options,
            "__identifierCaseProjectRoot",
            projectRoot
        );
    }

    return result;
}

export function applyBootstrappedProjectIndex(options) {
    if (!options || typeof options !== "object") {
        return null;
    }

    const bootstrapResult = options.__identifierCaseProjectIndexBootstrap;
    if (
        bootstrapResult?.projectIndex &&
        !options.__identifierCaseProjectIndex
    ) {
        setIdentifierCaseOption(
            options,
            "__identifierCaseProjectIndex",
            bootstrapResult.projectIndex
        );
        if (
            bootstrapResult.projectRoot &&
            !options.__identifierCaseProjectRoot
        ) {
            setIdentifierCaseOption(
                options,
                "__identifierCaseProjectRoot",
                bootstrapResult.projectRoot
            );
        }
    }

    return options.__identifierCaseProjectIndex ?? null;
}
