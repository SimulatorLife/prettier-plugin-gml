type StatusPayload = {
    patchCount?: number;
    patchHistorySize?: number;
    maxPatchHistory?: number;
    totalPatchCount?: number;
    errorCount?: number;
    scanComplete?: boolean;
};

const DEFAULT_STATUS_TIMEOUT_MS = 1500;
const DEFAULT_POLL_INTERVAL_MS = 25;

function delay(ms: number): Promise<void> {
    return new Promise((resolve) => {
        setTimeout(resolve, ms);
    });
}

export async function waitForPatchCount(
    baseUrl: string,
    minCount: number,
    timeoutMs = DEFAULT_STATUS_TIMEOUT_MS,
    pollIntervalMs = DEFAULT_POLL_INTERVAL_MS
): Promise<number> {
    const deadline = Date.now() + timeoutMs;

    while (Date.now() < deadline) {
        try {
            const response = await fetch(`${baseUrl}/status`);
            if (response.ok) {
                const payload = (await response.json()) as StatusPayload;
                const patchCount =
                    typeof payload.totalPatchCount === "number"
                        ? payload.totalPatchCount
                        : typeof payload.patchCount === "number"
                          ? payload.patchCount
                          : 0;
                if (patchCount >= minCount) {
                    return patchCount;
                }
            }
        } catch {
            // Ignore transient startup failures while the server boots.
        }

        await delay(pollIntervalMs);
    }

    throw new Error(`Timed out waiting for ${minCount} patches from ${baseUrl}/status`);
}

export async function waitForErrorCount(
    baseUrl: string,
    minCount: number,
    timeoutMs = DEFAULT_STATUS_TIMEOUT_MS,
    pollIntervalMs = DEFAULT_POLL_INTERVAL_MS
): Promise<number> {
    const deadline = Date.now() + timeoutMs;

    while (Date.now() < deadline) {
        try {
            const response = await fetch(`${baseUrl}/status`);
            if (response.ok) {
                const payload = (await response.json()) as StatusPayload;
                const errorCount = typeof payload.errorCount === "number" ? payload.errorCount : 0;
                if (errorCount >= minCount) {
                    return errorCount;
                }
            }
        } catch {
            // Ignore transient startup failures while the server boots.
        }

        await delay(pollIntervalMs);
    }

    throw new Error(`Timed out waiting for ${minCount} errors from ${baseUrl}/status`);
}

export async function waitForScanComplete(
    baseUrl: string,
    timeoutMs = DEFAULT_STATUS_TIMEOUT_MS,
    pollIntervalMs = DEFAULT_POLL_INTERVAL_MS
): Promise<void> {
    const deadline = Date.now() + timeoutMs;

    while (Date.now() < deadline) {
        try {
            const response = await fetch(`${baseUrl}/status`);
            if (response.ok) {
                const payload = (await response.json()) as StatusPayload;
                if (payload.scanComplete === true) {
                    return;
                }
            }
        } catch {
            // Ignore transient startup failures while the server boots.
        }

        await delay(pollIntervalMs);
    }

    throw new Error(`Timed out waiting for scan completion from ${baseUrl}/status`);
}

export async function fetchStatusPayload(baseUrl: string): Promise<StatusPayload> {
    const response = await fetch(`${baseUrl}/status`);
    if (!response.ok) {
        throw new Error(`Failed to fetch status from ${baseUrl}/status`);
    }
    return (await response.json()) as StatusPayload;
}

export async function waitForStatusReady(
    baseUrl: string,
    timeoutMs = DEFAULT_STATUS_TIMEOUT_MS,
    pollIntervalMs = DEFAULT_POLL_INTERVAL_MS
): Promise<void> {
    const deadline = Date.now() + timeoutMs;

    while (Date.now() < deadline) {
        try {
            const response = await fetch(`${baseUrl}/status`);
            if (response.ok) {
                return;
            }
        } catch {
            // Ignore transient startup failures while the server boots.
        }

        await delay(pollIntervalMs);
    }

    throw new Error(`Timed out waiting for status server at ${baseUrl}/status`);
}
