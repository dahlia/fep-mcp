import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { FepIndex } from "./types.ts";
import { readFile } from "./repository.ts";
import { parseFrontmatter } from "./yaml.ts";

/**
 * Loads the FEP index from index.json.
 */
async function loadIndex(): Promise<FepIndex> {
  const content = await readFile("index.json");
  return JSON.parse(content) as FepIndex;
}

/**
 * Registers all FEP resources with the MCP server.
 */
export function registerResources(server: McpServer): void {
  // Resource: fep://index
  server.resource(
    "fep://index",
    "The complete FEP index with metadata for all Fediverse Enhancement Proposals",
    async () => {
      try {
        const index = await loadIndex();
        return {
          contents: [
            {
              uri: "fep://index",
              mimeType: "application/json",
              text: JSON.stringify(index, null, 2),
            },
          ],
        };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        throw new Error(`Failed to load FEP index: ${message}`);
      }
    },
  );

  // Resource template: fep://{slug}
  server.resource(
    "fep://{slug}",
    "A specific FEP document by its slug identifier",
    async (uri) => {
      try {
        // Extract slug from URI
        const match = uri.href.match(/^fep:\/\/([0-9a-f]{4})$/);
        if (!match) {
          throw new Error(
            `Invalid FEP URI: ${uri.href}. Expected format: fep://{4-char-hex-slug}`,
          );
        }
        const slug = match[1];

        // Load index to get the title
        const index = await loadIndex();
        const indexEntry = index.find((fep) => fep.slug === slug);
        if (!indexEntry) {
          throw new Error(`FEP not found: ${slug}`);
        }

        // Read the document
        const docPath = `fep/${slug}/fep-${slug}.md`;
        const content = await readFile(docPath);
        const { metadata, body } = parseFrontmatter(content, indexEntry.title);

        // Combine metadata and body
        const result = {
          metadata: {
            ...metadata,
            title: indexEntry.title,
            implementations: indexEntry.implementations,
          },
          content: body,
        };

        return {
          contents: [
            {
              uri: uri.href,
              mimeType: "application/json",
              text: JSON.stringify(result, null, 2),
            },
          ],
        };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        throw new Error(`Failed to load FEP: ${message}`);
      }
    },
  );
}
