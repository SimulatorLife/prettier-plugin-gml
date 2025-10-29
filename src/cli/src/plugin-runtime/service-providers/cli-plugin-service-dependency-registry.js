import { assertFunction, assertPlainObject } from "../dependencies.js";
import { defaultCliPluginServiceDependencies } from "./default-service-dependencies.js";

const REQUIRED_SERVICE_DEPENDENCIES = Object.freeze([
    [
        "projectIndexBuilder",
        "CLI plugin service dependencies must provide a projectIndexBuilder function."
    ],
    [
        "identifierCasePlanPreparer",
        "CLI plugin service dependencies must provide an identifierCasePlanPreparer function."
    ],
    [
        "identifierCaseCacheClearer",
        "CLI plugin service dependencies must provide an identifierCaseCacheClearer function."
    ]
]);

function isPromiseLike(value) {
    return !!value && typeof value.then === "function";
}

function normalizeDependencyMap(candidate) {
    const dependencies = assertPlainObject(candidate, {
        errorMessage:
            "CLI plugin service dependencies must resolve to an object."
    });

    for (const [name, errorMessage] of REQUIRED_SERVICE_DEPENDENCIES) {
        assertFunction(dependencies[name], name, { errorMessage });
    }

    if (Object.isFrozen(dependencies)) {
        return dependencies;
    }

    return Object.freeze({
        projectIndexBuilder: dependencies.projectIndexBuilder,
        identifierCasePlanPreparer: dependencies.identifierCasePlanPreparer,
        identifierCaseCacheClearer: dependencies.identifierCaseCacheClearer
    });
}

async function resolveDependencyResult(result) {
    const resolved = isPromiseLike(result) ? await result : result;
    return normalizeDependencyMap(resolved);
}

const DEFAULT_DEPENDENCIES = await resolveDependencyResult(
    defaultCliPluginServiceDependencies
);

let currentProvider = () => DEFAULT_DEPENDENCIES;
let activeDependencies = DEFAULT_DEPENDENCIES;

export function resolveCliPluginServiceDependencies() {
    return activeDependencies;
}

export function getCliPluginServiceDependencyProvider() {
    return currentProvider;
}

export async function setCliPluginServiceDependencyProvider(provider) {
    const normalizedProvider = assertFunction(provider, "provider", {
        errorMessage:
            "CLI plugin service dependency providers must be functions that return dependency maps."
    });

    const dependencies = await resolveDependencyResult(normalizedProvider());
    activeDependencies = dependencies;
    currentProvider = normalizedProvider;
    return dependencies;
}

export async function restoreDefaultCliPluginServiceDependencies() {
    activeDependencies = DEFAULT_DEPENDENCIES;
    currentProvider = () => DEFAULT_DEPENDENCIES;
    return activeDependencies;
}

export { DEFAULT_DEPENDENCIES as defaultCliPluginServiceDependenciesSnapshot };
