import { Semantic } from "@gml-modules/semantic";

import { handleComments, printComment } from "../comments/public-api.js";
import { LogicalOperatorsStyle } from "../options/logical-operators-style.js";
import { gmlParserAdapter } from "../parsers/index.js";
import { print } from "../printer/index.js";
import type { GmlPluginComponentContract } from "./plugin-types.js";
import { createSingletonComponentRegistry } from "./component-registry.js";
import { selectPluginComponentContractEntries } from "./plugin-component-contract.js";

/**
 * Builds the canonical component implementation bundle. Keeping the constructor
 * factored into a function makes it easy to produce isolated copies for tests
 * while the runtime reuses the shared frozen snapshot below.
 */
export function createDefaultGmlPluginComponentImplementations(): GmlPluginComponentContract {
    return Object.freeze({
        gmlParserAdapter,
        print,
        handleComments,
        printComment,
        // Semantic provides identifier case option definitions; cast to satisfy
        // Prettier's SupportOptions type during migration.
        identifierCaseOptions: Semantic.identifierCaseOptions as any,
        LogicalOperatorsStyle
    });
}

export function createDefaultGmlPluginComponentDependencies(
    implementations = createDefaultGmlPluginComponentImplementations()
): GmlPluginComponentContract {
    return selectPluginComponentContractEntries(implementations);
}

const implementationRegistry =
    createSingletonComponentRegistry<GmlPluginComponentContract>({
        description: "implementation bundle",
        factory: createDefaultGmlPluginComponentImplementations
    });

const dependencyRegistry =
    createSingletonComponentRegistry<GmlPluginComponentContract>({
        description: "dependency bundle",
        factory: () =>
            createDefaultGmlPluginComponentDependencies(
                implementationRegistry.bundle
            )
    });

export const gmlPluginComponentImplementations = implementationRegistry.bundle;
export const resolveGmlPluginComponentImplementations =
    implementationRegistry.resolve;

export const gmlPluginComponentDependencies = dependencyRegistry.bundle;
export const resolveGmlPluginComponentDependencies = dependencyRegistry.resolve;

export const defaultGmlPluginComponentImplementations =
    gmlPluginComponentImplementations;
export const defaultGmlPluginComponentDependencies =
    gmlPluginComponentDependencies;
