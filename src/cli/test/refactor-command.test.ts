/**
 * Tests for the refactor command.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
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
        const dryRunOption = options.find((opt) => opt.long === "--dry-run");
        const verboseOption = options.find((opt) => opt.long === "--verbose");
        const checkHotReloadOption = options.find((opt) => opt.long === "--check-hot-reload");

        assert.ok(symbolIdOption, "Should have --symbol-id option");
        assert.ok(oldNameOption, "Should have --old-name option");
        assert.ok(newNameOption, "Should have --new-name option");
        assert.ok(projectRootOption, "Should have --project-root option");
        assert.ok(dryRunOption, "Should have --dry-run option");
        assert.ok(verboseOption, "Should have --verbose option");
        assert.ok(checkHotReloadOption, "Should have --check-hot-reload option");

        // Verify --new-name is mandatory
        assert.equal(newNameOption.mandatory, true, "--new-name should be mandatory");
    });

    void it("should have correct default values", () => {
        const command = createRefactorCommand();
        const options = command.options;

        const projectRootOption = options.find((opt) => opt.long === "--project-root");
        const dryRunOption = options.find((opt) => opt.long === "--dry-run");
        const verboseOption = options.find((opt) => opt.long === "--verbose");
        const checkHotReloadOption = options.find((opt) => opt.long === "--check-hot-reload");

        assert.equal(projectRootOption.defaultValue, process.cwd());
        assert.equal(dryRunOption.defaultValue, false);
        assert.equal(verboseOption.defaultValue, false);
        assert.equal(checkHotReloadOption.defaultValue, false);
    });

    void it("should have correct description", () => {
        const command = createRefactorCommand();
        assert.equal(command.description(), "Perform safe, project-wide code transformations");
    });
});
