import { Core } from "@gml-modules/core";

export const PROJECT_ROOT_DISCOVERY_ABORT_MESSAGE =
    "Project root discovery was aborted.";
export const PROJECT_INDEX_BUILD_ABORT_MESSAGE =
    "Project index build was aborted.";

type ProjectIndexAbortGuardConfig = {
    key?: string | number | symbol;
    message?: string | null;
    fallbackMessage?: string | null;
};

type CoreAbortGuard = ReturnType<typeof Core.createAbortGuard>;

export type ProjectIndexAbortGuard = {
    signal: CoreAbortGuard["signal"];
    ensureNotAborted(this: void): void;
};

export function createProjectIndexAbortGuard(
    options: unknown,
    config: ProjectIndexAbortGuardConfig = {}
): ProjectIndexAbortGuard {
    const { message, fallbackMessage, key } = config;
    const resolvedFallback =
        fallbackMessage ?? message ?? PROJECT_INDEX_BUILD_ABORT_MESSAGE;

    const keyOption = key === undefined || key === null ? {} : { key };

    return Core.createAbortGuard(options, {
        fallbackMessage: resolvedFallback,
        ...keyOption
    });
}
