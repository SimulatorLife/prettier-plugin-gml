export type KnownCommanderParseSource = "user" | "node" | "electron";

export interface CommanderParseOptions {
    from?: KnownCommanderParseSource;
}

export interface CommanderConfigureOutputOptions {
    writeOut?: (...args: Array<unknown>) => unknown;
    writeErr?: (...args: Array<unknown>) => unknown;
    outputError?: (...args: Array<unknown>) => unknown;
}

export interface CommanderUsageProvider {
    helpInformation?: () => string;
    usage?: () => string;
    getUsage?: () => string;
}

export type CommanderHookListener = (...args: Array<unknown>) => unknown;

export interface CommanderLifecycle {
    hook?: (event: string, listener: CommanderHookListener) => unknown;
}

export interface CommanderAddCommandOptions {
    isDefault?: boolean;
}

export type CommanderActionHandler = (...args: Array<unknown>) => unknown;

export interface CommanderCommandHost
    extends CommanderUsageProvider,
        CommanderLifecycle {
    addCommand?: (
        command: CommanderCommandHost,
        options?: CommanderAddCommandOptions
    ) => unknown;
    action?: (handler: CommanderActionHandler) => unknown;
}

export interface CommanderProgramLike extends CommanderCommandHost {
    parse?: (argv?: Array<string>, options?: CommanderParseOptions) => unknown;
    parseAsync?: (
        argv?: Array<string>,
        options?: CommanderParseOptions
    ) => Promise<unknown>;
    args?: Array<string>;
    processedArgs?: Array<string>;
    opts?: () => Record<string, unknown>;
}

export interface CommanderCommandLike extends CommanderProgramLike {
    exitOverride?: (...args: Array<unknown>) => unknown;
    allowExcessArguments?: (allow?: boolean) => unknown;
    helpOption?: (flags?: string, description?: string) => unknown;
    showHelpAfterError?: (message?: string | boolean) => unknown;
    configureOutput?: (options: CommanderConfigureOutputOptions) => unknown;
    setOptionValueWithSource?: (
        optionName: string,
        value: unknown,
        source?: string
    ) => unknown;
}
