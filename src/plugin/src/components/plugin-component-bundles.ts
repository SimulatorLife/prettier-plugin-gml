import { handleComments, printComment } from "../comments/index.js";
import { LogicalOperatorsStyle } from "../options/logical-operators-style.js";
// Concrete adapter imports - encapsulated at this module boundary.
// Higher-level code receives these through the factory function rather than
// importing them directly, establishing a proper dependency inversion boundary.
import { gmlParserAdapter } from "../parsers/index.js";
import { print } from "../printer/index.js";
import type { GmlPluginComponentContract } from "./plugin-types.js";

const IDENTIFIER_CASE_OPTIONS = Object.freeze({});

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

const gmlPluginComponentImplementations = Object.freeze(
    createDefaultGmlPluginComponentImplementations({
        gmlParserAdapter,
        print,
        handleComments,
        printComment
    })
);

const gmlPluginComponentDependencies = gmlPluginComponentImplementations;

export { gmlPluginComponentDependencies, gmlPluginComponentImplementations };

export const defaultGmlPluginComponentImplementations = gmlPluginComponentImplementations;
export const defaultGmlPluginComponentDependencies = gmlPluginComponentDependencies;
