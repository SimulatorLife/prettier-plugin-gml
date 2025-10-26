import {
    MANUAL_REPO_ENV_VAR,
    MANUAL_REPO_REQUIREMENT_SOURCE,
    resolveManualRepoValue
} from "./utils.js";
import {
    PROGRESS_BAR_WIDTH_ENV_VAR,
    resolveProgressBarWidth,
    applyEnvOptionOverrides
} from "../support/command-dependencies.js";
import { resolveCommandUsage } from "../../shared/dependencies.js";

export const MANUAL_REF_ENV_VAR = "GML_MANUAL_REF";
export const IDENTIFIER_VM_TIMEOUT_ENV_VAR = "GML_IDENTIFIER_VM_TIMEOUT_MS";

export function applyManualEnvOptionOverrides({
    command,
    env,
    additionalOverrides
} = {}) {
    const normalizedAdditional = Array.isArray(additionalOverrides)
        ? additionalOverrides.filter(Boolean)
        : [];

    const overrides = [
        {
            envVar: MANUAL_REF_ENV_VAR,
            optionName: "ref"
        },
        {
            envVar: MANUAL_REPO_ENV_VAR,
            optionName: "manualRepo",
            resolveValue(value) {
                return resolveManualRepoValue(value, {
                    source: MANUAL_REPO_REQUIREMENT_SOURCE.ENV
                });
            }
        },
        {
            envVar: PROGRESS_BAR_WIDTH_ENV_VAR,
            optionName: "progressBarWidth",
            resolveValue: resolveProgressBarWidth
        },
        ...normalizedAdditional
    ];

    const usage = resolveCommandUsage(command);

    applyEnvOptionOverrides({
        command,
        env,
        overrides,
        getUsage: usage
    });
}

export { PROGRESS_BAR_WIDTH_ENV_VAR } from "../support/command-dependencies.js";
