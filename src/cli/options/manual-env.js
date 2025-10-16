import { applyEnvOptionOverrides } from "./env-overrides.js";
import { MANUAL_REPO_ENV_VAR, resolveManualRepoValue } from "./manual-repo.js";
import { resolveProgressBarWidth } from "./progress-bar.js";

export const MANUAL_REF_ENV_VAR = "GML_MANUAL_REF";
export const PROGRESS_BAR_WIDTH_ENV_VAR = "GML_PROGRESS_BAR_WIDTH";

const BASE_MANUAL_ENV_OVERRIDES = [
    { envVar: MANUAL_REF_ENV_VAR, optionName: "ref" },
    {
        envVar: MANUAL_REPO_ENV_VAR,
        optionName: "manualRepo",
        resolveValue: (value) =>
            resolveManualRepoValue(value, { source: "env" })
    },
    {
        envVar: PROGRESS_BAR_WIDTH_ENV_VAR,
        optionName: "progressBarWidth",
        resolveValue: resolveProgressBarWidth
    }
];

export function applyManualEnvOptionOverrides({
    command,
    env,
    getUsage,
    additionalOverrides = []
}) {
    const mergedOverrides = [
        ...BASE_MANUAL_ENV_OVERRIDES,
        ...additionalOverrides.filter(
            (override) => override && typeof override === "object"
        )
    ];

    applyEnvOptionOverrides({
        command,
        env,
        getUsage,
        overrides: mergedOverrides
    });
}
