import { identifierCaseOptions } from "gamemaker-language-semantic/identifier-case/options.js";

import { handleComments, printComment } from "../comments/comment-printer.js";
import { LogicalOperatorsStyle } from "../options/logical-operators-style.js";
import { gmlParserAdapter } from "../parsers/gml-parser-adapter.js";
import { print } from "../printer/print.js";

const DEFAULT_GML_PLUGIN_COMPONENT_DEPENDENCIES = Object.freeze({
    gmlParserAdapter,
    print,
    handleComments,
    printComment,
    identifierCaseOptions,
    LogicalOperatorsStyle
});

/**
 * Return the canonical dependency bundle used to wire the built-in plugin
 * components together.
 *
 * The object is frozen so callers can safely share the same instance across
 * component providers without risking mutation. Consumers should treat the
 * result as read-only and re-call the factory if a fresh object is required.
 *
 * @returns {Readonly<{
 *     gmlParserAdapter: typeof gmlParserAdapter,
 *     print: typeof print,
 *     handleComments: typeof handleComments,
 *     printComment: typeof printComment,
 *     identifierCaseOptions: typeof identifierCaseOptions,
 *     LogicalOperatorsStyle: typeof LogicalOperatorsStyle
 * }>} Immutable dependency manifest shared by the default plugin components.
 */
export function createDefaultGmlPluginComponentDependencies() {
    return DEFAULT_GML_PLUGIN_COMPONENT_DEPENDENCIES;
}

export const defaultGmlPluginComponentDependencies =
    DEFAULT_GML_PLUGIN_COMPONENT_DEPENDENCIES;
