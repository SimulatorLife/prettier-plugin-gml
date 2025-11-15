import { identifierCaseOptions } from "@gml-modules/semantic";

import { handleComments, printComment } from "../comments/public-api.js";
import { LogicalOperatorsStyle } from "../options/logical-operators-style.js";
import { gmlParserAdapter } from "../parsers/index.js";
import { print } from "../printer/index.js";

export const defaultGmlPluginComponentImplementations = Object.freeze({
    gmlParserAdapter,
    print,
    handleComments,
    printComment,
    identifierCaseOptions,
    LogicalOperatorsStyle
});
