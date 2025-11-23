import * as Core from "@gml-modules/core";

import type { GmlPluginComponentContract } from "./plugin-types.js";

type ComponentDescriptor = Readonly<{
    name: keyof GmlPluginComponentContract;
    category: "object" | "function";
}>;

const REQUIRED_COMPONENT_DESCRIPTORS: ReadonlyArray<ComponentDescriptor> =
    Object.freeze([
        { name: "gmlParserAdapter", category: "object" },
        { name: "handleComments", category: "object" },
        { name: "identifierCaseOptions", category: "object" },
        { name: "LogicalOperatorsStyle", category: "object" },
        { name: "print", category: "function" },
        { name: "printComment", category: "function" }
    ]);

const REQUIRED_COMPONENT_NAMES = Object.freeze(
    REQUIRED_COMPONENT_DESCRIPTORS.map(({ name }) => name)
);

const REQUIRED_OBJECT_COMPONENTS = Object.freeze(
    REQUIRED_COMPONENT_DESCRIPTORS.filter(
        ({ category }) => category === "object"
    )
);

const REQUIRED_FUNCTION_COMPONENTS = Object.freeze(
    REQUIRED_COMPONENT_DESCRIPTORS.filter(
        ({ category }) => category === "function"
    )
);

function createMissingComponentMessage(context: string, name: string): string {
    return `GML plugin component ${context} must include ${name}.`;
}

function assertHasComponent(
    components: Readonly<Record<string, unknown>>,
    name: string,
    context: string
): void {
    if (!Core.hasOwn(components, name)) {
        throw new TypeError(createMissingComponentMessage(context, name));
    }
}

export function selectPluginComponentContractEntries(
    source: GmlPluginComponentContract
): GmlPluginComponentContract {
    return Object.freeze({
        gmlParserAdapter: source.gmlParserAdapter,
        print: source.print,
        handleComments: source.handleComments,
        printComment: source.printComment,
        identifierCaseOptions: source.identifierCaseOptions,
        LogicalOperatorsStyle: source.LogicalOperatorsStyle
    });
}

export function createPluginComponentContractNormalizer(context?: string) {
    const normalizedContext = String(context ?? "components");
    const contextErrorPrefix = `GML plugin component ${normalizedContext}`;

    return function normalizePluginComponentContract(
        candidate: unknown
    ): GmlPluginComponentContract {
        const components = Core.assertPlainObject(candidate, {
            errorMessage: `${contextErrorPrefix} must resolve to an object.`
        }) as Record<string, unknown>;

        for (const componentName of REQUIRED_COMPONENT_NAMES) {
            assertHasComponent(components, componentName, normalizedContext);
        }

        for (const { name } of REQUIRED_OBJECT_COMPONENTS) {
            Core.assertPlainObject(components[name], {
                name,
                errorMessage: createMissingComponentMessage(
                    normalizedContext,
                    name
                )
            });
        }

        for (const { name } of REQUIRED_FUNCTION_COMPONENTS) {
            Core.assertFunction(components[name], name, {
                errorMessage: createMissingComponentMessage(
                    normalizedContext,
                    name
                )
            });
        }

        return selectPluginComponentContractEntries(
            components as GmlPluginComponentContract
        );
    };
}
