import { MANUAL_REPO_ENV_VAR, resolveManualRepoValue } from "./manual-utils.js";
import {
    PROGRESS_BAR_WIDTH_ENV_VAR as PROGRESS_BAR_WIDTH_ENV_VAR_INTERNAL,
    resolveProgressBarWidth
} from "./progress-bar.js";
import { applyEnvOptionOverrides } from "./env-overrides.js";

export const MANUAL_REF_ENV_VAR = "GML_MANUAL_REF";
export const IDENTIFIER_VM_TIMEOUT_ENV_VAR = "GML_IDENTIFIER_VM_TIMEOUT_MS";
export const PROGRESS_BAR_WIDTH_ENV_VAR = PROGRESS_BAR_WIDTH_ENV_VAR_INTERNAL;

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
                return resolveManualRepoValue(value, { source: "env" });
            }
        },
        {
            envVar: PROGRESS_BAR_WIDTH_ENV_VAR,
            optionName: "progressBarWidth",
            resolveValue: resolveProgressBarWidth
        },
        ...normalizedAdditional
    ];

    const getUsage =
        command && typeof command.helpInformation === "function"
            ? () => command.helpInformation()
            : undefined;

    applyEnvOptionOverrides({
        command,
        env,
        overrides,
        getUsage
    });
}
