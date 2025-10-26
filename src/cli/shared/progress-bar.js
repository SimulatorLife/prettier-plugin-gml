import { SingleBar, Presets } from "cli-progress";

import { coercePositiveInteger } from "./dependencies.js";
import { createIntegerOptionToolkit } from "../core/integer-option-toolkit.js";

const DEFAULT_PROGRESS_BAR_WIDTH = 24;
const PROGRESS_BAR_WIDTH_ENV_VAR = "GML_PROGRESS_BAR_WIDTH";
const activeProgressBars = new Map();

const createWidthErrorMessage = (received) =>
    `Progress bar width must be a positive integer (received ${received}).`;

const createTypeErrorMessage = (type) =>
    `Progress bar width must be provided as a number (received type '${type}').`;

const {
    getDefault: getDefaultProgressBarWidth,
    setDefault: setDefaultProgressBarWidth,
    resolve: resolveProgressBarWidth,
    applyEnvOverride: applyProgressBarWidthEnvOverride
} = createIntegerOptionToolkit({
    defaultValue: DEFAULT_PROGRESS_BAR_WIDTH,
    envVar: PROGRESS_BAR_WIDTH_ENV_VAR,
    baseCoerce: coercePositiveInteger,
    createErrorMessage: createWidthErrorMessage,
    typeErrorMessage: createTypeErrorMessage,
    defaultValueOption: "defaultWidth"
});

applyProgressBarWidthEnvOverride();

function createDefaultProgressBar(label, width, { stream } = {}) {
    return new SingleBar(
        {
            format: `${label} [{bar}] {value}/{total}`,
            barsize: width,
            hideCursor: true,
            clearOnComplete: true,
            linewrap: true,
            ...(stream ? { stream } : {})
        },
        Presets.shades_classic
    );
}

function disposeProgressBars() {
    for (const [, bar] of activeProgressBars) {
        try {
            bar.stop();
        } catch {
            // Ignore cleanup failures so disposal continues for remaining bars.
        }
    }
    activeProgressBars.clear();
}

function resetProgressBarRegistryForTesting() {
    disposeProgressBars();
}

function shouldRenderProgressBar(stdout, width) {
    return Boolean(stdout?.isTTY) && width > 0;
}

function normalizeProgressMetrics(current, total) {
    const normalizedTotal = total > 0 ? total : 1;
    const normalizedCurrent = Math.min(current, normalizedTotal);

    return { normalizedTotal, normalizedCurrent };
}

function getTrackedProgressBar(label) {
    return activeProgressBars.get(label) ?? null;
}

function resolveProgressStream(stdout) {
    if (stdout && typeof stdout.write === "function") {
        return stdout;
    }

    return;
}

function updateTrackedProgressBar(bar, { normalizedTotal, normalizedCurrent }) {
    bar.setTotal(normalizedTotal);
    bar.update(normalizedCurrent);
}

function startProgressBar({
    label,
    width,
    createBar,
    normalizedTotal,
    normalizedCurrent,
    stream
}) {
    const bar = createBar(label, width, { stream });
    activeProgressBars.set(label, bar);
    bar.start(normalizedTotal, normalizedCurrent);
    return bar;
}

function ensureProgressBar({
    label,
    width,
    createBar,
    stdout,
    normalizedTotal,
    normalizedCurrent
}) {
    const existing = getTrackedProgressBar(label);
    if (existing) {
        updateTrackedProgressBar(existing, {
            normalizedTotal,
            normalizedCurrent
        });
        return existing;
    }

    return startProgressBar({
        label,
        width,
        createBar,
        normalizedTotal,
        normalizedCurrent,
        stream: resolveProgressStream(stdout)
    });
}

function finalizeProgressBarIfComplete({
    bar,
    label,
    normalizedTotal,
    normalizedCurrent
}) {
    if (normalizedCurrent < normalizedTotal) {
        return;
    }

    bar.stop();
    activeProgressBars.delete(label);
}

function renderProgressBar(label, current, total, width, options = {}) {
    const { stdout = process.stdout, createBar = createDefaultProgressBar } =
        options;

    if (!shouldRenderProgressBar(stdout, width)) {
        return;
    }

    const metrics = normalizeProgressMetrics(current, total);
    const bar = ensureProgressBar({
        label,
        width,
        createBar,
        stdout,
        ...metrics
    });

    finalizeProgressBarIfComplete({
        bar,
        label,
        ...metrics
    });
}

async function withProgressBarCleanup(callback) {
    if (typeof callback !== "function") {
        throw new TypeError(
            "withProgressBarCleanup requires a callback function."
        );
    }

    try {
        return await callback();
    } finally {
        disposeProgressBars();
    }
}

export {
    DEFAULT_PROGRESS_BAR_WIDTH,
    PROGRESS_BAR_WIDTH_ENV_VAR,
    applyProgressBarWidthEnvOverride,
    disposeProgressBars,
    getDefaultProgressBarWidth,
    setDefaultProgressBarWidth,
    renderProgressBar,
    resolveProgressBarWidth,
    withProgressBarCleanup,
    resetProgressBarRegistryForTesting
};
