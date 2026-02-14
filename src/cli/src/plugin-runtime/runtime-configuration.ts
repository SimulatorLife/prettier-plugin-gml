import { Core } from "@gml-modules/core";
import { Semantic } from "@gml-modules/semantic";

import { importPluginModule } from "./entry-point.js";

type IdentifierCaseRuntimeModule = {
    setIdentifierCaseRuntime?: (runtime: unknown) => void;
};

/**
 * Configure only identifier-case runtime integration for formatter execution.
 *
 * Formatter no longer accepts semantic/refactor runtime adapters; lint owns
 * semantic and project-aware rewrites.
 */
export async function configurePluginRuntimeAdapters(projectRoot: string): Promise<void> {
    if (!Core.isNonEmptyString(projectRoot)) {
        return;
    }

    const pluginModule = (await importPluginModule()) as IdentifierCaseRuntimeModule;
    if (!pluginModule || typeof pluginModule !== "object") {
        return;
    }

    pluginModule.setIdentifierCaseRuntime?.({
        createScopeTracker: () => new Semantic.SemanticScopeCoordinator(),
        prepareIdentifierCaseEnvironment: Semantic.prepareIdentifierCaseEnvironment,
        teardownIdentifierCaseEnvironment: Semantic.teardownIdentifierCaseEnvironment,
        attachIdentifierCasePlanSnapshot: Semantic.attachIdentifierCasePlanSnapshot
    });
}
