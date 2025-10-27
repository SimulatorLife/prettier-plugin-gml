import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, it, mock } from "node:test";

import {
    createManualGitHubClientBundle,
    createManualVerboseState
} from "../src/modules/manual/utils.js";

const API_ROOT = "https://api.github.com/repos/example/manual";
const RAW_ROOT = "https://raw.github.com/example/manual";

function makeResponse({ body, ok = true, statusText = "OK" }) {
    return {
        ok,
        statusText,
        async text() {
            return body;
        }
    };
}

function createManualClientBundle({
    userAgent,
    defaultCacheRoot,
    defaultRawRoot
}) {
    const { requestDispatcher, commitResolver, refResolver, fileClient } =
        createManualGitHubClientBundle({
            userAgent,
            defaultCacheRoot,
            defaultRawRoot
        });

    return {
        requestDispatcher,
        commitResolver,
        refResolver,
        fileFetcher: fileClient
    };
}

describe("manual GitHub client validation", { concurrency: false }, () => {
    afterEach(() => {
        mock.restoreAll();
    });

    it("fetches manual files while caching results to disk", async () => {
        const cacheRoot = await fs.mkdtemp(
            path.join(os.tmpdir(), "manual-cache-")
        );

        const client = createManualClientBundle({
            userAgent: "test-agent",
            defaultCacheRoot: cacheRoot,
            defaultRawRoot: RAW_ROOT
        });

        const responses = [
            {
                url: `${RAW_ROOT}/sha/path/to/file`,
                response: makeResponse({ body: "cached body" })
            }
        ];

        mock.method(globalThis, "fetch", async (url) => {
            const next = responses.shift();
            assert.ok(next, "Unexpected fetch call");
            assert.equal(url, next.url);
            return next.response;
        });

        const cachePath = path.join(cacheRoot, "sha", "path", "to", "file");

        try {
            const first = await client.fileFetcher.fetchManualFile(
                "sha",
                "path/to/file"
            );
            assert.equal(first, "cached body");
            const cachedContent = await fs.readFile(cachePath, "utf8");
            assert.equal(cachedContent, "cached body");

            // Subsequent reads should reuse the cached artefact without fetching.
            const second = await client.fileFetcher.fetchManualFile(
                "sha",
                "path/to/file"
            );
            assert.equal(second, "cached body");
            assert.equal(responses.length, 0);
        } finally {
            await fs.rm(cacheRoot, { recursive: true, force: true });
        }
    });

    it("aborts manual file fetches when a signal is triggered", async () => {
        const cacheRoot = await fs.mkdtemp(
            path.join(os.tmpdir(), "manual-cache-")
        );

        const client = createManualClientBundle({
            userAgent: "test-agent",
            defaultCacheRoot: cacheRoot,
            defaultRawRoot: RAW_ROOT
        });

        const controller = new AbortController();
        let abortHandlerRegistered = false;

        mock.method(globalThis, "fetch", async (url, options = {}) => {
            const { signal } = options;
            assert.equal(url, `${RAW_ROOT}/sha/path/to/file`);
            assert.ok(
                signal instanceof AbortSignal,
                "Expected fetch to receive an abort signal"
            );
            abortHandlerRegistered = true;

            return new Promise((_resolve, reject) => {
                const onAbort = () => {
                    signal.removeEventListener("abort", onAbort);
                    reject(signal.reason ?? new Error("aborted"));
                };

                signal.addEventListener("abort", onAbort, { once: true });
                if (signal.aborted) {
                    onAbort();
                }
                // Keep the promise pending until the abort handler runs so the
                // test does not rely on real timers or event loop jitter.
            });
        });

        try {
            const pending = client.fileFetcher.fetchManualFile(
                "sha",
                "path/to/file",
                {
                    signal: controller.signal,
                    cacheRoot,
                    rawRoot: RAW_ROOT,
                    forceRefresh: true
                }
            );

            controller.abort(new Error("stop"));

            await assert.rejects(pending, /stop/);
            assert.equal(abortHandlerRegistered, true);
        } finally {
            await fs.rm(cacheRoot, { recursive: true, force: true });
        }
    });

    it("rejects manual commit payloads without a SHA", async () => {
        const { refResolver } = createManualClientBundle({
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

        mock.method(globalThis, "fetch", async (url) => {
            const next = responses.shift();
            assert.ok(next, "Unexpected fetch call");
            assert.equal(url, next.url);
            return next.response;
        });

        await assert.rejects(
            () =>
                refResolver.resolveManualRef("feature", {
                    verbose: createManualVerboseState({ quiet: true }),
                    apiRoot: API_ROOT
                }),
            /did not include a commit SHA/
        );
        assert.equal(responses.length, 0);
    });

    it("rejects manual tag entries that omit the tag name", async () => {
        const client = createManualClientBundle({
            userAgent: "test-agent",
            defaultCacheRoot: "/tmp/manual-cache",
            defaultRawRoot: "https://raw.github.com/example/manual"
        });
        const { refResolver } = client;

        const responses = [
            {
                url: `${API_ROOT}/tags?per_page=1`,
                response: makeResponse({
                    body: JSON.stringify([{ commit: { sha: "abc123" } }])
                })
            }
        ];

        mock.method(globalThis, "fetch", async (url) => {
            const next = responses.shift();
            assert.ok(next, "Unexpected fetch call");
            assert.equal(url, next.url);
            return next.response;
        });

        await assert.rejects(
            () =>
                refResolver.resolveManualRef(undefined, {
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
        const client = createManualClientBundle({
            userAgent: "test-agent",
            defaultCacheRoot: "/tmp/manual-cache",
            defaultRawRoot: "https://raw.github.com/example/manual"
        });
        const { refResolver } = client;

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

        mock.method(globalThis, "fetch", async (url) => {
            const next = responses.shift();
            assert.ok(next, "Unexpected fetch call");
            assert.equal(url, next.url);
            return next.response;
        });

        const result = await refResolver.resolveManualRef(undefined, {
            verbose: createManualVerboseState({
                overrides: { resolveRef: false }
            }),
            apiRoot: API_ROOT
        });

        assert.deepEqual(result, { ref: "v1.2.3", sha: "def456" });
        assert.equal(responses.length, 0);
    });

    it("resolves manual refs when verbose state is omitted", async () => {
        const client = createManualClientBundle({
            userAgent: "test-agent",
            defaultCacheRoot: "/tmp/manual-cache",
            defaultRawRoot: "https://raw.github.com/example/manual"
        });
        const { refResolver } = client;

        const responses = [
            {
                url: `${API_ROOT}/tags?per_page=1`,
                response: makeResponse({
                    body: JSON.stringify([
                        { name: "v9.9.9", commit: { sha: "cafeba" } }
                    ])
                })
            }
        ];

        mock.method(globalThis, "fetch", async (url) => {
            const next = responses.shift();
            assert.ok(next, "Unexpected fetch call");
            assert.equal(url, next.url);
            return next.response;
        });

        const result = await refResolver.resolveManualRef(undefined, {
            apiRoot: API_ROOT
        });

        assert.deepEqual(result, { ref: "v9.9.9", sha: "cafeba" });
        assert.equal(responses.length, 0);
    });

    it("exposes a focused commit resolver for direct commit lookups", async () => {
        const client = createManualClientBundle({
            userAgent: "test-agent",
            defaultCacheRoot: "/tmp/manual-cache",
            defaultRawRoot: "https://raw.github.com/example/manual"
        });

        const responses = [
            {
                url: `${API_ROOT}/commits/feature`,
                response: makeResponse({
                    body: JSON.stringify({ sha: "sha-feature" })
                })
            }
        ];

        mock.method(globalThis, "fetch", async (url) => {
            const next = responses.shift();
            assert.ok(next, "Unexpected fetch call");
            assert.equal(url, next.url);
            return next.response;
        });

        const result = await client.commitResolver.resolveCommitFromRef(
            "feature",
            {
                apiRoot: API_ROOT
            }
        );

        assert.deepEqual(result, { ref: "feature", sha: "sha-feature" });
        assert.equal(responses.length, 0);
    });
});
