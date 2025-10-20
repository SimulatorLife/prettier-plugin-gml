import { buildProjectIndex } from "../../project-index/index.js";
import { prepareIdentifierCasePlan } from "../../identifier-case/plan-service.js";
import { clearIdentifierCaseOptionStore } from "../../identifier-case/option-store.js";
import { clearIdentifierCaseDryRunContexts } from "../../identifier-case/identifier-case-context.js";

function clearIdentifierCaseCaches() {
    clearIdentifierCaseOptionStore(null);
    clearIdentifierCaseDryRunContexts();
}

export function createDefaultCliPluginServiceImplementations() {
    return {
        buildProjectIndex,
        prepareIdentifierCasePlan,
        clearIdentifierCaseCaches
    };
}
