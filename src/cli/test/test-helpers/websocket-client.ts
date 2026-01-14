import WebSocket from "ws";

export interface HotReloadScriptPatch {
    kind: "script";
    id: string;
    js_body: string;
    [key: string]: unknown;
}

type PatchFilter = (patch: unknown) => patch is HotReloadScriptPatch;

export interface WebSocketPatchStream {
    websocketClient: WebSocket;
    receivedPatches: Array<HotReloadScriptPatch>;
    disconnect(): Promise<void>;
}

export interface WebSocketPatchStreamOptions {
    shouldCollect?: PatchFilter;
    onParseError?: (error: unknown) => void;
}

const isScriptPatch: PatchFilter = (patch): patch is HotReloadScriptPatch => {
    const candidate = patch as Record<string, unknown>;

    return (
        typeof candidate === "object" &&
        candidate !== null &&
        candidate.kind === "script" &&
        typeof candidate.id === "string" &&
        typeof candidate.js_body === "string"
    );
};

export async function connectToHotReloadWebSocket(
    websocketUrl: string,
    options: WebSocketPatchStreamOptions = {}
): Promise<WebSocketPatchStream> {
    const websocketClient = new WebSocket(websocketUrl);
    const receivedPatches: Array<HotReloadScriptPatch> = [];
    const filter = options.shouldCollect ?? isScriptPatch;

    websocketClient.on("message", (data) => {
        try {
            const patch = JSON.parse(data.toString());
            if (filter(patch)) {
                receivedPatches.push(patch);
            }
        } catch (error) {
            if (options.onParseError) {
                options.onParseError(error);
            }
        }
    });

    await new Promise<void>((resolve, reject) => {
        websocketClient.once("open", () => resolve());
        websocketClient.once("error", (error) => {
            reject(
                error instanceof Error
                    ? error
                    : new Error(`WebSocket error: ${error === undefined ? "unknown" : String(error)}`)
            );
        });
    });

    return {
        websocketClient,
        receivedPatches,
        disconnect(): Promise<void> {
            return new Promise<void>((resolve) => {
                try {
                    websocketClient.once("close", () => resolve());
                    websocketClient.close();
                } catch {
                    resolve();
                }
            });
        }
    };
}
