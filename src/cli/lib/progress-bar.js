import { coercePositiveInteger } from "./shared-deps.js";
import {
    createIntegerOptionCoercer,
    createIntegerOptionState
} from "./numeric-option-state.js";

const DEFAULT_PROGRESS_BAR_WIDTH = 24;
const PROGRESS_BAR_WIDTH_ENV_VAR = "GML_PROGRESS_BAR_WIDTH";
const activeProgressBars = new Map();
const CURSOR_HIDE = "\u001B[?25l";
const CURSOR_SHOW = "\u001B[?25h";

class TerminalProgressBar {
    constructor(options = {}, label = "") {
        const {
            format = "{value}/{total}",
            barsize = DEFAULT_PROGRESS_BAR_WIDTH,
            hideCursor = false,
            clearOnComplete = false,
            stream = null
        } = options;

        this.format = typeof format === "string" ? format : "{value}/{total}";
        const normalizedWidth = Number.isFinite(barsize)
            ? Math.max(0, Math.floor(barsize))
            : DEFAULT_PROGRESS_BAR_WIDTH;
        this.barWidth = normalizedWidth;
        this.hideCursor = Boolean(hideCursor);
        this.clearOnComplete = Boolean(clearOnComplete);
        this.stream = typeof stream?.write === "function" ? stream : null;
        this.label = label;
        this.total = 0;
        this.current = 0;
        this.active = false;
        this.cursorHidden = false;
        this.lastOutputLength = 0;
    }

    start(total, current = 0) {
        this.total = this.#normalizeTotal(total);
        this.current = this.#normalizeCurrent(current);
        this.active = true;

        if (this.hideCursor && this.stream) {
            this.cursorHidden = true;
            this.#write(CURSOR_HIDE);
        }

        this.#render();
    }

    setTotal(total) {
        this.total = this.#normalizeTotal(total);
        this.current = this.#normalizeCurrent(this.current);
        if (this.active) {
            this.#render();
        }
    }

    update(current) {
        this.current = this.#normalizeCurrent(current);
        if (this.active) {
            this.#render();
        }
    }

    stop() {
        if (!this.active) {
            return;
        }

        if (this.clearOnComplete) {
            this.#clearLine();
        } else {
            this.#render();
            this.#write("\n");
        }

        if (this.cursorHidden && this.stream) {
            this.#write(CURSOR_SHOW);
        }

        this.active = false;
        this.cursorHidden = false;
        this.lastOutputLength = 0;
    }

    #normalizeTotal(value) {
        if (!Number.isFinite(value)) {
            return 0;
        }

        const normalized = Math.max(0, value);
        return normalized;
    }

    #normalizeCurrent(value) {
        if (!Number.isFinite(value)) {
            return 0;
        }

        const normalized = Math.max(0, value);

        if (this.total > 0) {
            return Math.min(normalized, this.total);
        }

        return 0;
    }

    #render() {
        if (!this.stream) {
            return;
        }

        const output = this.#formatOutput();
        const paddedOutput =
            output.length < this.lastOutputLength
                ? output.padEnd(this.lastOutputLength, " ")
                : output;

        this.#write(`\r${paddedOutput}`);
        this.lastOutputLength = output.length;
    }

    #formatOutput() {
        const total = Math.max(this.total, 0);
        const current = total > 0 ? Math.min(this.current, total) : 0;
        const width = this.barWidth;
        const progress = total > 0 ? current / total : 0;
        const filledLength = Math.round(width * progress);
        const emptyLength = Math.max(0, width - filledLength);
        const filled = "#".repeat(filledLength);
        const empty = "-".repeat(emptyLength);
        const bar = `${filled}${empty}`;

        return this.format
            .replaceAll("{bar}", bar)
            .replaceAll("{value}", this.#formatNumber(current))
            .replaceAll("{total}", this.#formatNumber(total));
    }

    #formatNumber(value) {
        if (Number.isInteger(value)) {
            return String(value);
        }

        return Number(value.toFixed(2)).toString();
    }

    #clearLine() {
        if (!this.stream) {
            return;
        }

        if (typeof this.stream.clearLine === "function") {
            this.stream.clearLine(0);
            if (typeof this.stream.cursorTo === "function") {
                this.stream.cursorTo(0);
            } else {
                this.#write("\r");
            }
        } else {
            const blank = " ".repeat(this.lastOutputLength);
            this.#write(`\r${blank}\r`);
        }
    }

    #write(value) {
        try {
            this.stream?.write?.(value);
        } catch {
            // Ignore stream write errors so progress updates do not crash the CLI.
        }
    }
}

let progressBarFactory = (options, label) =>
    new TerminalProgressBar(options, label);

function resolveProgressStream(stdout) {
    if (!stdout) {
        return;
    }

    const stream = stdout;

    if (typeof stream.write !== "function") {
        return;
    }

    return stream;
}

const createWidthErrorMessage = (received) =>
    `Progress bar width must be a positive integer (received ${received}).`;

const createTypeErrorMessage = (type) =>
    `Progress bar width must be provided as a number (received type '${type}').`;

const coerceProgressBarWidth = createIntegerOptionCoercer({
    baseCoerce: coercePositiveInteger,
    createErrorMessage: createWidthErrorMessage
});

const progressBarWidthState = createIntegerOptionState({
    defaultValue: DEFAULT_PROGRESS_BAR_WIDTH,
    envVar: PROGRESS_BAR_WIDTH_ENV_VAR,
    coerce: coerceProgressBarWidth,
    typeErrorMessage: createTypeErrorMessage
});

const {
    getDefault: getDefaultProgressBarWidth,
    setDefault: setDefaultProgressBarWidth,
    resolve: resolveProgressBarWidthState,
    applyEnvOverride: applyProgressBarWidthEnvOverride
} = progressBarWidthState;

function resolveProgressBarWidth(rawValue, { defaultWidth } = {}) {
    return resolveProgressBarWidthState(rawValue, {
        defaultValue: defaultWidth
    });
}

applyProgressBarWidthEnvOverride();

function setProgressBarFactoryForTesting(factory) {
    progressBarFactory =
        typeof factory === "function"
            ? factory
            : (options, label) => new TerminalProgressBar(options, label);
}

function createDefaultProgressBar(label, width, { stream } = {}) {
    return progressBarFactory(
        {
            format: `${label} [{bar}] {value}/{total}`,
            barsize: width,
            hideCursor: true,
            clearOnComplete: true,
            ...(stream ? { stream } : {})
        },
        label
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

function renderProgressBar(label, current, total, width, options = {}) {
    const { stdout = process.stdout, createBar = createDefaultProgressBar } =
        options;

    if (!stdout?.isTTY || width <= 0) {
        return;
    }

    const normalizedTotal = total > 0 ? total : 1;
    const normalizedCurrent = Math.min(current, normalizedTotal);
    let bar = activeProgressBars.get(label);

    if (bar) {
        bar.setTotal(normalizedTotal);
        bar.update(normalizedCurrent);
    } else {
        const stream = resolveProgressStream(stdout);
        bar = createBar(label, width, { stream });
        activeProgressBars.set(label, bar);
        bar.start(normalizedTotal, normalizedCurrent);
    }

    if (normalizedCurrent >= normalizedTotal) {
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
    setProgressBarFactoryForTesting,
    renderProgressBar,
    resolveProgressBarWidth,
    withProgressBarCleanup
};
