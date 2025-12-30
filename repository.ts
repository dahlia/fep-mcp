import { cloneRepository, openRepository } from "es-git";
import type { Repository } from "es-git";

/** The FEP repository URL */
const FEP_REPO_URL = "https://codeberg.org/fediverse/fep.git";

/** Maximum retry attempts for clone operation */
const MAX_RETRIES = 3;

/** Base delay for exponential backoff (ms) */
const BASE_DELAY_MS = 1000;

/** Current repository instance */
let currentRepo: Repository | null = null;

/** Current repository path */
let currentRepoPath: string | null = null;

/**
 * Creates a unique temporary directory for the FEP repository.
 */
async function createTempDir(): Promise<string> {
  return await Deno.makeTempDir({ prefix: "fep-mcp-" });
}

/**
 * Cleans up the old repository directory if it exists.
 */
async function cleanupOldRepo(path: string): Promise<void> {
  try {
    await Deno.remove(path, { recursive: true });
  } catch (error) {
    // Ignore errors if the directory doesn't exist
    if (!(error instanceof Deno.errors.NotFound)) {
      console.error(`Warning: Failed to cleanup old repo at ${path}:`, error);
    }
  }
}

/**
 * Delays execution for the specified milliseconds.
 */
function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Clones the FEP repository with retry logic.
 *
 * @param destPath Destination path for the cloned repository
 * @returns The cloned repository instance
 * @throws Error if clone fails after all retries
 */
async function cloneWithRetry(destPath: string): Promise<Repository> {
  let lastError: Error | null = null;

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      console.error(
        `Cloning FEP repository (attempt ${attempt}/${MAX_RETRIES})...`,
      );
      const repo = await cloneRepository(FEP_REPO_URL, destPath);
      console.error("FEP repository cloned successfully.");
      return repo;
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      console.error(`Clone attempt ${attempt} failed:`, lastError.message);

      if (attempt < MAX_RETRIES) {
        const delayMs = BASE_DELAY_MS * Math.pow(2, attempt - 1);
        console.error(`Retrying in ${delayMs}ms...`);
        await delay(delayMs);

        // Clean up failed clone attempt
        await cleanupOldRepo(destPath);
      }
    }
  }

  throw new Error(
    `Failed to clone FEP repository after ${MAX_RETRIES} attempts: ${lastError?.message}`,
  );
}

/**
 * Initializes the FEP repository by cloning it to a temporary directory.
 * This should be called on server startup.
 *
 * @returns The path to the cloned repository
 * @throws Error if initialization fails
 */
export async function initializeRepository(): Promise<string> {
  // Clean up previous repo if exists
  if (currentRepoPath) {
    await cleanupOldRepo(currentRepoPath);
    currentRepo = null;
    currentRepoPath = null;
  }

  const repoPath = await createTempDir();
  currentRepo = await cloneWithRetry(repoPath);
  currentRepoPath = repoPath;

  return repoPath;
}

/**
 * Gets the current repository path.
 *
 * @returns The repository path or null if not initialized
 */
export function getRepositoryPath(): string | null {
  return currentRepoPath;
}

/**
 * Refreshes the repository by fetching the latest changes from origin.
 *
 * @throws Error if refresh fails
 */
export async function refreshRepository(): Promise<void> {
  if (!currentRepo || !currentRepoPath) {
    throw new Error(
      "Repository not initialized. Call initializeRepository() first.",
    );
  }

  try {
    console.error("Fetching latest FEP documents...");
    const remote = currentRepo.getRemote("origin");
    await remote.fetch([]);

    // Re-open the repository to get the latest state
    currentRepo = await openRepository(currentRepoPath);
    console.error("FEP repository refreshed successfully.");
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Failed to refresh repository: ${message}`);
  }
}

/**
 * Reads a file from the repository.
 *
 * @param relativePath Path relative to the repository root
 * @returns The file content as a string
 * @throws Error if the file cannot be read
 */
export async function readFile(relativePath: string): Promise<string> {
  if (!currentRepoPath) {
    throw new Error(
      "Repository not initialized. Call initializeRepository() first.",
    );
  }

  const fullPath = `${currentRepoPath}/${relativePath}`;
  try {
    return await Deno.readTextFile(fullPath);
  } catch (error) {
    if (error instanceof Deno.errors.NotFound) {
      throw new Error(`File not found: ${relativePath}`);
    }
    throw error;
  }
}

/**
 * Checks if a file exists in the repository.
 *
 * @param relativePath Path relative to the repository root
 * @returns true if the file exists
 */
export async function fileExists(relativePath: string): Promise<boolean> {
  if (!currentRepoPath) {
    return false;
  }

  const fullPath = `${currentRepoPath}/${relativePath}`;
  try {
    await Deno.stat(fullPath);
    return true;
  } catch {
    return false;
  }
}

/**
 * Lists files in a directory within the repository.
 *
 * @param relativePath Path relative to the repository root
 * @returns Array of file/directory names
 */
export async function listDirectory(relativePath: string): Promise<string[]> {
  if (!currentRepoPath) {
    throw new Error(
      "Repository not initialized. Call initializeRepository() first.",
    );
  }

  const fullPath = `${currentRepoPath}/${relativePath}`;
  const entries: string[] = [];

  try {
    for await (const entry of Deno.readDir(fullPath)) {
      entries.push(entry.name);
    }
  } catch (error) {
    if (error instanceof Deno.errors.NotFound) {
      throw new Error(`Directory not found: ${relativePath}`);
    }
    throw error;
  }

  return entries;
}

/**
 * Cleans up the repository on shutdown.
 */
export async function cleanupRepository(): Promise<void> {
  if (currentRepoPath) {
    await cleanupOldRepo(currentRepoPath);
    currentRepo = null;
    currentRepoPath = null;
  }
}
