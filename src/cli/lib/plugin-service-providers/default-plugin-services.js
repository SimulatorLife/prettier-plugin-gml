import { buildProjectIndex } from "../../../plugin/src/project-index/index.js";
import { prepareIdentifierCasePlan } from "../../../plugin/src/identifier-case/local-plan.js";

export function createDefaultProjectIndexBuilder() {
    return buildProjectIndex;
}

export function createDefaultIdentifierCasePlanPreparer() {
    return prepareIdentifierCasePlan;
}
