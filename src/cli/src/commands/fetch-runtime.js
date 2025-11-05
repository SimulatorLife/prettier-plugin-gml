import { Command, Option } from "commander";

import { ensureRuntimeArchiveHydrated } from "../modules/runtime/archive.js";
import { createRuntimeCommandContextOptions } from "../modules/runtime/config.js";

const RUNTIME_CONTEXT_OPTIONS = createRuntimeCommandContextOptions({
    importMetaUrl: import.meta.url,
    userAgent: "prettier-plugin-gml runtime fetch"
});

export function createFetchRuntimeCommand() {
    const command = new Command("runtime-fetch")
        .description(
            "Download and extract the HTML5 runtime into the local cache"
        )
        .addOption(
            new Option(
                "--runtime-ref <ref>",
                "Git reference (branch, tag, or commit) for the HTML5 runtime"
            )
        )
        .addOption(
            new Option(
                "--runtime-repo <owner/name>",
                "Repository hosting the HTML5 runtime"
            )
        )
        .addOption(
            new Option(
                "--runtime-cache <path>",
                "Override the runtime cache directory"
            )
        )
        .addOption(
            new Option(
                "--force-runtime-refresh",
                "Force re-download of the runtime archive"
            ).default(false)
        )
        .addOption(
            new Option("--verbose", "Enable verbose logging").default(false)
        );

    return command;
}

export async function runFetchRuntimeCommand(options = {}) {
    const {
        runtimeRef,
        runtimeRepo,
        runtimeCache,
        forceRuntimeRefresh = false,
        verbose = false,
        runtimeHydrator = ensureRuntimeArchiveHydrated,
        logger = console.log
    } = options;

    const hydration = await runtimeHydrator({
        runtimeRef,
        runtimeRepo,
        cacheRoot: runtimeCache,
        userAgent: RUNTIME_CONTEXT_OPTIONS.userAgent,
        forceRefresh: forceRuntimeRefresh,
        verbose: verbose ? { all: true } : undefined,
        contextOptions: RUNTIME_CONTEXT_OPTIONS
    });

    if (logger) {
        const resolvedLabel = hydration.runtimeRef?.ref
            ? `${hydration.runtimeRef.ref} (${hydration.runtimeRef.sha})`
            : (hydration.runtimeRef?.sha ?? runtimeRef ?? "<unknown ref>");
        logger(`HTML5 runtime repository: ${hydration.runtimeRepo}`);
        logger(`Resolved runtime reference: ${resolvedLabel}`);
        logger(`Runtime assets available at: ${hydration.runtimeRoot}`);
        if (hydration.manifestPath) {
            logger(`Runtime manifest recorded at: ${hydration.manifestPath}`);
        }
        logger(
            hydration.downloaded
                ? "Runtime archive downloaded."
                : "Runtime archive reused from cache."
        );
        logger(
            hydration.extracted
                ? "Runtime files extracted."
                : "Runtime files already extracted."
        );
    }

    return hydration;
}

export const __test__ = Object.freeze({
    RUNTIME_CONTEXT_OPTIONS
});
