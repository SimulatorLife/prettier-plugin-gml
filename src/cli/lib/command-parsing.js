import { CliUsageError } from "./cli-errors.js";
import { isErrorLike } from "../../shared/utils/capability-probes.js";

function isCommanderError(error) {
    return (
        isErrorLike(error) &&
        error.name === "CommanderError" &&
        typeof error.code === "string"
    );
}

export {
    coercePositiveInteger,
    coerceNonNegativeInteger,
    resolveIntegerOption
} from "../../shared/numeric-option-utils.js";

/**
 * Parse CLI arguments for a Commander.js command while normalizing help and
 * usage errors.
 *
 * @param {import("commander").Command} command
 * @param {Array<string>} args
 * @returns {{ helpRequested: boolean, usage: string }}
 */
export function parseCommandLine(command, args) {
    try {
        command.parse(args, { from: "user" });
        return {
            helpRequested: false,
            usage: command.helpInformation()
        };
    } catch (error) {
        if (error?.code === "commander.helpDisplayed") {
            return {
                helpRequested: true,
                usage: command.helpInformation()
            };
        }

        if (isCommanderError(error)) {
            throw new CliUsageError(error.message.trim(), {
                usage: command.helpInformation()
            });
        }

        throw error;
    }
}
