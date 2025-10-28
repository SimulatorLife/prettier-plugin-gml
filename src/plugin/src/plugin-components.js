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

// Stable noop handler reused across aborted or cancelled subscription flows so
// call sites always receive a callable unsubscriber.
const NOOP_UNSUBSCRIBE = () => {};

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
function resolveObserverSignal(options) {
    try {
        return {
            abortedEarly: false,
            signal: resolveAbortSignalFromOptions(options, {
                fallbackMessage: OBSERVER_ABORT_MESSAGE
            })
        };
    } catch (error) {
        if (isAbortError(error)) {
            return { abortedEarly: true, signal: null };
        }

        throw error;
    }
}

function registerComponentObserver(observer) {
    componentObservers.add(observer);
}

function createObserverSubscription(observer, signal) {
    let aborted = false;
    let abortHandler = null;

    const unsubscribe = () => {
        if (aborted) {
            return;
        }

        aborted = true;
        componentObservers.delete(observer);

        if (signal && abortHandler) {
            signal.removeEventListener("abort", abortHandler);
        }
    };

    if (signal) {
        abortHandler = () => {
            unsubscribe();
        };

        signal.addEventListener("abort", abortHandler, { once: true });

        if (signal.aborted) {
            // Ensure observers do not leak when the signal is aborted between
            // registration and listener attachment. AbortSignal dispatches
            // "abort" synchronously, so late listeners are never notified.
            // Guarding here guarantees cleanup even when the event already
            // fired.
            unsubscribe();
        }
    }

    return unsubscribe;
}

export function addGmlPluginComponentObserver(observer, options = {}) {
    const normalizedObserver = assertFunction(observer, "observer", {
        errorMessage: "GML plugin component observers must be functions"
    });

    const { abortedEarly, signal } = resolveObserverSignal(options);

    if (abortedEarly) {
        // Observer registration may race with an already-aborted signal when
        // manual CLI flows tear down and rehydrate components during the
        // live-reload handshake (documented in
        // docs/live-reloading-concept.md#manual-mode-cleanup-handoffs).
        // Returning a stable noop unsubscriber lets callers treat "subscribe
        // after cancellation" as an idempotent cleanup step; propagating the
        // abort error or returning `null` would explode the finally blocks
        // that unconditionally invoke the handler and leak component
        // overrides mid-refresh.
        return NOOP_UNSUBSCRIBE;
    }

    registerComponentObserver(normalizedObserver);
    return createObserverSubscription(normalizedObserver, signal);
}
