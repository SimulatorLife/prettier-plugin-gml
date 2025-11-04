// Browser-side WebSocket client for receiving live patches

export function createWebSocketClient({ url, onPatch, onStatus }) {
    const state = {
        ws: null,
        reconnectAttempts: 0,
        reconnectTimer: null,
        shouldReconnect: true,
        status: "disconnected"
    };

    const maxReconnectDelay = 5000;
    const initialReconnectDelay = 500;

    function updateStatus(newStatus) {
        state.status = newStatus;
        if (onStatus) {
            onStatus(newStatus);
        }
    }

    function getReconnectDelay() {
        const delay = Math.min(
            initialReconnectDelay * Math.pow(2, state.reconnectAttempts),
            maxReconnectDelay
        );
        return delay;
    }

    function scheduleReconnect() {
        if (!state.shouldReconnect) {
            return;
        }

        const delay = getReconnectDelay();
        state.reconnectAttempts += 1;

        updateStatus("reconnecting");

        if (state.reconnectTimer) {
            clearTimeout(state.reconnectTimer);
        }

        state.reconnectTimer = setTimeout(() => {
            connect();
        }, delay);
    }

    function handleMessage(event) {
        try {
            const patch = JSON.parse(event.data);

            if (!patch || typeof patch !== "object") {
                throw new TypeError("Invalid patch format");
            }

            if (onPatch) {
                onPatch(patch);
            }
        } catch (error) {
            console.error("[WebSocket] Failed to process patch:", error);
        }
    }

    function handleOpen() {
        state.reconnectAttempts = 0;
        updateStatus("connected");
    }

    function handleClose() {
        updateStatus("disconnected");
        scheduleReconnect();
    }

    function handleError() {
        if (state.ws) {
            state.ws.close();
        }
    }

    function connect() {
        if (state.ws && state.ws.readyState === WebSocket.OPEN) {
            return;
        }

        if (typeof WebSocket === "undefined") {
            console.error(
                "[WebSocket] WebSocket is not available in this environment"
            );
            scheduleReconnect();
            return;
        }

        try {
            state.ws = new WebSocket(url);

            state.ws.addEventListener("open", handleOpen);
            state.ws.addEventListener("message", handleMessage);
            state.ws.addEventListener("close", handleClose);
            state.ws.addEventListener("error", handleError);

            updateStatus("connecting");
        } catch (error) {
            console.error("[WebSocket] Connection failed:", error);
            scheduleReconnect();
        }
    }

    function disconnect() {
        state.shouldReconnect = false;

        if (state.reconnectTimer) {
            clearTimeout(state.reconnectTimer);
            state.reconnectTimer = null;
        }

        if (state.ws) {
            state.ws.removeEventListener("open", handleOpen);
            state.ws.removeEventListener("message", handleMessage);
            state.ws.removeEventListener("close", handleClose);
            state.ws.removeEventListener("error", handleError);

            if (
                state.ws.readyState === WebSocket.OPEN ||
                state.ws.readyState === WebSocket.CONNECTING
            ) {
                state.ws.close();
            }

            state.ws = null;
        }

        updateStatus("disconnected");
    }

    return {
        connect,
        disconnect,
        getStatus: () => state.status
    };
}
