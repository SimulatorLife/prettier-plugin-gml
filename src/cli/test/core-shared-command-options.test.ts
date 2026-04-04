import assert from "node:assert/strict";
import { test } from "node:test";

import {
    APPLY_FIXES_OPTION_DESCRIPTION,
    APPLY_FIXES_OPTION_FLAGS,
    createApplyFixesOption,
    createProjectPathOption,
    PROJECT_PATH_OPTION_DESCRIPTION,
    PROJECT_PATH_OPTION_FLAGS
} from "../src/cli-core/shared-command-options.js";

void test("shared project option uses aligned name and description", () => {
    const option = createProjectPathOption();

    assert.equal(PROJECT_PATH_OPTION_FLAGS, "--project <path>");
    assert.equal(option.flags, PROJECT_PATH_OPTION_FLAGS);
    assert.equal(option.description, PROJECT_PATH_OPTION_DESCRIPTION);
});

void test("shared apply-fixes option uses aligned name and default", () => {
    const option = createApplyFixesOption();

    assert.equal(APPLY_FIXES_OPTION_FLAGS, "--fix");
    assert.equal(option.flags, APPLY_FIXES_OPTION_FLAGS);
    assert.equal(option.description, APPLY_FIXES_OPTION_DESCRIPTION);
    assert.equal(option.defaultValue, false);
});
