import {
    assertFunctionProperties,
    describeValueWithArticle,
    isObjectOrFunction
} from "../dependencies.js";

function hasFunction(value, property) {
    return typeof value?.[property] === "function";
}

function normalizeUsageResult(output) {
    if (output == null) {
        return null;
    }

    return typeof output === "string" ? output : String(output);
}

function createUsageReader(target) {
    if (!isObjectOrFunction(target)) {
        return null;
    }

    if (hasFunction(target, "helpInformation")) {
        return () => target.helpInformation();
    }

    if (hasFunction(target, "usage")) {
        return () => target.usage();
    }

    if (hasFunction(target, "getUsage")) {
        return () => target.getUsage();
    }

    return null;
}

function createProgramParseDelegate(program) {
    if (hasFunction(program, "parseAsync")) {
        return (argv, options) => program.parseAsync(argv, options);
    }

    if (hasFunction(program, "parse")) {
        return (argv, options) => Promise.resolve(program.parse(argv, options));
    }

    return null;
}

function describeProgramForError(program) {
    return describeValueWithArticle(program, {
        objectLabel: "a commander-compatible program"
    });
}

export function createCommanderProgramContract(program) {
    const normalizedProgram = assertFunctionProperties(program, [
        "addCommand",
        "hook"
    ], {
        name: "Commander program"
    });

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
            normalizedProgram.addCommand(command, options),
        hook: (event, listener) => normalizedProgram.hook(event, listener),
        getUsage() {
            return normalizeUsageResult(usageReader?.());
        }
    };
}

export function createCommanderCommandContract(
    command,
    { name = "Commander command", requireAction = true } = {}
) {
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

            return normalizedCommand.action(handler);
        },
        getUsage() {
            return normalizeUsageResult(usageReader?.());
        }
    };
}

export function tryCreateCommanderCommandContract(command, options) {
    try {
        return createCommanderCommandContract(command, options);
    } catch {
        return null;
    }
}

export function isCommanderCommandLike(value) {
    if (!isObjectOrFunction(value)) {
        return false;
    }

    return createUsageReader(value) !== null;
}

export function getCommanderUsage(command) {
    return normalizeUsageResult(createUsageReader(command)?.());
}
