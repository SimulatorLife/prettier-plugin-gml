import { bootstrapProjectIndex } from "../project-index/bootstrap.js";
import {
    prepareIdentifierCasePlan,
    captureIdentifierCasePlanSnapshot
} from "./local-plan.js";

export async function prepareIdentifierCaseEnvironment(options) {
    if (!options || typeof options !== "object") {
        return;
    }

    await bootstrapProjectIndex(options);
    await prepareIdentifierCasePlan(options);
}

export function attachIdentifierCasePlanSnapshot(ast, options) {
    if (!ast || typeof ast !== "object") {
        return;
    }

    const snapshot = captureIdentifierCasePlanSnapshot(options);
    if (!snapshot) {
        return;
    }

    Object.defineProperty(ast, "__identifierCasePlanSnapshot", {
        value: snapshot,
        enumerable: false,
        configurable: true
    });
}
