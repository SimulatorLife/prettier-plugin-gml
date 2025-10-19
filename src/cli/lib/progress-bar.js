import {
    coercePositiveInteger,
    getOrCreateMapEntry,
    resolveIntegerOption
} from "./shared-deps.js";
import { SingleBar, Presets } from "cli-progress";

const DEFAULT_PROGRESS_BAR_WIDTH = 24;
let configuredDefaultProgressBarWidth = DEFAULT_PROGRESS_BAR_WIDTH;
const activeProgressBars = new Map();
let progressBarFactory = createDefaultProgressBar;

const createWidthErrorMessage = (received) =>
    `Progress bar width must be a positive integer (received ${received}).`;

const createTypeErrorMessage = (type) =>
    `Progress bar width must be provided as a number (received type '${type}').`;

function coerceProgressBarWidth(value, { received }) {
    return coercePositiveInteger(value, {
        received,
        createErrorMessage: createWidthErrorMessage
    });
}

function getDefaultProgressBarWidth() {
    return configuredDefaultProgressBarWidth;
}

function setDefaultProgressBarWidth(width) {
    configuredDefaultProgressBarWidth = coerceProgressBarWidth(width, {
        received: width
    });
}

function resolveProgressBarWidth(rawValue, { defaultWidth } = {}) {
    const fallback =
        defaultWidth === undefined
            ? getDefaultProgressBarWidth()
            : defaultWidth;

    return resolveIntegerOption(rawValue, {
        defaultValue: fallback,
        coerce: coerceProgressBarWidth,
        typeErrorMessage: createTypeErrorMessage
    });
}

function createDefaultProgressBar(label, width) {
    return new SingleBar(
        {
            format: `${label} [{bar}] {value}/{total}`,
            barsize: width,
            hideCursor: true,
            clearOnComplete: true,
            linewrap: true
        },
        Presets.shades_classic
    );
}

function setProgressBarFactoryForTesting(factory) {
    progressBarFactory =
        typeof factory === "function" ? factory : createDefaultProgressBar;
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

function renderProgressBar(label, current, total, width) {
    if (!process.stdout.isTTY || width <= 0) {
        return;
    }

    const normalizedTotal = total > 0 ? total : 1;
    const normalizedCurrent = Math.min(current, normalizedTotal);
    const hadBar = activeProgressBars.has(label);
    const bar = getOrCreateMapEntry(activeProgressBars, label, () =>
        progressBarFactory(label, width)
    );

    if (hadBar) {
        bar.setTotal(normalizedTotal);
        bar.update(normalizedCurrent);
    } else {
        bar.start(normalizedTotal, normalizedCurrent);
    }

    if (current >= normalizedTotal) {
        bar.stop();
        activeProgressBars.delete(label);
    }
}

export {
    DEFAULT_PROGRESS_BAR_WIDTH,
    getDefaultProgressBarWidth,
    setDefaultProgressBarWidth,
    renderProgressBar,
    disposeProgressBars,
    setProgressBarFactoryForTesting,
    resolveProgressBarWidth
};
