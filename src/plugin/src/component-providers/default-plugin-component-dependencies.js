import { identifierCaseOptions } from "gamemaker-language-semantic/identifier-case/options.js";

import { handleComments, printComment } from "../comments/comment-printer.js";
import { LogicalOperatorsStyle } from "../options/logical-operators-style.js";
import { gmlParserAdapter } from "../parsers/gml-parser-adapter.js";
import { print } from "../printer/print.js";

export const defaultGmlPluginComponentDependencies = Object.freeze({
    gmlParserAdapter,
    print,
    handleComments,
    printComment,
    identifierCaseOptions,
    LogicalOperatorsStyle
});
