import { assertFunction } from "@prettier-plugin-gml/shared";
import { Command, InvalidArgumentError, Option } from "commander";

const DEFAULT_COMMANDER_API = Object.freeze({
    Command,
    InvalidArgumentError,
    Option
});

let activeCommanderApi = DEFAULT_COMMANDER_API;

function assertCommanderConstructor(value, description) {
    assertFunction(value, description, {
        errorMessage: `Commander helpers must provide a ${description} function.`
    });
}

function normalizeCommanderApi(overrides) {
    if (overrides == null) {
        return DEFAULT_COMMANDER_API;
    }

    if (typeof overrides !== "object") {
        throw new TypeError(
            "Commander helper overrides must be provided as an object."
        );
    }

    const normalized = {
        Command: overrides.Command ?? DEFAULT_COMMANDER_API.Command,
        InvalidArgumentError:
            overrides.InvalidArgumentError ??
            DEFAULT_COMMANDER_API.InvalidArgumentError,
        Option: overrides.Option ?? DEFAULT_COMMANDER_API.Option
    };

    assertCommanderConstructor(normalized.Command, "Command constructor");
    assertCommanderConstructor(
        normalized.InvalidArgumentError,
        "InvalidArgumentError constructor"
    );
    assertCommanderConstructor(normalized.Option, "Option constructor");

    return Object.freeze(normalized);
}

export function resolveCommanderApi() {
    return activeCommanderApi;
}

export function getCommanderCommandConstructor() {
    return activeCommanderApi.Command;
}

export function getCommanderOptionConstructor() {
    return activeCommanderApi.Option;
}

export function getCommanderInvalidArgumentErrorConstructor() {
    return activeCommanderApi.InvalidArgumentError;
}

export function createCommanderCommand(...args) {
    const CommandConstructor = getCommanderCommandConstructor();
    return new CommandConstructor(...args);
}

export function createCommanderOption(...args) {
    const OptionConstructor = getCommanderOptionConstructor();
    return new OptionConstructor(...args);
}

export function createCommanderInvalidArgumentError(message) {
    const ErrorConstructor = getCommanderInvalidArgumentErrorConstructor();
    return new ErrorConstructor(message);
}

export function setCommanderApi(overrides) {
    activeCommanderApi = normalizeCommanderApi(overrides);
    return activeCommanderApi;
}

export function resetCommanderApi() {
    activeCommanderApi = DEFAULT_COMMANDER_API;
    return activeCommanderApi;
}
