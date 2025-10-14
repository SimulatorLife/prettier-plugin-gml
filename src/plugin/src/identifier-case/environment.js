import { bootstrapProjectIndex } from "../project-index/bootstrap.js";
import { setIdentifierCaseOption } from "./option-store.js";
import {
    prepareIdentifierCasePlan,
    captureIdentifierCasePlanSnapshot
} from "./local-plan.js";
import { withObjectLike } from "../../../shared/object-utils.js";

const BOOTSTRAP_CLEANUP_FLAG = Symbol.for(
    "prettier-plugin-gml.identifierCaseBootstrapNeedsDispose"
);
const IDENTIFIER_CASE_LOGGER_NAMESPACE = "identifier-case";

function registerBootstrapCleanup(bootstrapResult) {
    if (typeof bootstrapResult?.dispose !== "function") {
        return null;
    }

    bootstrapResult[BOOTSTRAP_CLEANUP_FLAG] = true;
    return bootstrapResult;
}

function disposeBootstrap(bootstrapResult, logger = null) {
    if (!bootstrapResult || typeof bootstrapResult.dispose !== "function") {
        return;
    }

    if (!bootstrapResult[BOOTSTRAP_CLEANUP_FLAG]) {
        return;
    }

    bootstrapResult[BOOTSTRAP_CLEANUP_FLAG] = false;

    try {
        bootstrapResult.dispose();
    } catch (error) {
        if (typeof logger?.warn === "function") {
            const reason = error?.message ?? error;
            logger.warn(
                `[${IDENTIFIER_CASE_LOGGER_NAMESPACE}] Failed to dispose identifier case resources: ${reason}`
            );
        }
    }
}

export async function prepareIdentifierCaseEnvironment(options) {
    return withObjectLike(options, async (object) => {
        const bootstrapResult = await bootstrapProjectIndex(
            object,
            setIdentifierCaseOption
        );
        registerBootstrapCleanup(bootstrapResult);

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
}
