import { assertFunction, assertPlainObject, hasOwn } from "../shared/index.js";
import { defaultGmlPluginComponentImplementations } from "./default-plugin-component-implementations.js";

const REQUIRED_OBJECT_IMPLEMENTATIONS = Object.freeze([
    [
        "gmlParserAdapter",
        "GML plugin component implementations must include a gmlParserAdapter object."
    ],
    [
        "handleComments",
        "GML plugin component implementations must include handleComments helpers."
    ],
    [
        "identifierCaseOptions",
        "GML plugin component implementations must include identifierCaseOptions."
    ],
    [
        "LogicalOperatorsStyle",
        "GML plugin component implementations must include LogicalOperatorsStyle definitions."
    ]
]);

const REQUIRED_FUNCTION_IMPLEMENTATIONS = Object.freeze([
    [
        "print",
        "GML plugin component implementations must include a print function."
    ],
    [
        "printComment",
        "GML plugin component implementations must include a printComment function."
    ]
]);

const REQUIRED_IMPLEMENTATION_NAMES = Object.freeze([
    ...REQUIRED_OBJECT_IMPLEMENTATIONS.map(([name]) => name),
    ...REQUIRED_FUNCTION_IMPLEMENTATIONS.map(([name]) => name)
]);

function assertHasImplementation(implementations, name) {
    if (!hasOwn(implementations, name)) {
        throw new TypeError(
            `GML plugin component implementations must include ${name}.`
        );
    }
}

function normalizeImplementationMap(candidate) {
    const implementations = assertPlainObject(candidate, {
        errorMessage:
            "GML plugin component implementations must resolve to an object."
    });

    for (const implementationName of REQUIRED_IMPLEMENTATION_NAMES) {
        assertHasImplementation(implementations, implementationName);
    }

    for (const [name, errorMessage] of REQUIRED_OBJECT_IMPLEMENTATIONS) {
        assertPlainObject(implementations[name], { name, errorMessage });
    }

    for (const [name, errorMessage] of REQUIRED_FUNCTION_IMPLEMENTATIONS) {
        assertFunction(implementations[name], name, { errorMessage });
    }

    const {
        gmlParserAdapter,
        print,
        handleComments,
        printComment,
        identifierCaseOptions,
        LogicalOperatorsStyle
    } = implementations;

    return Object.freeze({
        gmlParserAdapter,
        print,
        handleComments,
        printComment,
        identifierCaseOptions,
        LogicalOperatorsStyle
    });
}

const DEFAULT_IMPLEMENTATIONS = normalizeImplementationMap(
    defaultGmlPluginComponentImplementations
);

let currentProvider = () => DEFAULT_IMPLEMENTATIONS;
let activeImplementations = DEFAULT_IMPLEMENTATIONS;

export const gmlPluginComponentImplementations = DEFAULT_IMPLEMENTATIONS;

export function resolveGmlPluginComponentImplementations() {
    return activeImplementations;
}

export function setGmlPluginComponentImplementationProvider(provider) {
    const normalizedProvider = assertFunction(provider, "provider", {
        errorMessage:
            "GML plugin component implementation providers must be functions that return implementation maps."
    });

    currentProvider = normalizedProvider;
    activeImplementations = normalizeImplementationMap(normalizedProvider());
    return activeImplementations;
}

export function restoreDefaultGmlPluginComponentImplementations() {
    currentProvider = () => DEFAULT_IMPLEMENTATIONS;
    activeImplementations = DEFAULT_IMPLEMENTATIONS;
    return activeImplementations;
}

export function resetGmlPluginComponentImplementationProvider() {
    return restoreDefaultGmlPluginComponentImplementations();
}

export function getGmlPluginComponentImplementationProvider() {
    return currentProvider;
}
