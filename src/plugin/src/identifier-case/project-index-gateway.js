import {
    bootstrapProjectIndex,
    applyBootstrappedProjectIndex
} from "../project-index/bootstrap.js";
import { isObjectLike } from "../../../shared/object-utils.js";
import { setIdentifierCaseOption } from "./option-store.js";

function getExistingProjectIndex(options) {
    if (!isObjectLike(options)) {
        return null;
    }

    return (
        options.__identifierCaseProjectIndex ??
        options.identifierCaseProjectIndex ??
        null
    );
}

export async function bootstrapIdentifierCaseProjectIndex(options) {
    return bootstrapProjectIndex(options, setIdentifierCaseOption);
}

export function applyBootstrappedIdentifierCaseProjectIndex(options) {
    return applyBootstrappedProjectIndex(options, setIdentifierCaseOption);
}

export function resolveIdentifierCaseProjectIndex(options, fallback = null) {
    const projectIndex = getExistingProjectIndex(options);
    return projectIndex ?? fallback ?? null;
}

export async function ensureIdentifierCaseProjectIndex(
    options,
    fallback = null
) {
    const existing = resolveIdentifierCaseProjectIndex(options, fallback);
    if (existing) {
        return existing;
    }

    await bootstrapIdentifierCaseProjectIndex(options);
    const bootstrapped = applyBootstrappedIdentifierCaseProjectIndex(options);
    if (bootstrapped) {
        return bootstrapped;
    }

    return resolveIdentifierCaseProjectIndex(options, fallback);
}
