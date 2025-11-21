export interface CommanderParseOptions {
    from?: "user" | "node" | "electron" | string;
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

export interface CommanderLifecycle {
    hook?: (
        event: string,
        listener: (...args: Array<unknown>) => unknown
    ) => unknown;
}

export interface CommanderCommandHost
    extends CommanderUsageProvider,
        CommanderLifecycle {
    addCommand?: (
        command: CommanderCommandHost,
        options?: { isDefault?: boolean }
    ) => unknown;
    action?: (handler: (...args: Array<unknown>) => unknown) => unknown;
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
