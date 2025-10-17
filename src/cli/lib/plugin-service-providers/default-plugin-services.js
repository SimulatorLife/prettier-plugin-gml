import { buildProjectIndex } from "../../../plugin/src/project-index/index.js";
import { prepareIdentifierCasePlan } from "../../../plugin/src/identifier-case/local-plan.js";

export function createDefaultCliPluginServices() {
    return {
        buildProjectIndex,
        prepareIdentifierCasePlan
    };
}
