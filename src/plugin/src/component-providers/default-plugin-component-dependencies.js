import { gmlParserAdapter } from "../parsers/gml-parser-adapter.js";
import { print } from "../printer/print.js";
import { handleComments, printComment } from "../comments/comment-printer.js";
import { identifierCaseOptions } from "gamemaker-language-semantic/identifier-case/options.js";
import { LogicalOperatorsStyle } from "../options/logical-operators-style.js";

const DEFAULT_GML_PLUGIN_COMPONENT_DEPENDENCIES = Object.freeze({
    gmlParserAdapter,
    print,
    handleComments,
    printComment,
    identifierCaseOptions,
    LogicalOperatorsStyle
});

export function createDefaultGmlPluginComponentDependencies() {
    return DEFAULT_GML_PLUGIN_COMPONENT_DEPENDENCIES;
}

export const defaultGmlPluginComponentDependencies =
    DEFAULT_GML_PLUGIN_COMPONENT_DEPENDENCIES;
