import net from "node:net";

export async function findAvailablePort(host = "127.0.0.1"): Promise<number> {
    return new Promise((resolve, reject) => {
        const server = net.createServer();

        server.once("error", (error) => {
            reject(error);
        });

        server.listen(0, host, () => {
            const address = server.address();
            if (!address || typeof address === "string") {
                server.close(() => reject(new Error("Failed to resolve test port.")));
                return;
            }

            const port = address.port;
            server.close((error) => {
                if (error) {
                    reject(error);
                    return;
                }
                resolve(port);
            });
        });
    });
}
