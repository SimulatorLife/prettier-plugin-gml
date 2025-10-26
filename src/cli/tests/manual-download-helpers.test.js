import assert from "node:assert/strict";
import { afterEach, describe, it, mock } from "node:test";

import {
    announceManualDownloadStart,
    createManualDownloadReporter,
    downloadManualEntriesWithProgress,
    downloadManualFileEntries
} from "../features/manual/utils.js";
import * as progressBarModule from "../shared/progress-bar.js";

const { renderProgressBar, resetProgressBarRegistryForTesting } =
    progressBarModule;

describe("manual download helpers", () => {
    afterEach(() => {
        mock.restoreAll();
        resetProgressBarRegistryForTesting();
    });

    it("downloads manual entries while forwarding progress updates", async () => {
        const fetchCalls = [];
        const progressUpdates = [];
        const entries = [
            ["keywords", "Manual/keywords.json"],
            ["tags", "Manual/tags.json"]
        ];

        const payloads = await downloadManualFileEntries({
            entries,
            manualRefSha: "abc123",
            fetchManualFile: async (...args) => {
                fetchCalls.push(args);
                return `${args[0]}:${args[1]}`;
            },
            requestOptions: { forceRefresh: true },
            onProgress: (update) => {
                progressUpdates.push(update);
            }
        });

        assert.deepEqual(payloads, {
            keywords: "abc123:Manual/keywords.json",
            tags: "abc123:Manual/tags.json"
        });
        assert.deepEqual(fetchCalls, [
            ["abc123", "Manual/keywords.json", { forceRefresh: true }],
            ["abc123", "Manual/tags.json", { forceRefresh: true }]
        ]);
        assert.deepEqual(progressUpdates, [
            {
                key: "keywords",
                path: "Manual/keywords.json",
                fetchedCount: 1,
                totalEntries: 2
            },
            {
                key: "tags",
                path: "Manual/tags.json",
                fetchedCount: 2,
                totalEntries: 2
            }
        ]);
    });

    it("downloads manual entries with the shared progress helper", async () => {
        const logCalls = [];
        const restoreLog = mock.method(console, "log", (...args) => {
            logCalls.push(args.join(" "));
        });

        try {
            const payloads = await downloadManualEntriesWithProgress({
                entries: [
                    ["keywords", "Manual/keywords.json"],
                    ["tags", "Manual/tags.json"]
                ],
                manualRefSha: "abc123",
                fetchManualFile: async (sha, filePath) => `${sha}:${filePath}`,
                requestOptions: { forceRefresh: true },
                progress: {
                    label: "Downloading manual assets",
                    verbose: { downloads: true, progressBar: false },
                    formatPath: (path) => path.toUpperCase()
                }
            });

            assert.deepEqual(payloads, {
                keywords: "abc123:Manual/keywords.json",
                tags: "abc123:Manual/tags.json"
            });
            assert.deepEqual(logCalls, [
                "✓ MANUAL/KEYWORDS.JSON",
                "✓ MANUAL/TAGS.JSON"
            ]);
        } finally {
            restoreLog.mock.restore();
        }
    });

    it("renders progress bars when verbose progress output is enabled", () => {
        const renderCalls = [];
        const restoreLog = mock.method(console, "log", () => {});

        try {
            const { report, cleanup } = createManualDownloadReporter({
                label: "Downloading manual pages",
                verbose: { downloads: true, progressBar: true },
                progressBarWidth: 24,
                render: (...args) => {
                    renderCalls.push(args);
                }
            });

            report({
                path: "Manual/file.htm",
                fetchedCount: 1,
                totalEntries: 4
            });

            assert.equal(renderCalls.length, 1);
            assert.deepEqual(renderCalls[0], [
                "Downloading manual pages",
                1,
                4,
                24
            ]);
            assert.equal(restoreLog.mock.callCount(), 0);
            cleanup();
        } finally {
            restoreLog.mock.restore();
        }
    });

    it("logs individual paths when progress bars are disabled", () => {
        const logCalls = [];
        const restoreLog = mock.method(console, "log", (...args) => {
            logCalls.push(args.join(" "));
        });

        try {
            const { report, cleanup } = createManualDownloadReporter({
                label: "Downloading manual files",
                verbose: { downloads: true, progressBar: false },
                render: () => {
                    throw new Error("render should not be called");
                }
            });

            report({
                path: "Manual/file.htm",
                fetchedCount: 2,
                totalEntries: 5
            });

            assert.deepEqual(logCalls, ["✓ Manual/file.htm"]);
            cleanup();
        } finally {
            restoreLog.mock.restore();
        }
    });

    it("ignores progress updates when download logging is disabled", () => {
        const restoreLog = mock.method(console, "log", () => {
            throw new Error("console.log should not be called");
        });

        try {
            const { report, cleanup } = createManualDownloadReporter({
                label: "Downloading manual files",
                verbose: { downloads: false, progressBar: true },
                render: () => {
                    throw new Error("render should not be called");
                }
            });

            report({
                path: "Manual/file.htm",
                fetchedCount: 1,
                totalEntries: 1
            });

            assert.equal(restoreLog.mock.callCount(), 0);
            cleanup();
        } finally {
            restoreLog.mock.restore();
        }
    });

    it("only runs progress cleanup once", () => {
        const stopMock = mock.fn();
        const stdout = {
            isTTY: true,
            clearLine: () => {},
            cursorTo: () => {},
            moveCursor: () => {},
            on: () => {},
            removeListener: () => {},
            write: () => {}
        };

        const { report, cleanup } = createManualDownloadReporter({
            label: "Downloading manual files",
            verbose: { downloads: true, progressBar: true },
            progressBarWidth: 12,
            render: (label, current, total, width) => {
                renderProgressBar(label, current, total, width, {
                    stdout,
                    createBar: () => ({
                        setTotal: () => {},
                        update: () => {},
                        start: () => {},
                        stop: (...args) => {
                            stopMock(...args);
                        }
                    })
                });
            }
        });

        report({
            path: "Manual/file.htm",
            fetchedCount: 1,
            totalEntries: 2
        });

        cleanup();
        cleanup();

        assert.equal(stopMock.mock.callCount(), 1);
    });

    it("disposes progress bars when downloads fail mid-flight", async () => {
        const stopMock = mock.fn();
        const bar = {
            setTotal: () => {},
            update: () => {},
            start: () => {},
            stop: (...args) => {
                stopMock(...args);
            }
        };
        const stdout = {
            isTTY: true,
            clearLine: () => {},
            cursorTo: () => {},
            moveCursor: () => {},
            on: () => {},
            removeListener: () => {},
            write: () => {}
        };

        const { report, cleanup } = createManualDownloadReporter({
            label: "Downloading manual files",
            verbose: { downloads: true, progressBar: true },
            progressBarWidth: 24,
            render: (label, current, total, width) => {
                renderProgressBar(label, current, total, width, {
                    stdout,
                    createBar: () => bar
                });
            }
        });

        await assert.rejects(
            downloadManualFileEntries({
                entries: [
                    ["keywords", "Manual/keywords.json"],
                    ["tags", "Manual/tags.json"]
                ],
                manualRefSha: "abc123",
                fetchManualFile: async (sha, filePath) => {
                    if (filePath.endsWith("tags.json")) {
                        throw new Error("network failure");
                    }

                    return `${sha}:${filePath}`;
                },
                requestOptions: { forceRefresh: true },
                onProgress: ({ path, fetchedCount, totalEntries }) =>
                    report({
                        path,
                        fetchedCount,
                        totalEntries
                    }),
                onProgressCleanup: cleanup
            }),
            /network failure/
        );

        assert.equal(stopMock.mock.callCount(), 1);
        cleanup();
    });

    it("announces manual download activity using the shared helper", () => {
        const logCalls = [];
        const restoreLog = mock.method(console, "log", (...args) => {
            logCalls.push(args.join(" "));
        });

        try {
            announceManualDownloadStart(1, {
                verbose: { downloads: true },
                description: "manual asset"
            });
            announceManualDownloadStart(3, {
                verbose: { downloads: true },
                description: "manual page"
            });
            announceManualDownloadStart(2, {
                verbose: { downloads: false },
                description: "manual file"
            });

            assert.deepEqual(logCalls, [
                "Fetching 1 manual asset…",
                "Fetching 3 manual pages…"
            ]);
        } finally {
            restoreLog.mock.restore();
        }
    });
});
