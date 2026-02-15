import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { setTimeout as delay } from "node:timers/promises";

import { startStatusServer } from "../src/modules/status/server.js";
import { createHttpSocketAndWaitForResponse } from "./test-helpers/http-socket-utils.js";

void describe("status server lifecycle", () => {
    void it("closes active sockets on stop", async () => {
        const controller = await startStatusServer({
            host: "127.0.0.1",
            port: 0,
            getSnapshot: () => ({
                uptime: 0,
                patchCount: 0,
                errorCount: 0,
                recentPatches: [],
                recentErrors: [],
                websocketClients: 0
            })
        });

        const { socket, closePromise, responsePromise } = await createHttpSocketAndWaitForResponse(
            controller.host,
            controller.port,
            "GET /status HTTP/1.1\r\nHost: localhost\r\nConnection: keep-alive\r\n\r\n"
        );

        await responsePromise;
        await controller.stop();

        const closed = await Promise.race([closePromise.then(() => true), delay(500).then(() => false)]);

        if (!socket.destroyed) {
            socket.destroy();
        }

        assert.equal(closed, true, "Expected status server stop to close active sockets");
    });
});
