import { parse } from "@std/yaml";
import type { FepFrontmatter, FepMetadata, FepStatus } from "./types.ts";

/**
 * Result of parsing FEP document frontmatter.
 */
export interface ParsedFepDocument {
  /** Parsed and normalized metadata */
  metadata: FepMetadata;
  /** The markdown content without frontmatter */
  body: string;
}

/**
 * Formats a date value to YYYY-MM-DD string.
 */
function formatDate(value: string | Date | undefined): string | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (value instanceof Date) {
    return value.toISOString().split("T")[0];
  }
  return value;
}

/**
 * Validates and normalizes the FEP status.
 */
function normalizeStatus(status: string): FepStatus {
  const normalized = status.toUpperCase();
  if (
    normalized === "DRAFT" || normalized === "FINAL" ||
    normalized === "WITHDRAWN"
  ) {
    return normalized;
  }
  // Default to DRAFT for unknown statuses
  return "DRAFT";
}

/**
 * Parses YAML frontmatter from a FEP markdown document.
 *
 * FEP documents have YAML frontmatter between `---` markers at the start:
 *
 * ```markdown
 * ---
 * slug: "a4ed"
 * authors: Author Name <email@example.com>
 * status: FINAL
 * dateReceived: 2020-10-16
 * ---
 * # FEP-a4ed: Title
 *
 * Content here...
 * ```
 *
 * @param content The full markdown document content
 * @param titleFromIndex Optional title from index.json (more reliable)
 * @returns Parsed metadata and body content
 */
export function parseFrontmatter(
  content: string,
  titleFromIndex?: string,
): ParsedFepDocument {
  const frontmatterRegex = /^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/;
  const match = content.match(frontmatterRegex);

  if (!match) {
    throw new Error("Invalid FEP document: missing YAML frontmatter");
  }

  const yamlContent = match[1];
  const body = match[2];

  const parsed = parse(yamlContent) as FepFrontmatter;

  // Extract title from the first heading if not provided
  let title = titleFromIndex;
  if (!title) {
    const titleMatch = body.match(/^#\s+FEP-[0-9a-f]{4}:\s*(.+)$/m);
    if (titleMatch) {
      title = titleMatch[1].trim();
    } else {
      // Fallback: use the first heading
      const headingMatch = body.match(/^#\s+(.+)$/m);
      title = headingMatch ? headingMatch[1].trim() : `FEP-${parsed.slug}`;
    }
  }

  const metadata: FepMetadata = {
    slug: parsed.slug,
    title,
    authors: parsed.authors,
    status: normalizeStatus(parsed.status),
    dateReceived: formatDate(parsed.dateReceived) ?? "",
    dateFinalized: formatDate(parsed.dateFinalized),
    dateWithdrawn: formatDate(parsed.dateWithdrawn),
    trackingIssue: parsed.trackingIssue,
    discussionsTo: parsed.discussionsTo,
  };

  return { metadata, body };
}
