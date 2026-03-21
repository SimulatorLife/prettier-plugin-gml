/**
 * Tests for the refactor command.
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { createRefactorCommand } from "../src/commands/refactor.js";

void describe("Refactor command", () => {
    void it("should create refactor command with correct name", () => {
        const command = createRefactorCommand();
        assert.equal(command.name(), "refactor");
    });

    void it("should have required options", () => {
        const command = createRefactorCommand();
        const options = command.options;

        const symbolIdOption = options.find((opt) => opt.long === "--symbol-id");
        const oldNameOption = options.find((opt) => opt.long === "--old-name");
        const newNameOption = options.find((opt) => opt.long === "--new-name");
        const projectRootOption = options.find((opt) => opt.long === "--project-root");
        const configOption = options.find((opt) => opt.long === "--config");
        const dryRunOption = options.find((opt) => opt.long === "--dry-run");
        const writeOption = options.find((opt) => opt.long === "--write");
        const onlyOption = options.find((opt) => opt.long === "--only");
        const listOption = options.find((opt) => opt.long === "--list");
        const verboseOption = options.find((opt) => opt.long === "--verbose");
        const checkHotReloadOption = options.find((opt) => opt.long === "--check-hot-reload");

        assert.ok(symbolIdOption, "Should have --symbol-id option");
        assert.ok(oldNameOption, "Should have --old-name option");
        assert.ok(newNameOption, "Should have --new-name option");
        assert.ok(projectRootOption, "Should have --project-root option");
        assert.ok(configOption, "Should have --config option");
        assert.ok(dryRunOption, "Should have --dry-run option");
        assert.ok(writeOption, "Should have --write option");
        assert.ok(onlyOption, "Should have --only option");
        assert.ok(listOption, "Should have --list option");
        assert.ok(verboseOption, "Should have --verbose option");
        assert.ok(checkHotReloadOption, "Should have --check-hot-reload option");
    });

    void it("should have correct default values", () => {
        const command = createRefactorCommand();
        const options = command.options;

        const projectRootOption = options.find((opt) => opt.long === "--project-root");
        const dryRunOption = options.find((opt) => opt.long === "--dry-run");
        const writeOption = options.find((opt) => opt.long === "--write");
        const listOption = options.find((opt) => opt.long === "--list");
        const verboseOption = options.find((opt) => opt.long === "--verbose");
        const checkHotReloadOption = options.find((opt) => opt.long === "--check-hot-reload");

        assert.equal(projectRootOption.defaultValue, undefined);
        assert.equal(dryRunOption.defaultValue, false);
        assert.equal(writeOption.defaultValue, false);
        assert.equal(listOption.defaultValue, false);
        assert.equal(verboseOption.defaultValue, false);
        assert.equal(checkHotReloadOption.defaultValue, false);
    });

    void it("should have correct description", () => {
        const command = createRefactorCommand();
        assert.equal(command.description(), "Perform safe, project-wide code transformations");
    });

    void it("should expose codemod operation arguments", () => {
        const command = createRefactorCommand();
        assert.equal(command.registeredArguments.length, 2);
        assert.equal(command.registeredArguments[0]?.required, false);
        assert.equal(command.registeredArguments[1]?.variadic, true);
    });
});
