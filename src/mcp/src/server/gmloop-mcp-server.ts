import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";

/**
 * Stable identity used by MCP clients when they connect to the GMLoop MCP server.
 */
export type GmloopMcpServerMetadata = Readonly<{
    name: string;
    version: string;
}>;

export const GMLOOP_MCP_SERVER_METADATA: GmloopMcpServerMetadata = Object.freeze({
    name: "gmloop-mcp",
    version: "0.0.1"
});

/**
 * Create the GMLoop MCP server instance.
 *
 * Tool registration will be generated from the CLI command catalog as part of
 * the follow-up implementation described in the workspace README.
 */
export function createGmloopMcpServer(): McpServer {
    return new McpServer(GMLOOP_MCP_SERVER_METADATA);
}

/**
 * Start the GMLoop MCP server over stdio for local agent integrations.
 */
export async function runGmloopMcpStdioServer(): Promise<void> {
    const server = createGmloopMcpServer();
    const transport = new StdioServerTransport();

    await server.connect(transport);
}
