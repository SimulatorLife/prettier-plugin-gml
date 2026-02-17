import { LogicalOperatorsStyle } from "../options/logical-operators-style.js";
import type { GmlPluginComponentContract } from "./plugin-types.js";

const IDENTIFIER_CASE_OPTIONS: GmlPluginComponentContract["identifierCaseOptions"] = Object.freeze({});

/**
 * Dependencies required to build the plugin component implementations.
 * Defining this type establishes the contract for dependency injection.
 */
export type GmlPluginComponentDependencies = {
    readonly gmlParserAdapter: GmlPluginComponentContract["gmlParserAdapter"];
    readonly print: GmlPluginComponentContract["print"];
    readonly handleComments: GmlPluginComponentContract["handleComments"];
    readonly printComment: GmlPluginComponentContract["printComment"];
};

/**
 * Builds the canonical component implementation bundle with injected dependencies.
 * This factory function accepts concrete implementations as parameters, establishing
 * a proper dependency inversion boundary where high-level orchestration code depends
 * on abstractions (this factory) rather than concrete adapter imports.
 *
 * @param dependencies - Concrete parser, printer, and comment handler implementations
 * @returns Frozen component contract with all required plugin components
 */
export function createDefaultGmlPluginComponentImplementations(
    dependencies: GmlPluginComponentDependencies
): GmlPluginComponentContract {
    return Object.freeze({
        gmlParserAdapter: dependencies.gmlParserAdapter,
        print: dependencies.print,
        handleComments: dependencies.handleComments,
        printComment: dependencies.printComment,
        identifierCaseOptions: IDENTIFIER_CASE_OPTIONS,
        LogicalOperatorsStyle
    });
}
