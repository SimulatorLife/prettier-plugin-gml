import { Core } from "@gml-modules/core";
const {
    Utils: { createAbortGuard }
} = Core;

export const PROJECT_ROOT_DISCOVERY_ABORT_MESSAGE =
    "Project root discovery was aborted.";
export const PROJECT_INDEX_BUILD_ABORT_MESSAGE =
    "Project index build was aborted.";

export function createProjectIndexAbortGuard(
    options,
    { message, fallbackMessage, key } = {}
) {
    const resolvedFallback =
        fallbackMessage ?? message ?? PROJECT_INDEX_BUILD_ABORT_MESSAGE;

    const keyOption = key === undefined || key === null ? {} : { key };

    return createAbortGuard(options, {
        fallbackMessage: resolvedFallback,
        ...keyOption
    });
}
