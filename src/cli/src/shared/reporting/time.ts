const MILLISECOND_PER_SECOND = 1000;
const SUB_SECOND_THRESHOLD_TOLERANCE_MS = 1e-6;

interface VerboseFlagOptions {
    parsing?: boolean;
}

interface VerboseLogger {
    log?: (message: string) => void;
}

export interface VerboseDurationLoggerOptions {
    verbose?: VerboseFlagOptions;
    formatMessage?: string | ((duration: string) => string);
    now?: () => number;
    logger?: VerboseLogger;
}

export interface TimeSyncOptions {
    verbose?: VerboseFlagOptions;
    now?: () => number;
    logger?: VerboseLogger;
}

export function formatDuration(
    startTime: number,
    now: () => number = Date.now
): string {
    const deltaMs = now() - startTime;
    const isEffectivelySubSecond =
        deltaMs < MILLISECOND_PER_SECOND &&
        deltaMs < MILLISECOND_PER_SECOND - SUB_SECOND_THRESHOLD_TOLERANCE_MS;

    if (isEffectivelySubSecond) {
        return `${deltaMs}ms`;
    }

    return `${(deltaMs / MILLISECOND_PER_SECOND).toFixed(1)}s`;
}

export function createVerboseDurationLogger({
    verbose,
    formatMessage,
    now = Date.now,
    logger = console
}: VerboseDurationLoggerOptions = {}): () => void {
    const startTime = now();

    return () => {
        if (!verbose?.parsing) {
            return;
        }

        const duration = formatDuration(startTime, now);
        const message =
            typeof formatMessage === "function"
                ? formatMessage(duration)
                : (formatMessage ?? `Completed in ${duration}.`);

        if (typeof logger?.log === "function") {
            logger.log(message);
        }
    };
}

export function timeSync<TResult>(
    label: string,
    callback: () => TResult,
    { verbose, now, logger = console }: TimeSyncOptions = {}
): TResult {
    if (verbose?.parsing && typeof logger?.log === "function") {
        logger.log(`→ ${label}`);
    }

    const logCompletion = createVerboseDurationLogger({
        verbose,
        formatMessage: (duration) => `  ${label} completed in ${duration}.`,
        now,
        logger
    });
    const result = callback();

    logCompletion();

    return result;
}
