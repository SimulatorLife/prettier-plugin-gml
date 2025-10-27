import { resolveDefaultGmlPluginComponentDependencyManifest } from "./default-plugin-component-dependency-manifest.js";

export function createDefaultGmlPluginComponentDependencies() {
    const manifest = resolveDefaultGmlPluginComponentDependencyManifest();

    const {
        gmlParserAdapter,
        print,
        handleComments,
        printComment,
        identifierCaseOptions,
        LogicalOperatorsStyle
    } = manifest;

    return {
        gmlParserAdapter,
        print,
        handleComments,
        printComment,
        identifierCaseOptions,
        LogicalOperatorsStyle
    };
}

export const defaultGmlPluginComponentDependencies = Object.freeze(
    createDefaultGmlPluginComponentDependencies()
);
