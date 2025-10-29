import {
    coercePositiveInteger,
    isFiniteNumber
} from "../shared/dependencies.js";
import { createIntegerOptionToolkit } from "../core/integer-option-toolkit.js";

const DEFAULT_PROGRESS_BAR_WIDTH = 24;
const PROGRESS_BAR_WIDTH_ENV_VAR = "GML_PROGRESS_BAR_WIDTH";
const activeProgressBars = new Map();

const CURSOR_HIDE_SEQUENCE = "\u001B[?25l";
const CURSOR_SHOW_SEQUENCE = "\u001B[?25h";
const CLEAR_LINE_SEQUENCE = "\u001B[2K";
const CARRIAGE_RETURN = "\r";
const COMPLETE_CHAR = "█";
const INCOMPLETE_CHAR = "░";

class TerminalProgressBar {
    constructor(label, width, { stream } = {}) {
        this.label = label;
        this.width = Math.max(0, width);
        this.stream =
            typeof stream?.write === "function" ? stream : process.stdout;
        this.total = 1;
        this.current = 0;
        this.active = false;
        this.cursorHidden = false;
    }

    start(total, current) {
        this.total = Math.max(1, total);
        this.current = this.#normalizeCurrent(current);
        this.active = true;
        this.#hideCursor();
        this.#render();
    }

    setTotal(total) {
        this.total = Math.max(1, total);
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

        this.active = false;
        this.#clearLine();
        this.#showCursor();
    }

    #normalizeCurrent(value) {
        if (!isFiniteNumber(value)) {
            return 0;
        }

        if (value < 0) {
            return 0;
        }

        if (value > this.total) {
            return this.total;
        }

        return value;
    }

    #render() {
        const ratio = this.total > 0 ? this.current / this.total : 0;
        const filled = Math.round(ratio * this.width);
        const complete = COMPLETE_CHAR.repeat(Math.min(filled, this.width));
        const incomplete = INCOMPLETE_CHAR.repeat(
            Math.max(this.width - filled, 0)
        );
        const bar = `${complete}${incomplete}`;
        const output = `${this.label} [${bar}] ${this.current}/${this.total}`;

        this.#write(`${CARRIAGE_RETURN}${CLEAR_LINE_SEQUENCE}${output}`);
    }

    #clearLine() {
        this.#write(`${CARRIAGE_RETURN}${CLEAR_LINE_SEQUENCE}`);
    }

    #hideCursor() {
        if (this.cursorHidden) {
            return;
        }

        if (this.stream?.isTTY) {
            this.#write(CURSOR_HIDE_SEQUENCE);
            this.cursorHidden = true;
        }
    }

    #showCursor() {
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

function createDefaultProgressBar(label, width, options = {}) {
    return new TerminalProgressBar(label, width, options);
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

function stopAndRemoveProgressBar(label, { suppressErrors = false } = {}) {
    const bar = activeProgressBars.get(label);

    if (!bar) {
        return;
    }

    if (suppressErrors) {
        try {
            bar.stop();
        } catch {
            // Ignore cleanup failures so callers can continue unwinding their
            // own teardown logic without masking the original failure that
            // disabled progress rendering mid-run.
        }
        activeProgressBars.delete(label);
        return;
    }

    bar.stop();
    activeProgressBars.delete(label);
}

function renderProgressBar(label, current, total, width, options = {}) {
    const { stdout = process.stdout, createBar = createDefaultProgressBar } =
        options;

    if (!shouldRenderProgressBar(stdout, width)) {
        stopAndRemoveProgressBar(label, { suppressErrors: true });
        return;
    }

    const normalizedTotal = total > 0 ? total : 1;
    const normalizedCurrent = Math.min(current, normalizedTotal);

    let bar = activeProgressBars.get(label);

    if (bar) {
        bar.setTotal(normalizedTotal);
        bar.update(normalizedCurrent);
    } else {
        const stream =
            stdout && typeof stdout.write === "function" ? stdout : undefined;
        bar = createBar(label, width, { stream });
        activeProgressBars.set(label, bar);
        bar.start(normalizedTotal, normalizedCurrent);
    }

    if (normalizedCurrent >= normalizedTotal) {
        stopAndRemoveProgressBar(label);
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
    resetProgressBarRegistryForTesting
};
