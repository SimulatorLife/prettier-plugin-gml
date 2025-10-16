import {
    coercePositiveInteger,
    resolveIntegerOption
} from "./command-parsing.js";
import { SingleBar, Presets } from "cli-progress";

const DEFAULT_PROGRESS_BAR_WIDTH = 24;
const activeProgressBars = new Map();
let progressBarFactory = createDefaultProgressBar;
let stdoutOverride = null;

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

function resolveProgressBarWidth(rawValue) {
    return resolveIntegerOption(rawValue, {
        defaultValue: DEFAULT_PROGRESS_BAR_WIDTH,
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

function getStdout() {
    return stdoutOverride ?? process.stdout;
}

function setProgressBarFactoryForTesting(factory) {
    progressBarFactory =
        typeof factory === "function" ? factory : createDefaultProgressBar;
}

function setProgressBarStdoutForTesting(stdout) {
    stdoutOverride = stdout && typeof stdout === "object" ? stdout : null;
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
    const stdout = getStdout();
    if (!stdout?.isTTY || width <= 0) {
        return;
    }

    const normalizedTotal = total > 0 ? total : 1;
    let bar = activeProgressBars.get(label);

    if (bar) {
        bar.setTotal(normalizedTotal);
        bar.update(Math.min(current, normalizedTotal));
    } else {
        bar = progressBarFactory(label, width);
        bar.start(normalizedTotal, Math.min(current, normalizedTotal));
        activeProgressBars.set(label, bar);
    }

    if (current >= normalizedTotal) {
        bar.stop();
        activeProgressBars.delete(label);
    }
}

export {
    DEFAULT_PROGRESS_BAR_WIDTH,
    renderProgressBar,
    disposeProgressBars,
    setProgressBarFactoryForTesting,
    setProgressBarStdoutForTesting,
    resolveProgressBarWidth
};
