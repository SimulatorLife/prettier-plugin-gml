import type { Command } from "commander";

import { getCommanderUsage } from "./commander-contract.js";

export interface ResolveCommandUsageOptions {
    fallback?: (() => string) | string | null;
}

export function resolveCommandUsage(
    command: Command | null | undefined,
    { fallback }: ResolveCommandUsageOptions = {}
): string | null | undefined {
    const usage = command ? getCommanderUsage(command) : null;
    if (usage !== null) {
        return usage;
    }

    if (typeof fallback === "function") {
        return fallback();
    }

    return fallback ?? undefined;
}
