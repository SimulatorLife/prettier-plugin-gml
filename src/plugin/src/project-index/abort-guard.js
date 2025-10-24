import { createAbortGuard } from "../../../shared/abort-utils.js";

export const PROJECT_ROOT_DISCOVERY_ABORT_MESSAGE =
    "Project root discovery was aborted.";
export const PROJECT_INDEX_BUILD_ABORT_MESSAGE =
    "Project index build was aborted.";

export function createProjectIndexAbortGuard(options, config = {}) {
    const { message, fallbackMessage, key } = config ?? {};
    const guardOptions = {};

    if (key != null) {
        guardOptions.key = key;
    }

    guardOptions.fallbackMessage =
        fallbackMessage ?? message ?? PROJECT_INDEX_BUILD_ABORT_MESSAGE;

    return createAbortGuard(options, guardOptions);
}
