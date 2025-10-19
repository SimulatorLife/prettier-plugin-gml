import assert from "node:assert/strict";
import test from "node:test";

import { resolveCliVersion } from "../lib/cli-version.js";

test("resolveCliVersion prefers the PRETTIER_PLUGIN_GML_VERSION override", () => {
    const originalEnv = process.env.PRETTIER_PLUGIN_GML_VERSION;
    const originalNpmVersion = process.env.npm_package_version;

    try {
        process.env.PRETTIER_PLUGIN_GML_VERSION = "  1.2.3  ";
        process.env.npm_package_version = "ignored";

        assert.equal(resolveCliVersion(), "1.2.3");
    } finally {
        if (originalEnv === undefined) {
            delete process.env.PRETTIER_PLUGIN_GML_VERSION;
        } else {
            process.env.PRETTIER_PLUGIN_GML_VERSION = originalEnv;
        }

        if (originalNpmVersion === undefined) {
            delete process.env.npm_package_version;
        } else {
            process.env.npm_package_version = originalNpmVersion;
        }
    }
});

test("resolveCliVersion falls back to npm_package_version when no override is set", () => {
    const originalEnv = process.env.PRETTIER_PLUGIN_GML_VERSION;
    const originalNpmVersion = process.env.npm_package_version;

    try {
        delete process.env.PRETTIER_PLUGIN_GML_VERSION;
        process.env.npm_package_version = " 9.8.7 ";

        assert.equal(resolveCliVersion(), "9.8.7");
    } finally {
        if (originalEnv === undefined) {
            delete process.env.PRETTIER_PLUGIN_GML_VERSION;
        } else {
            process.env.PRETTIER_PLUGIN_GML_VERSION = originalEnv;
        }

        if (originalNpmVersion === undefined) {
            delete process.env.npm_package_version;
        } else {
            process.env.npm_package_version = originalNpmVersion;
        }
    }
});
