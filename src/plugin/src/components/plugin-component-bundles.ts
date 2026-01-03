import { Semantic } from "@gml-modules/semantic";
import { LogicalOperatorsStyle } from "../options/logical-operators-style.js";
import type { GmlPluginComponentContract } from "./plugin-types.js";
import { selectPluginComponentContractEntries } from "./plugin-component-contract.js";
// Concrete adapter imports - encapsulated at this module boundary.
// Higher-level code receives these through the factory function rather than
// importing them directly, establishing a proper dependency inversion boundary.
import { gmlParserAdapter } from "../parsers/index.js";
import { print } from "../printer/index.js";
import { handleComments, printComment } from "../comments/index.js";

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
        // Semantic provides identifier case option definitions; cast to satisfy
        // Prettier's SupportOptions type during migration.
        identifierCaseOptions: Semantic.identifierCaseOptions as any,
        LogicalOperatorsStyle
    });
}

export function createDefaultGmlPluginComponentDependencies(
    implementations: GmlPluginComponentContract
): GmlPluginComponentContract {
    return selectPluginComponentContractEntries(implementations);
}

const gmlPluginComponentImplementations = Object.freeze(
    createDefaultGmlPluginComponentImplementations({
        gmlParserAdapter,
        print,
        handleComments,
        printComment
    })
);

const gmlPluginComponentDependencies = Object.freeze(
    createDefaultGmlPluginComponentDependencies(gmlPluginComponentImplementations)
);

function resolveGmlPluginComponentImplementations(): GmlPluginComponentContract {
    return gmlPluginComponentImplementations;
}

function resolveGmlPluginComponentDependencies(): GmlPluginComponentContract {
    return gmlPluginComponentDependencies;
}

export {
    gmlPluginComponentImplementations,
    resolveGmlPluginComponentImplementations,
    gmlPluginComponentDependencies,
    resolveGmlPluginComponentDependencies
};

export const defaultGmlPluginComponentImplementations = gmlPluginComponentImplementations;
export const defaultGmlPluginComponentDependencies = gmlPluginComponentDependencies;
