import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, it } from "node:test";

import {
    createManualGitHubClient,
    createManualVerboseState
} from "../lib/manual-utils.js";

const API_ROOT = "https://api.github.com/repos/example/manual";

function makeResponse({ body, ok = true, statusText = "OK" }) {
    return {
        ok,
        statusText,
        async text() {
            return body;
        }
    };
}

describe("manual GitHub client validation", () => {
    let originalFetch;

    beforeEach(() => {
        originalFetch = globalThis.fetch;
    });

    afterEach(() => {
        globalThis.fetch = originalFetch;
    });

    it("rejects manual commit payloads without a SHA", async () => {
        const client = createManualGitHubClient({
            userAgent: "test-agent",
            defaultCacheRoot: "/tmp/manual-cache",
            defaultRawRoot: "https://raw.github.com/example/manual"
        });

        const responses = [
            {
                url: `${API_ROOT}/commits/feature`,
                response: makeResponse({ body: JSON.stringify({}) })
            }
        ];

        globalThis.fetch = async (url) => {
            const next = responses.shift();
            assert.ok(next, "Unexpected fetch call");
            assert.equal(url, next.url);
            return next.response;
        };

        await assert.rejects(
            () =>
                client.resolveManualRef("feature", {
                    verbose: createManualVerboseState({ quiet: true }),
                    apiRoot: API_ROOT
                }),
            /did not include a commit SHA/
        );
        assert.equal(responses.length, 0);
    });

    it("rejects manual tag entries that omit the tag name", async () => {
        const client = createManualGitHubClient({
            userAgent: "test-agent",
            defaultCacheRoot: "/tmp/manual-cache",
            defaultRawRoot: "https://raw.github.com/example/manual"
        });

        const responses = [
            {
                url: `${API_ROOT}/tags?per_page=1`,
                response: makeResponse({
                    body: JSON.stringify([{ commit: { sha: "abc123" } }])
                })
            }
        ];

        globalThis.fetch = async (url) => {
            const next = responses.shift();
            assert.ok(next, "Unexpected fetch call");
            assert.equal(url, next.url);
            return next.response;
        };

        await assert.rejects(
            () =>
                client.resolveManualRef(undefined, {
                    verbose: createManualVerboseState({
                        overrides: { resolveRef: false }
                    }),
                    apiRoot: API_ROOT
                }),
            /missing a tag name/
        );
        assert.equal(responses.length, 0);
    });

    it("returns manual tag details when the payload is valid", async () => {
        const client = createManualGitHubClient({
            userAgent: "test-agent",
            defaultCacheRoot: "/tmp/manual-cache",
            defaultRawRoot: "https://raw.github.com/example/manual"
        });

        const responses = [
            {
                url: `${API_ROOT}/tags?per_page=1`,
                response: makeResponse({
                    body: JSON.stringify([
                        { name: "v1.2.3", commit: { sha: "def456" } }
                    ])
                })
            }
        ];

        globalThis.fetch = async (url) => {
            const next = responses.shift();
            assert.ok(next, "Unexpected fetch call");
            assert.equal(url, next.url);
            return next.response;
        };

        const result = await client.resolveManualRef(undefined, {
            verbose: createManualVerboseState({
                overrides: { resolveRef: false }
            }),
            apiRoot: API_ROOT
        });

        assert.deepEqual(result, { ref: "v1.2.3", sha: "def456" });
        assert.equal(responses.length, 0);
    });
});
