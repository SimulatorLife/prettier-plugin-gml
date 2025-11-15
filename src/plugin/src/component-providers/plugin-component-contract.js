import { Core } from "@gml-modules/core";
const {
    Utils: { assertFunction, assertPlainObject, hasOwn }
} = Core;

const REQUIRED_COMPONENT_DESCRIPTORS = Object.freeze([
    { name: "gmlParserAdapter", category: "object" },
    { name: "handleComments", category: "object" },
    { name: "identifierCaseOptions", category: "object" },
    { name: "LogicalOperatorsStyle", category: "object" },
    { name: "print", category: "function" },
    { name: "printComment", category: "function" }
]);

const REQUIRED_COMPONENT_NAMES = Object.freeze(
    REQUIRED_COMPONENT_DESCRIPTORS.map(({ name }) => name)
);

const REQUIRED_OBJECT_COMPONENTS = Object.freeze(
    REQUIRED_COMPONENT_DESCRIPTORS.filter(
        ({ category }) => category === "object"
    )
);

const REQUIRED_FUNCTION_COMPONENTS = Object.freeze(
    REQUIRED_COMPONENT_DESCRIPTORS.filter(
        ({ category }) => category === "function"
    )
);

function createMissingComponentMessage(context, name) {
    return `GML plugin component ${context} must include ${name}.`;
}

function assertHasComponent(components, name, context) {
    if (!hasOwn(components, name)) {
        throw new TypeError(createMissingComponentMessage(context, name));
    }
}

export function selectPluginComponentContractEntries(source) {
    const {
        gmlParserAdapter,
        print,
        handleComments,
        printComment,
        identifierCaseOptions,
        LogicalOperatorsStyle
    } = source;

    return Object.freeze({
        gmlParserAdapter,
        print,
        handleComments,
        printComment,
        identifierCaseOptions,
        LogicalOperatorsStyle
    });
}

export function createPluginComponentContractNormalizer(context) {
    const normalizedContext = String(context ?? "components");
    const contextErrorPrefix = `GML plugin component ${normalizedContext}`;

    return function normalizePluginComponentContract(candidate) {
        const components = assertPlainObject(candidate, {
            errorMessage: `${contextErrorPrefix} must resolve to an object.`
        });

        for (const componentName of REQUIRED_COMPONENT_NAMES) {
            assertHasComponent(components, componentName, normalizedContext);
        }

        for (const { name } of REQUIRED_OBJECT_COMPONENTS) {
            assertPlainObject(components[name], {
                name,
                errorMessage: createMissingComponentMessage(
                    normalizedContext,
                    name
                )
            });
        }

        for (const { name } of REQUIRED_FUNCTION_COMPONENTS) {
            assertFunction(components[name], name, {
                errorMessage: createMissingComponentMessage(
                    normalizedContext,
                    name
                )
            });
        }

        return selectPluginComponentContractEntries(components);
    };
}
