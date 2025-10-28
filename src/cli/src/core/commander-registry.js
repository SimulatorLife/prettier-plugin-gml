import { Command, InvalidArgumentError, Option } from "commander";

export function getCommanderCommandConstructor() {
    return Command;
}

export function getCommanderOptionConstructor() {
    return Option;
}

export function getCommanderInvalidArgumentErrorConstructor() {
    return InvalidArgumentError;
}

export function createCommanderCommand(...args) {
    return new Command(...args);
}

export function createCommanderOption(...args) {
    return new Option(...args);
}

export function createCommanderInvalidArgumentError(message) {
    return new InvalidArgumentError(message);
}
