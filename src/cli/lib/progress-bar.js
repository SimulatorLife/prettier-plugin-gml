import {
    coercePositiveInteger,
    createEnvConfiguredValue,
    getOrCreateMapEntry,
    resolveIntegerOption
} from "./shared-deps.js";

const CURSOR_HIDE_SEQUENCE = "\u001B[?25l";
const CURSOR_SHOW_SEQUENCE = "\u001B[?25h";
const CLEAR_LINE_SEQUENCE = "\r\u001B[2K";

class TerminalProgressBar {
    constructor(options = {}, { stream = process.stdout } = {}) {
        const {
            format = "{bar}",
            barsize = 0,
            hideCursor = false,
            clearOnComplete = false,
            linewrap = true
        } = options;

        this.stream = stream;
        this.format = format;
        this.barSize = Math.max(0, Number.parseInt(barsize, 10) || 0);
        this.hideCursor = Boolean(hideCursor);
        this.clearOnComplete = Boolean(clearOnComplete);
        this.linewrap = Boolean(linewrap);
        this.started = false;
        this.cursorHidden = false;
        this.total = 0;
        this.value = 0;
    }

    start(total, value = 0) {
        this.total = this.#normalizeNumber(total);
        this.value = this.#normalizeNumber(value);
        this.started = true;
        this.#render();
    }

    setTotal(total) {
        this.total = this.#normalizeNumber(total);
        if (this.started) {
            this.#render();
        }
    }

    update(value) {
        this.value = this.#normalizeNumber(value);
        if (this.started) {
            this.#render();
        }
    }

    stop() {
        if (this.started) {
            if (this.clearOnComplete) {
                this.#write(CLEAR_LINE_SEQUENCE);
            } else {
                this.#write(`\r${this.#buildOutput()}\n`);
            }
            this.started = false;
        }

        this.#restoreCursor();
    }

    #normalizeNumber(value) {
        const numeric = Number(value);
        return Number.isFinite(numeric) ? numeric : 0;
    }

    #render() {
        if (!this.started) {
            return;
        }

        this.#hideCursorIfNeeded();
        const prefix = this.linewrap ? "\r" : "";
        this.#write(`${prefix}${this.#buildOutput()}`);
    }

    #buildOutput() {
        const total = this.total > 0 ? this.total : 1;
        const clampedValue = Math.min(Math.max(this.value, 0), total);
        const bar = this.#buildBar(clampedValue, total);

        return this.format
            .replace("{bar}", bar)
            .replace("{value}", String(clampedValue))
            .replace("{total}", String(total));
    }

    #buildBar(value, total) {
        if (this.barSize <= 0) {
            return "";
        }

        const ratio = total === 0 ? 0 : value / total;
        const normalizedRatio = Math.min(Math.max(ratio, 0), 1);
        const filled = Math.round(normalizedRatio * this.barSize);
        const empty = Math.max(0, this.barSize - filled);

        const complete = "\u2588"; // full block character
        const incomplete = " ";

        return `${complete.repeat(filled)}${incomplete.repeat(empty)}`;
    }

    #hideCursorIfNeeded() {
        if (!this.hideCursor || this.cursorHidden) {
            return;
        }

        if (this.stream?.isTTY) {
            this.#write(CURSOR_HIDE_SEQUENCE);
            this.cursorHidden = true;
        }
    }

    #restoreCursor() {
        if (!this.cursorHidden) {
            return;
        }

        if (this.stream?.isTTY) {
            this.#write(CURSOR_SHOW_SEQUENCE);
        }

        this.cursorHidden = false;
    }

    #write(chunk) {
        if (typeof this.stream?.write === "function") {
            this.stream.write(chunk);
        }
    }
}

const DEFAULT_PROGRESS_BAR_WIDTH = 24;
const PROGRESS_BAR_WIDTH_ENV_VAR = "GML_PROGRESS_BAR_WIDTH";
const activeProgressBars = new Map();

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

const progressBarWidthConfig = createEnvConfiguredValue({
    defaultValue: DEFAULT_PROGRESS_BAR_WIDTH,
    envVar: PROGRESS_BAR_WIDTH_ENV_VAR,
    normalize: (value, { defaultValue }) =>
        resolveProgressBarWidth(value, { defaultWidth: defaultValue })
});

function getDefaultProgressBarWidth() {
    return progressBarWidthConfig.get();
}

function setDefaultProgressBarWidth(width) {
    return progressBarWidthConfig.set(width);
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

function applyProgressBarWidthEnvOverride(env = process?.env) {
    progressBarWidthConfig.applyEnvOverride(env);
}

applyProgressBarWidthEnvOverride();

function createDefaultProgressBar(label, width) {
    return new TerminalProgressBar({
        format: `${label} [{bar}] {value}/{total}`,
        barsize: width,
        hideCursor: true,
        clearOnComplete: true,
        linewrap: true
    });
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
        createDefaultProgressBar(label, width)
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
    TerminalProgressBar
};
