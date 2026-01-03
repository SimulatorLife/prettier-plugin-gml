import process from "node:process";

import { Command, Option } from "commander";

import { Core } from "@gml-modules/core";
import type { CommanderCommandLike } from "../cli-core/commander-types.js";
import { applyStandardCommandOptions } from "../cli-core/command-standard-options.js";
import { formatCliError } from "../cli-core/errors.js";
import {
    prepareHotReloadInjection,
    DEFAULT_GM_TEMP_ROOT,
    DEFAULT_WEBSOCKET_URL
} from "../modules/hot-reload/inject-runtime.js";

const { getErrorMessage } = Core;

interface PrepareHotReloadCommandOptions {
    html5Output?: string;
    gmTempRoot?: string;
    websocketUrl?: string;
    force?: boolean;
    quiet?: boolean;
}

/**
 * Create the command that injects hot-reload assets into the GameMaker HTML5 output.
 */
export function createPrepareHotReloadCommand(): Command {
    return applyStandardCommandOptions(
        new Command()
            .name("prepare-hot-reload")
            .description("Inject the hot-reload runtime wrapper into the latest GameMaker HTML5 output.")
            .addOption(
                new Option("--html5-output <path>", "Path to the HTML5 output directory (overrides auto-detection).")
            )
            .addOption(
                new Option("--gm-temp-root <path>", "Root directory for GameMaker HTML5 temporary outputs.").default(
                    DEFAULT_GM_TEMP_ROOT
                )
            )
            .addOption(
                new Option("--websocket-url <url>", "WebSocket URL to receive hot-reload patches.").default(
                    DEFAULT_WEBSOCKET_URL
                )
            )
            .addOption(new Option("--force", "Re-inject even if the hot-reload snippet already exists.").default(false))
            .addOption(new Option("--quiet", "Suppress informational output.").default(false))
    );
}

/**
 * Run the hot-reload injection workflow for the given command.
 */
export async function runPrepareHotReloadCommand(command: CommanderCommandLike): Promise<void> {
    const options: PrepareHotReloadCommandOptions = command.opts();
    const quiet = Boolean(options.quiet);

    try {
        const result = await prepareHotReloadInjection({
            html5OutputRoot: options.html5Output,
            gmTempRoot: options.gmTempRoot,
            websocketUrl: options.websocketUrl,
            force: options.force
        });

        if (!quiet) {
            const injectedMessage = result.injected
                ? "Injected hot-reload snippet."
                : "Hot-reload snippet already present.";
            console.log(injectedMessage);
            console.log(`HTML5 output: ${result.outputRoot}`);
            console.log(`Index file: ${result.indexPath}`);
            console.log(`Runtime wrapper copied to: ${result.runtimeWrapperTargetRoot}`);
            console.log(`WebSocket URL: ${result.websocketUrl}`);
        }
    } catch (error) {
        const message = getErrorMessage(error, {
            fallback: "Failed to prepare hot-reload injection."
        });
        const formatted = formatCliError(new Error(message));
        console.error(formatted);
        process.exit(1);
    }
}
