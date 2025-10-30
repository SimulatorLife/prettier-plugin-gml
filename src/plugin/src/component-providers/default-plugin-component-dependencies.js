import { resolveGmlPluginComponentImplementations } from "./gml-plugin-component-implementation-registry.js";

function selectDefaultImplementations() {
    return resolveGmlPluginComponentImplementations();
}

function createDependencyBundle(source) {
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

export function createDefaultGmlPluginComponentDependencies() {
    return createDependencyBundle(selectDefaultImplementations());
}

export const defaultGmlPluginComponentDependencies =
    createDefaultGmlPluginComponentDependencies();
