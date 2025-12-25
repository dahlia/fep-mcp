/**
 * FEP status values.
 */
export type FepStatus = "DRAFT" | "FINAL" | "WITHDRAWN";

/**
 * Metadata for a Fediverse Enhancement Proposal.
 * This matches the structure in the FEP repository's index.json.
 */
export interface FepMetadata {
  /** The 4-character hex identifier (e.g., "a4ed") */
  slug: string;
  /** The title of the FEP */
  title: string;
  /** Comma-separated list of authors with their contact info */
  authors: string;
  /** Current status of the FEP */
  status: FepStatus;
  /** Date when the FEP was received (YYYY-MM-DD format) */
  dateReceived: string;
  /** Date when the FEP was finalized (only for FINAL status) */
  dateFinalized?: string;
  /** Date when the FEP was withdrawn (only for WITHDRAWN status) */
  dateWithdrawn?: string;
  /** URL to the tracking issue */
  trackingIssue?: string;
  /** URL to the discussion thread */
  discussionsTo?: string;
  /** Number of known implementations */
  implementations?: number;
}

/**
 * A complete FEP document with content.
 */
export interface FepDocument {
  /** The metadata from the frontmatter */
  metadata: FepMetadata;
  /** The markdown content (without frontmatter) */
  content: string;
}

/**
 * The FEP index structure (from index.json).
 */
export type FepIndex = FepMetadata[];

/**
 * YAML frontmatter parsed from FEP documents.
 * This is the raw parsed data before normalization.
 */
export interface FepFrontmatter {
  slug: string;
  authors: string;
  status: string;
  dateReceived: string | Date;
  dateFinalized?: string | Date;
  dateWithdrawn?: string | Date;
  trackingIssue?: string;
  discussionsTo?: string;
  type?: string;
  relatedFeps?: string;
  replaces?: string;
  replacedBy?: string;
}

/**
 * Search result for FEP search.
 */
export interface FepSearchResult {
  /** The matching FEP metadata */
  fep: FepMetadata;
  /** Relevance score (higher is more relevant) */
  score: number;
  /** Matched text snippet */
  snippet?: string;
}
