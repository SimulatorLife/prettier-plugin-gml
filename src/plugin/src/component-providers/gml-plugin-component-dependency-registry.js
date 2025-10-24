import {
    assertFunction,
    assertPlainObject
} from "../../../shared/object-utils.js";
import { createDefaultGmlPluginComponentDependencies } from "./default-plugin-component-dependencies.js";

const REQUIRED_DEPENDENCY_NAMES = Object.freeze([
    "gmlParserAdapter",
    "print",
    "handleComments",
    "printComment",
    "identifierCaseOptions",
    "LogicalOperatorsStyle"
]);

function assertHasDependency(dependencies, name) {
    if (!Object.hasOwn(dependencies, name)) {
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

    const {
        gmlParserAdapter,
        print,
        handleComments,
        printComment,
        identifierCaseOptions,
        LogicalOperatorsStyle
    } = dependencies;

    assertPlainObject(gmlParserAdapter, {
        name: "gmlParserAdapter",
        errorMessage:
            "GML plugin component dependencies must include a gmlParserAdapter object."
    });
    assertFunction(print, "print", {
        errorMessage:
            "GML plugin component dependencies must include a print function."
    });
    assertPlainObject(handleComments, {
        name: "handleComments",
        errorMessage:
            "GML plugin component dependencies must include handleComments helpers."
    });
    assertFunction(printComment, "printComment", {
        errorMessage:
            "GML plugin component dependencies must include a printComment function."
    });
    assertPlainObject(identifierCaseOptions, {
        name: "identifierCaseOptions",
        errorMessage:
            "GML plugin component dependencies must include identifierCaseOptions."
    });
    assertPlainObject(LogicalOperatorsStyle, {
        name: "LogicalOperatorsStyle",
        errorMessage:
            "GML plugin component dependencies must include LogicalOperatorsStyle definitions."
    });

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
    if (typeof provider !== "function") {
        throw new TypeError(
            "GML plugin component dependency providers must be functions that return dependency maps."
        );
    }

    currentProvider = provider;
    activeDependencies = normalizeDependencyMap(provider());
    return activeDependencies;
}

export function restoreDefaultGmlPluginComponentDependencies() {
    currentProvider = () => DEFAULT_DEPENDENCIES;
    activeDependencies = DEFAULT_DEPENDENCIES;
    return activeDependencies;
}

export function resetGmlPluginComponentDependencyProvider() {
    return restoreDefaultGmlPluginComponentDependencies();
}

export function getGmlPluginComponentDependencyProvider() {
    return currentProvider;
}
