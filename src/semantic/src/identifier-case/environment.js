import { bootstrapIdentifierCaseProjectIndex } from "./project-index-gateway.js";
import {
    prepareIdentifierCasePlan,
    captureIdentifierCasePlanSnapshot
} from "./plan-service.js";
import { isObjectLike, noop, withObjectLike } from "../shared/index.js";
import {
    setIdentifierCaseOption,
    deleteIdentifierCaseOption
} from "./option-store.js";
import { warnWithReason } from "./logger.js";

const IDENTIFIER_CASE_LOGGER_NAMESPACE = "identifier-case";

const managedBootstraps = new WeakSet();

function nullifyProjectIndex(target) {
    if (isObjectLike(target) && Object.hasOwn(target, "projectIndex")) {
        target.projectIndex = null;
    }
}

function sanitizeBootstrapResult(bootstrap) {
    if (!isObjectLike(bootstrap)) {
        return;
    }

    nullifyProjectIndex(bootstrap);

    if (Object.hasOwn(bootstrap, "coordinator")) {
        bootstrap.coordinator = null;
    }

    if (typeof bootstrap.dispose === "function") {
        bootstrap.dispose = noop;
    }

    const { cache } = bootstrap;
    nullifyProjectIndex(cache);
    nullifyProjectIndex(cache?.payload);

    if (cache && Object.hasOwn(cache, "payload")) {
        cache.payload = null;
    }
}

function registerBootstrapCleanup(bootstrapResult) {
    if (typeof bootstrapResult?.dispose !== "function") {
        return null;
    }

    managedBootstraps.add(bootstrapResult);
    return bootstrapResult;
}

function disposeBootstrap(bootstrapResult, logger = null) {
    if (!bootstrapResult || typeof bootstrapResult.dispose !== "function") {
        return;
    }

    if (!managedBootstraps.has(bootstrapResult)) {
        return;
    }

    managedBootstraps.delete(bootstrapResult);

    try {
        bootstrapResult.dispose();
    } catch (error) {
        warnWithReason(
            logger,
            IDENTIFIER_CASE_LOGGER_NAMESPACE,
            "Failed to dispose identifier case resources",
            error
        );
    }
}

export async function prepareIdentifierCaseEnvironment(options) {
    return withObjectLike(options, async (object) => {
        const bootstrapResult =
            await bootstrapIdentifierCaseProjectIndex(object);
        registerBootstrapCleanup(bootstrapResult);

        if (bootstrapResult?.status === "failed") {
            if (object.__identifierCaseProjectIndexFailureLogged !== true) {
                const logger = object?.logger ?? null;
                warnWithReason(
                    logger,
                    IDENTIFIER_CASE_LOGGER_NAMESPACE,
                    "Project index bootstrap failed. Identifier case renames will be skipped",
                    bootstrapResult.error,
                    bootstrapResult.reason
                );
                setIdentifierCaseOption(
                    object,
                    "__identifierCaseProjectIndexFailureLogged",
                    true
                );
            }
            return;
        }

        try {
            await prepareIdentifierCasePlan(object);
        } catch (error) {
            disposeBootstrap(bootstrapResult, object?.logger ?? null);
            throw error;
        }
    });
}

export function attachIdentifierCasePlanSnapshot(ast, options) {
    withObjectLike(ast, (objectAst) => {
        const snapshot = captureIdentifierCasePlanSnapshot(options);
        if (!snapshot) {
            return;
        }

        Object.defineProperty(objectAst, "__identifierCasePlanSnapshot", {
            value: snapshot,
            enumerable: false,
            configurable: true
        });
    });
}

export function teardownIdentifierCaseEnvironment(options) {
    const bootstrap = options?.__identifierCaseProjectIndexBootstrap ?? null;
    disposeBootstrap(bootstrap, options?.logger ?? null);
    sanitizeBootstrapResult(bootstrap);
    deleteIdentifierCaseOption(options, "__identifierCaseProjectIndex");
    deleteIdentifierCaseOption(options, "__identifierCasePlanSnapshot");
    deleteIdentifierCaseOption(options, "__identifierCaseRenameMap");
}
