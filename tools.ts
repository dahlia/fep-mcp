import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { FepIndex, FepMetadata, FepSearchResult } from "./types.ts";
import { readFile, refreshRepository } from "./repository.ts";
import { parseFrontmatter } from "./yaml.ts";

/**
 * Loads the FEP index from index.json.
 */
async function loadIndex(): Promise<FepIndex> {
  const content = await readFile("index.json");
  return JSON.parse(content) as FepIndex;
}

/**
 * Gets a specific FEP document by slug.
 */
async function getFepDocument(
  slug: string,
  index: FepIndex,
): Promise<{ metadata: FepMetadata; content: string }> {
  const indexEntry = index.find((fep) => fep.slug === slug);
  if (!indexEntry) {
    throw new Error(`FEP not found: ${slug}`);
  }

  const docPath = `fep/${slug}/fep-${slug}.md`;
  const content = await readFile(docPath);
  const { metadata, body } = parseFrontmatter(content, indexEntry.title);

  // Merge index metadata with parsed metadata (index is more reliable)
  const mergedMetadata: FepMetadata = {
    ...metadata,
    title: indexEntry.title,
    implementations: indexEntry.implementations,
  };

  return { metadata: mergedMetadata, content: body };
}

/**
 * Simple text search scoring.
 */
function calculateScore(text: string, query: string): number {
  const lowerText = text.toLowerCase();
  const lowerQuery = query.toLowerCase();
  const words = lowerQuery.split(/\s+/).filter((w) => w.length > 0);

  let score = 0;
  for (const word of words) {
    if (lowerText.includes(word)) {
      score += 1;
      // Bonus for exact phrase match
      if (lowerText.includes(lowerQuery)) {
        score += 2;
      }
    }
  }
  return score;
}

/**
 * Gets a text snippet around the first match.
 */
function getSnippet(text: string, query: string, maxLength = 200): string {
  const lowerText = text.toLowerCase();
  const lowerQuery = query.toLowerCase();
  const words = lowerQuery.split(/\s+/).filter((w) => w.length > 0);

  let firstMatchIndex = -1;
  for (const word of words) {
    const idx = lowerText.indexOf(word);
    if (idx !== -1 && (firstMatchIndex === -1 || idx < firstMatchIndex)) {
      firstMatchIndex = idx;
    }
  }

  if (firstMatchIndex === -1) {
    return text.substring(0, maxLength) +
      (text.length > maxLength ? "..." : "");
  }

  const start = Math.max(0, firstMatchIndex - 50);
  const end = Math.min(text.length, start + maxLength);
  let snippet = text.substring(start, end);

  if (start > 0) snippet = "..." + snippet;
  if (end < text.length) snippet = snippet + "...";

  return snippet;
}

/**
 * Registers all FEP tools with the MCP server.
 */
export function registerTools(server: McpServer): void {
  // Tool: list_feps
  server.tool(
    "list_feps",
    "List all Fediverse Enhancement Proposals with their metadata",
    {
      status: z
        .enum(["DRAFT", "FINAL", "WITHDRAWN"])
        .optional()
        .describe("Filter by FEP status"),
    },
    async ({ status }) => {
      try {
        const index = await loadIndex();

        let feps = index;
        if (status) {
          feps = index.filter((fep) => fep.status === status);
        }

        const result = feps.map((fep) => ({
          slug: fep.slug,
          title: fep.title,
          status: fep.status,
          authors: fep.authors,
          dateReceived: fep.dateReceived,
          dateFinalized: fep.dateFinalized,
          dateWithdrawn: fep.dateWithdrawn,
        }));

        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify(result, null, 2),
            },
          ],
        };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return {
          content: [{ type: "text" as const, text: `Error: ${message}` }],
          isError: true,
        };
      }
    },
  );

  // Tool: get_fep
  server.tool(
    "get_fep",
    "Get a specific FEP document by its slug identifier",
    {
      slug: z
        .string()
        .regex(/^[0-9a-f]{4}$/)
        .describe("The 4-character hex FEP identifier (e.g., 'a4ed')"),
    },
    async ({ slug }) => {
      try {
        const index = await loadIndex();
        const { metadata, content } = await getFepDocument(slug, index);

        const result = {
          metadata,
          content,
        };

        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify(result, null, 2),
            },
          ],
        };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return {
          content: [{ type: "text" as const, text: `Error: ${message}` }],
          isError: true,
        };
      }
    },
  );

  // Tool: search_feps
  server.tool(
    "search_feps",
    "Search FEPs by title, author, or content",
    {
      query: z.string().describe("Search query"),
    },
    async ({ query }) => {
      try {
        const index = await loadIndex();
        const results: FepSearchResult[] = [];

        for (const fep of index) {
          // Score based on title and authors
          let score = calculateScore(fep.title, query) * 3; // Title weight
          score += calculateScore(fep.authors, query) * 2; // Author weight

          // Try to search content if score is low
          let snippet: string | undefined;
          if (score > 0) {
            try {
              const docPath = `fep/${fep.slug}/fep-${fep.slug}.md`;
              const content = await readFile(docPath);
              const contentScore = calculateScore(content, query);
              if (contentScore > 0) {
                score += contentScore;
                snippet = getSnippet(content, query);
              }
            } catch {
              // Ignore if we can't read the content
            }
          } else {
            // If no title/author match, still search content
            try {
              const docPath = `fep/${fep.slug}/fep-${fep.slug}.md`;
              const content = await readFile(docPath);
              const contentScore = calculateScore(content, query);
              if (contentScore > 0) {
                score = contentScore;
                snippet = getSnippet(content, query);
              }
            } catch {
              // Ignore if we can't read the content
            }
          }

          if (score > 0) {
            results.push({ fep, score, snippet });
          }
        }

        // Sort by score descending
        results.sort((a, b) => b.score - a.score);

        // Return top 20 results
        const topResults = results.slice(0, 20);

        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify(topResults, null, 2),
            },
          ],
        };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return {
          content: [{ type: "text" as const, text: `Error: ${message}` }],
          isError: true,
        };
      }
    },
  );

  // Tool: refresh_repository
  server.tool(
    "refresh_repository",
    "Pull the latest FEP documents from the repository",
    {},
    async () => {
      try {
        await refreshRepository();
        return {
          content: [
            {
              type: "text" as const,
              text: "FEP repository refreshed successfully.",
            },
          ],
        };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return {
          content: [{ type: "text" as const, text: `Error: ${message}` }],
          isError: true,
        };
      }
    },
  );
}
