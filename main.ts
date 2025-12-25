import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { cleanupRepository, initializeRepository } from "./repository.ts";
import { registerTools } from "./tools.ts";
import { registerResources } from "./resources.ts";

/**
 * FEP MCP Server
 *
 * An MCP server that provides access to Fediverse Enhancement Proposals (FEPs).
 * On startup, it clones the FEP repository from Codeberg and exposes tools
 * and resources for reading and searching FEP documents.
 */

const SERVER_NAME = "fep-mcp";
const SERVER_VERSION = "0.1.0";

/**
 * Main entry point for the FEP MCP server.
 */
async function main(): Promise<void> {
  // Initialize the FEP repository
  console.error(`${SERVER_NAME} v${SERVER_VERSION} starting...`);

  try {
    const repoPath = await initializeRepository();
    console.error(`FEP repository initialized at: ${repoPath}`);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`Failed to initialize FEP repository: ${message}`);
    Deno.exit(1);
  }

  // Create MCP server
  const server = new McpServer({
    name: SERVER_NAME,
    version: SERVER_VERSION,
  });

  // Register tools and resources
  registerTools(server);
  registerResources(server);

  // Set up stdio transport
  const transport = new StdioServerTransport();

  // Handle graceful shutdown
  const shutdown = async () => {
    console.error("Shutting down...");
    await cleanupRepository();
    Deno.exit(0);
  };

  Deno.addSignalListener("SIGINT", shutdown);
  Deno.addSignalListener("SIGTERM", shutdown);

  // Connect and start serving
  console.error("MCP server ready, waiting for connections...");
  await server.connect(transport);
}

// Run the server
main().catch((error) => {
  console.error("Fatal error:", error);
  Deno.exit(1);
});
