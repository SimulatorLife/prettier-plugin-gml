import path from "node:path";

import { throwIfAborted } from "../../../shared/abort-utils.js";

function normalizeEnsureReadyDescriptor(descriptor) {
    const projectRoot = descriptor?.projectRoot;
    if (!projectRoot) {
        throw new Error("projectRoot must be provided to ensureReady");
    }

    return {
        descriptor,
        resolvedRoot: path.resolve(projectRoot)
    };
}

function resolveEnsureReadyContext({
    descriptor,
    abortController,
    disposedMessage
}) {
    const { resolvedRoot } = normalizeEnsureReadyDescriptor(descriptor);
    const signal = abortController.signal;
    throwIfAborted(signal, disposedMessage);

    return {
        descriptor,
        resolvedRoot,
        key: resolvedRoot,
        signal
    };
}

function trackInFlightOperation(map, key, createOperation) {
    if (map.has(key)) {
        return map.get(key);
    }

    const pending = (async () => {
        try {
            return await createOperation();
        } finally {
            map.delete(key);
        }
    })();

    map.set(key, pending);
    return pending;
}

async function executeEnsureReadyOperation({
    descriptor,
    resolvedRoot,
    signal,
    fsFacade,
    loadCache,
    saveCache,
    buildIndex,
    cacheMaxSizeBytes,
    disposedMessage
}) {
    const descriptorOptions = descriptor ?? {};
    const loadResult = await loadCache(
        { ...descriptorOptions, projectRoot: resolvedRoot },
        fsFacade,
        { signal }
    );
    throwIfAborted(signal, disposedMessage);

    if (loadResult.status === "hit") {
        throwIfAborted(signal, disposedMessage);
        return {
            source: "cache",
            projectIndex: loadResult.projectIndex,
            cache: loadResult
        };
    }

    const projectIndex = await buildIndex(resolvedRoot, fsFacade, {
        ...descriptorOptions?.buildOptions,
        signal
    });
    throwIfAborted(signal, disposedMessage);

    const descriptorMaxSizeBytes =
        descriptorOptions?.maxSizeBytes === undefined
            ? cacheMaxSizeBytes
            : descriptorOptions.maxSizeBytes;

    const saveResult = await saveCache(
        {
            ...descriptorOptions,
            projectRoot: resolvedRoot,
            projectIndex,
            metricsSummary: projectIndex.metrics,
            maxSizeBytes: descriptorMaxSizeBytes
        },
        fsFacade,
        { signal }
    ).catch((error) => {
        return {
            status: "failed",
            error,
            cacheFilePath: loadResult.cacheFilePath
        };
    });
    throwIfAborted(signal, disposedMessage);

    return {
        source: "build",
        projectIndex,
        cache: {
            ...loadResult,
            saveResult
        }
    };
}

export function createProjectIndexCoordinator({
    fsFacade,
    loadCache,
    saveCache,
    buildIndex,
    cacheMaxSizeBytes: rawCacheMaxSizeBytes,
    getDefaultCacheMaxSize
} = {}) {
    if (typeof loadCache !== "function") {
        throw new TypeError(
            "Project index coordinators require a loadCache function."
        );
    }
    if (typeof saveCache !== "function") {
        throw new TypeError(
            "Project index coordinators require a saveCache function."
        );
    }
    if (typeof buildIndex !== "function") {
        throw new TypeError(
            "Project index coordinators require a buildIndex function."
        );
    }
    if (typeof getDefaultCacheMaxSize !== "function") {
        throw new TypeError(
            "Project index coordinators require a getDefaultCacheMaxSize function."
        );
    }

    const cacheMaxSizeBytes =
        rawCacheMaxSizeBytes === undefined
            ? getDefaultCacheMaxSize()
            : rawCacheMaxSizeBytes;

    const inFlight = new Map();
    let disposed = false;
    const abortController = new AbortController();
    const DISPOSED_MESSAGE = "ProjectIndexCoordinator has been disposed";

    function createDisposedError() {
        return new Error(DISPOSED_MESSAGE);
    }

    function ensureNotDisposed() {
        if (disposed) {
            throw createDisposedError();
        }
        throwIfAborted(abortController.signal, DISPOSED_MESSAGE);
    }

    async function ensureReady(descriptor) {
        ensureNotDisposed();
        const context = resolveEnsureReadyContext({
            descriptor,
            abortController,
            disposedMessage: DISPOSED_MESSAGE
        });

        return trackInFlightOperation(inFlight, context.key, () =>
            executeEnsureReadyOperation({
                descriptor,
                resolvedRoot: context.resolvedRoot,
                signal: context.signal,
                fsFacade,
                loadCache,
                saveCache,
                buildIndex,
                cacheMaxSizeBytes,
                disposedMessage: DISPOSED_MESSAGE
            })
        );
    }

    function dispose() {
        if (disposed) {
            return;
        }

        disposed = true;
        if (!abortController.signal.aborted) {
            abortController.abort(createDisposedError());
        }
        inFlight.clear();
    }

    return {
        ensureReady,
        dispose
    };
}
