import net from "node:net";

/**
 * Creates an HTTP socket connection and waits for the response headers.
 * This utility is shared across multiple tests to reduce duplication.
 */
export async function createHttpSocketAndWaitForResponse(
    host: string,
    port: number,
    request: string
): Promise<{
    socket: net.Socket;
    closePromise: Promise<void>;
    responsePromise: Promise<void>;
}> {
    const socket = net.createConnection({
        host,
        port
    });
    socket.setEncoding("utf8");

    const closePromise = new Promise<void>((resolve) => {
        socket.once("close", () => resolve());
    });

    const responsePromise = new Promise<void>((resolve, reject) => {
        let buffer = "";
        const handleData = (chunk: string) => {
            buffer += chunk;
            if (buffer.includes("\r\n\r\n")) {
                socket.off("data", handleData);
                resolve();
            }
        };

        socket.on("data", handleData);
        socket.once("error", reject);
    });

    socket.write(request);

    return {
        socket,
        closePromise,
        responsePromise
    };
}
