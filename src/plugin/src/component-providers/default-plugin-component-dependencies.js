import { gmlParserAdapter } from "../parsers/gml-parser-adapter.js";
import { print } from "../printer/print.js";
import { handleComments, printComment } from "../comments/comment-printer.js";
import { identifierCaseOptions } from "gamemaker-language-semantic/identifier-case/options.js";
import { LogicalOperatorsStyle } from "../options/logical-operators-style.js";

export function createDefaultGmlPluginComponentDependencies() {
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
