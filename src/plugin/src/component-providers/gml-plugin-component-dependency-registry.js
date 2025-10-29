import { assertFunction, assertPlainObject, hasOwn } from "../shared/index.js";
import { createDefaultGmlPluginComponentDependencies } from "./default-plugin-component-dependencies.js";

const REQUIRED_OBJECT_DEPENDENCIES = Object.freeze([
    [
        "gmlParserAdapter",
        "GML plugin component dependencies must include a gmlParserAdapter object."
    ],
    [
        "handleComments",
        "GML plugin component dependencies must include handleComments helpers."
    ],
    [
        "identifierCaseOptions",
        "GML plugin component dependencies must include identifierCaseOptions."
    ],
    [
        "LogicalOperatorsStyle",
        "GML plugin component dependencies must include LogicalOperatorsStyle definitions."
    ]
]);

const REQUIRED_FUNCTION_DEPENDENCIES = Object.freeze([
    [
        "print",
        "GML plugin component dependencies must include a print function."
    ],
    [
        "printComment",
        "GML plugin component dependencies must include a printComment function."
    ]
]);

const REQUIRED_DEPENDENCY_NAMES = Object.freeze([
    ...REQUIRED_OBJECT_DEPENDENCIES.map(([name]) => name),
    ...REQUIRED_FUNCTION_DEPENDENCIES.map(([name]) => name)
]);

function assertHasDependency(dependencies, name) {
    if (!hasOwn(dependencies, name)) {
        throw new TypeError(
            `GML plugin component dependencies must include ${name}.`
        );
    }
}

function normalizeDependencyMap(candidate) {
    const dependencies = assertPlainObject(candidate, {
        errorMessage:
            "GML plugin component dependencies must resolve to an object."
    });

    for (const dependencyName of REQUIRED_DEPENDENCY_NAMES) {
        assertHasDependency(dependencies, dependencyName);
    }

    for (const [name, errorMessage] of REQUIRED_OBJECT_DEPENDENCIES) {
        assertPlainObject(dependencies[name], { name, errorMessage });
    }

    for (const [name, errorMessage] of REQUIRED_FUNCTION_DEPENDENCIES) {
        assertFunction(dependencies[name], name, { errorMessage });
    }

    const {
        gmlParserAdapter,
        print,
        handleComments,
        printComment,
        identifierCaseOptions,
        LogicalOperatorsStyle
    } = dependencies;

    return Object.freeze({
        gmlParserAdapter,
        print,
        handleComments,
        printComment,
        identifierCaseOptions,
        LogicalOperatorsStyle
    });
}

const DEFAULT_DEPENDENCIES = normalizeDependencyMap(
    createDefaultGmlPluginComponentDependencies()
);

let currentProvider = () => DEFAULT_DEPENDENCIES;
let activeDependencies = DEFAULT_DEPENDENCIES;

export const gmlPluginComponentDependencies = DEFAULT_DEPENDENCIES;

export function resolveGmlPluginComponentDependencies() {
    return activeDependencies;
}

export function setGmlPluginComponentDependencyProvider(provider) {
    const normalizedProvider = assertFunction(provider, "provider", {
        errorMessage:
            "GML plugin component dependency providers must be functions that return dependency maps."
    });

    currentProvider = normalizedProvider;
    activeDependencies = normalizeDependencyMap(normalizedProvider());
    return activeDependencies;
}

export function restoreDefaultGmlPluginComponentDependencies() {
    currentProvider = () => DEFAULT_DEPENDENCIES;
    activeDependencies = DEFAULT_DEPENDENCIES;
    return activeDependencies;
}

export function getGmlPluginComponentDependencyProvider() {
    return currentProvider;
}
