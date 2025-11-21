import {
    assertFunctionProperties,
    describeValueWithArticle,
    isObjectOrFunction
} from "../dependencies.js";
import type {
    CommanderCommandLike,
    CommanderParseOptions,
    CommanderProgramLike
} from "./commander-types.js";

type CommanderParse = (
    argv?: Array<string>,
    options?: CommanderParseOptions
) => Promise<unknown>;

type CommanderHookListener = Parameters<
    NonNullable<CommanderProgramLike["hook"]>
>[1];
type CommanderAddCommandOptions = Parameters<
    NonNullable<CommanderProgramLike["addCommand"]>
>[1];
type CommanderActionHandler = Parameters<
    NonNullable<CommanderCommandLike["action"]>
>[0];

interface CommanderCommandContractOptions {
    name?: string;
    requireAction?: boolean;
}

export interface CommanderProgramContract {
    raw: CommanderProgramLike;
    parse: CommanderParse;
    addCommand: (
        command: CommanderCommandLike,
        options?: CommanderAddCommandOptions
    ) => CommanderCommandLike | unknown;
    hook: (
        event: string,
        listener: CommanderHookListener
    ) => CommanderProgramLike | void;
    getUsage(): string | null;
}

export interface CommanderCommandContract {
    raw: CommanderCommandLike;
    action: (handler: CommanderActionHandler) => CommanderCommandLike | unknown;
    getUsage(): string | null;
}

function hasFunction<TValue, TKey extends PropertyKey>(
    value: TValue,
    property: TKey
): value is TValue & Record<TKey, (...args: Array<unknown>) => unknown> {
    return typeof (value as Record<TKey, unknown>)?.[property] === "function";
}

function normalizeUsageResult(output: unknown): string | null {
    if (output == null) {
        return null;
    }

    return typeof output === "string" ? output : String(output);
}

function createUsageReader(
    target: unknown
): (() => string | null | undefined) | null {
    if (!isObjectOrFunction(target)) {
        return null;
    }

    if (hasFunction(target, "helpInformation")) {
        const usageTarget = target as {
            helpInformation(): string;
        };
        return () => usageTarget.helpInformation();
    }

    if (hasFunction(target, "usage")) {
        const usageTarget = target as {
            usage(): string;
        };
        return () => usageTarget.usage();
    }

    if (hasFunction(target, "getUsage")) {
        const usageTarget = target as {
            getUsage(): string;
        };
        return () => usageTarget.getUsage();
    }

    return null;
}

function createProgramParseDelegate(
    program: CommanderProgramLike
): CommanderParse | null {
    if (typeof program.parseAsync === "function") {
        return (argv, options) =>
            program.parseAsync?.(argv, options) as Promise<unknown>;
    }

    if (typeof program.parse === "function") {
        return (argv, options) =>
            Promise.resolve(program.parse?.(argv, options));
    }

    return null;
}

function describeProgramForError(program: unknown): string {
    return describeValueWithArticle(program, {
        objectLabel: "a commander-compatible program"
    });
}

export function createCommanderProgramContract(
    program: CommanderProgramLike
): CommanderProgramContract {
    const normalizedProgram = assertFunctionProperties(
        program,
        ["addCommand", "hook"],
        {
            name: "Commander program"
        }
    );

    const parse = createProgramParseDelegate(normalizedProgram);
    if (!parse) {
        throw new TypeError(
            `Commander program must provide parseAsync() or parse(); received ${describeProgramForError(program)}.`
        );
    }

    const usageReader = createUsageReader(normalizedProgram);

    return {
        raw: normalizedProgram,
        parse,
        addCommand: (command, options) =>
            normalizedProgram.addCommand?.(command, options) ?? command,
        hook: (event, listener) =>
            normalizedProgram.hook?.(event, listener) ?? normalizedProgram,
        getUsage() {
            return normalizeUsageResult(usageReader?.());
        }
    };
}

export function createCommanderCommandContract(
    command: CommanderCommandLike,
    {
        name = "Commander command",
        requireAction = true
    }: CommanderCommandContractOptions = {}
): CommanderCommandContract {
    const methods = requireAction ? ["action"] : [];
    const normalizedCommand = assertFunctionProperties(command, methods, {
        name
    });

    const usageReader = createUsageReader(normalizedCommand);
    const hasAction = hasFunction(normalizedCommand, "action");

    return {
        raw: normalizedCommand,
        action(handler) {
            if (!hasAction) {
                throw new TypeError(`${name} does not expose action()`);
            }

            return (
                normalizedCommand.action?.(
                    handler as CommanderActionHandler
                ) ?? normalizedCommand
            );
        },
        getUsage() {
            return normalizeUsageResult(usageReader?.());
        }
    };
}

export function tryCreateCommanderCommandContract(
    command: CommanderCommandLike,
    options?: CommanderCommandContractOptions
): CommanderCommandContract | null {
    try {
        return createCommanderCommandContract(command, options);
    } catch {
        return null;
    }
}

export function isCommanderCommandLike(
    value: unknown
): value is CommanderCommandLike {
    if (!isObjectOrFunction(value)) {
        return false;
    }

    return createUsageReader(value) !== null;
}

export function getCommanderUsage(
    command: CommanderCommandLike
): string | null {
    return normalizeUsageResult(createUsageReader(command)?.());
}
