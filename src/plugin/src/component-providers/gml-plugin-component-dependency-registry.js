import { assertFunction, assertPlainObject } from "../shared/index.js";
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

    const requiredObjects = [
        [
            gmlParserAdapter,
            {
                name: "gmlParserAdapter",
                errorMessage:
                    "GML plugin component dependencies must include a gmlParserAdapter object."
            }
        ],
        [
            handleComments,
            {
                name: "handleComments",
                errorMessage:
                    "GML plugin component dependencies must include handleComments helpers."
            }
        ],
        [
            identifierCaseOptions,
            {
                name: "identifierCaseOptions",
                errorMessage:
                    "GML plugin component dependencies must include identifierCaseOptions."
            }
        ],
        [
            LogicalOperatorsStyle,
            {
                name: "LogicalOperatorsStyle",
                errorMessage:
                    "GML plugin component dependencies must include LogicalOperatorsStyle definitions."
            }
        ]
    ];

    for (const [value, options] of requiredObjects) {
        assertPlainObject(value, options);
    }

    for (const [fn, name, errorMessage] of [
        [
            print,
            "print",
            "GML plugin component dependencies must include a print function."
        ],
        [
            printComment,
            "printComment",
            "GML plugin component dependencies must include a printComment function."
        ]
    ]) {
        assertFunction(fn, name, { errorMessage });
    }

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

export function resetGmlPluginComponentDependencyProvider() {
    return restoreDefaultGmlPluginComponentDependencies();
}

export function getGmlPluginComponentDependencyProvider() {
    return currentProvider;
}
