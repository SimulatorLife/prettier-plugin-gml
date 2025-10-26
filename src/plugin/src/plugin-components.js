import {
    assertFunction,
    isAbortError,
    resolveAbortSignalFromOptions
} from "./shared/index.js";
import { createDefaultGmlPluginComponents } from "./component-providers/default-plugin-components.js";
import { normalizeGmlPluginComponents } from "./component-providers/plugin-component-normalizer.js";

const DEFAULT_COMPONENTS = normalizeGmlPluginComponents(
    createDefaultGmlPluginComponents()
);

let currentProvider = () => DEFAULT_COMPONENTS;
let activeGmlPluginComponents = DEFAULT_COMPONENTS;

export const gmlPluginComponents = DEFAULT_COMPONENTS;

const componentObservers = new Set();

function notifyComponentObservers() {
    if (componentObservers.size === 0) {
        return;
    }

    const snapshot = Array.from(componentObservers);

    for (const observer of snapshot) {
        observer(activeGmlPluginComponents);
    }
}

function assignComponents(components) {
    activeGmlPluginComponents = normalizeGmlPluginComponents(components);
    notifyComponentObservers();
    return activeGmlPluginComponents;
}

export function resolveGmlPluginComponents() {
    return activeGmlPluginComponents;
}

export function setGmlPluginComponentProvider(provider) {
    const normalizedProvider = assertFunction(provider, "provider", {
        errorMessage:
            "GML plugin component providers must be functions that return component maps"
    });

    currentProvider = normalizedProvider;
    return assignComponents(normalizedProvider());
}

export function restoreDefaultGmlPluginComponents() {
    currentProvider = () => DEFAULT_COMPONENTS;
    activeGmlPluginComponents = DEFAULT_COMPONENTS;
    notifyComponentObservers();
    return activeGmlPluginComponents;
}

export function resetGmlPluginComponentProvider() {
    return restoreDefaultGmlPluginComponents();
}

export function getGmlPluginComponentProvider() {
    return currentProvider;
}

const OBSERVER_ABORT_MESSAGE =
    "GML plugin component observer registration was aborted.";

/**
 * Subscribe to notifications whenever the plugin component map changes.
 *
 * Observers receive the most recent, normalized component snapshot each time a
 * provider update is applied via {@link setGmlPluginComponentProvider} or when
 * defaults are restored. Callers may supply an {@link AbortSignal} on
 * `options.signal` to automatically unsubscribe; if that signal is already
 * aborted, registration resolves to a no-op unsubscribe handler so callers can
 * treat cancellation as an idempotent cleanup step.
 *
 * @param {(components: ReturnType<typeof resolveGmlPluginComponents>) => void} observer
 *        Callback invoked with the active component map.
 * @param {{ signal?: AbortSignal }} [options]
 *        Optional bag supporting abort-driven unsubscription.
 * @returns {() => void} Function that unsubscribes the observer when invoked.
 */
export function addGmlPluginComponentObserver(observer, options = {}) {
    const normalizedObserver = assertFunction(observer, "observer", {
        errorMessage: "GML plugin component observers must be functions"
    });

    let signal = null;
    try {
        signal = resolveAbortSignalFromOptions(options, {
            fallbackMessage: OBSERVER_ABORT_MESSAGE
        });
    } catch (error) {
        if (isAbortError(error)) {
            // Observer registration may race with an already-aborted signal when
            // manual CLI flows tear down and rehydrate components during the
            // live-reload handshake (documented in
            // docs/live-reloading-concept.md#manual-mode-cleanup-handoffs).
            // Returning a stable noop unsubscriber lets callers treat "subscribe
            // after cancellation" as an idempotent cleanup step; propagating the
            // abort error or returning `null` would explode the finally blocks
            // that unconditionally invoke the handler and leak component
            // overrides mid-refresh.
            return () => {};
        }

        throw error;
    }

    componentObservers.add(normalizedObserver);

    let aborted = false;
    const unsubscribe = () => {
        if (aborted) {
            return;
        }

        aborted = true;
        componentObservers.delete(normalizedObserver);
        if (signal) {
            signal.removeEventListener("abort", abortHandler);
        }
    };

    const abortHandler = () => {
        unsubscribe();
    };

    if (signal) {
        signal.addEventListener("abort", abortHandler, { once: true });
    }

    return unsubscribe;
}
