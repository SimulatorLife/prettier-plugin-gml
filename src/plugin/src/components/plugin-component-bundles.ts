import { Semantic } from "@gml-modules/semantic";
import { LogicalOperatorsStyle } from "../options/logical-operators-style.js";
import type { GmlPluginComponentContract } from "./plugin-types.js";
import { selectPluginComponentContractEntries } from "./plugin-component-contract.js";

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

/**
 * Resolves the default concrete implementations by importing them.
 * This function is the single point where concrete adapter modules are loaded,
 * keeping the dependency boundary explicit. Higher-level orchestration code receives
 * these through the factory function rather than importing them directly.
 */
async function resolveDefaultConcreteDependencies(): Promise<GmlPluginComponentDependencies> {
    const parsersModule = await import("../parsers/index.js");
    const printerModule = await import("../printer/index.js");
    const commentsModule = await import("../comments/index.js");

    return {
        gmlParserAdapter: parsersModule.gmlParserAdapter,
        print: printerModule.print,
        handleComments: commentsModule.handleComments,
        printComment: commentsModule.printComment
    };
}

// Initialize with concrete dependencies loaded at module initialization.
// The abstraction boundary is maintained through the factory pattern - consumers
// call createDefaultGmlPluginComponentImplementations with dependencies rather than
// importing concrete adapters directly.
const concreteDependencies = await resolveDefaultConcreteDependencies();

const gmlPluginComponentImplementations = Object.freeze(
    createDefaultGmlPluginComponentImplementations(concreteDependencies)
);

const gmlPluginComponentDependencies = Object.freeze(
    createDefaultGmlPluginComponentDependencies(
        gmlPluginComponentImplementations
    )
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

export const defaultGmlPluginComponentImplementations =
    gmlPluginComponentImplementations;
export const defaultGmlPluginComponentDependencies =
    gmlPluginComponentDependencies;
