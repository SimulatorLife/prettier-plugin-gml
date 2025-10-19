import { buildProjectIndex } from "../../project-index/index.js";
import { prepareIdentifierCasePlan } from "../../identifier-case/local-plan.js";

export function createDefaultCliPluginServiceImplementations() {
    return {
        buildProjectIndex,
        prepareIdentifierCasePlan
    };
}
