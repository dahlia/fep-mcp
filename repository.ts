import { cloneRepository, openRepository } from "es-git";
import type { Repository } from "es-git";
import { basename, dirname, join } from "@std/path";

/** The FEP repository URL */
const FEP_REPO_URL = "https://codeberg.org/fediverse/fep.git";

/** Environment variable for overriding the shared repository directory */
const REPOSITORY_DIR_ENV = "FEP_MCP_REPOSITORY_DIR";

/** Maximum retry attempts for clone operation */
const MAX_RETRIES = 3;

/** Base delay for exponential backoff (ms) */
const BASE_DELAY_MS = 1000;

/** Current repository instance */
let currentRepo: Repository | null = null;

/** Current repository path */
let currentRepoPath: string | null = null;

export interface InitializeRepositoryOptions {
  repositoryDir?: string;
  repositoryUrl?: string;
  onBeforeInstallClone?: (() => Promise<void>) | undefined;
}

/**
 * Removes a path if it exists.
 */
async function removePathIfExists(path: string): Promise<void> {
  try {
    await Deno.remove(path, { recursive: true });
  } catch (error) {
    if (!(error instanceof Deno.errors.NotFound)) {
      console.error(`Warning: Failed to remove ${path}:`, error);
    }
  }
}

/**
 * Checks whether a path exists.
 */
async function pathExists(path: string): Promise<boolean> {
  try {
    await Deno.stat(path);
    return true;
  } catch (error) {
    if (error instanceof Deno.errors.NotFound) {
      return false;
    }
    throw error;
  }
}

/**
 * Delays execution for the specified milliseconds.
 */
function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Gets the user's home directory.
 */
function getHomeDirectory(): string {
  const home = Deno.env.get("HOME") ?? Deno.env.get("USERPROFILE");
  if (!home) {
    throw new Error("Unable to determine the user's home directory.");
  }
  return home;
}

/**
 * Gets the default cache directory for the current platform.
 */
function getDefaultCacheDirectory(): string {
  switch (Deno.build.os) {
    case "windows":
      return Deno.env.get("LOCALAPPDATA") ??
        Deno.env.get("APPDATA") ??
        join(getHomeDirectory(), "AppData", "Local");
    case "darwin":
      return join(getHomeDirectory(), "Library", "Caches");
    default:
      return Deno.env.get("XDG_CACHE_HOME") ??
        join(getHomeDirectory(), ".cache");
  }
}

/**
 * Resolves the shared repository path.
 */
function resolveRepositoryPath(
  options: InitializeRepositoryOptions = {},
): string {
  return options.repositoryDir ??
    Deno.env.get(REPOSITORY_DIR_ENV) ??
    join(getDefaultCacheDirectory(), "fep-mcp", "repository");
}

/**
 * Resolves the repository URL.
 */
function resolveRepositoryUrl(
  options: InitializeRepositoryOptions = {},
): string {
  return options.repositoryUrl ?? FEP_REPO_URL;
}

/**
 * Creates a unique temporary directory beside the shared repository path.
 */
async function createTempCloneDir(repositoryPath: string): Promise<string> {
  await Deno.mkdir(dirname(repositoryPath), { recursive: true });
  return await Deno.makeTempDir({
    dir: dirname(repositoryPath),
    prefix: `${basename(repositoryPath)}.tmp-`,
  });
}

/**
 * Clones the FEP repository with retry logic.
 *
 * @param repoUrl Remote repository URL
 * @param destPath Destination path for the cloned repository
 * @returns The cloned repository instance
 * @throws Error if clone fails after all retries
 */
async function cloneWithRetry(
  repoUrl: string,
  destPath: string,
): Promise<Repository> {
  let lastError: Error | null = null;

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      console.error(
        `Cloning FEP repository into shared cache (attempt ${attempt}/${MAX_RETRIES})...`,
      );
      const repo = await cloneRepository(repoUrl, destPath);
      console.error("FEP repository cloned successfully.");
      return repo;
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      console.error(`Clone attempt ${attempt} failed:`, lastError.message);

      if (attempt < MAX_RETRIES) {
        const delayMs = BASE_DELAY_MS * Math.pow(2, attempt - 1);
        console.error(`Retrying in ${delayMs}ms...`);
        await delay(delayMs);
        await removePathIfExists(destPath);
      }
    }
  }

  throw new Error(
    `Failed to clone FEP repository after ${MAX_RETRIES} attempts: ${lastError?.message}`,
  );
}

/**
 * Opens an existing repository if the shared cache contains a valid clone.
 */
async function openExistingRepository(
  repositoryPath: string,
): Promise<Repository | null> {
  try {
    await Deno.stat(repositoryPath);
  } catch (error) {
    if (error instanceof Deno.errors.NotFound) {
      return null;
    }
    throw error;
  }

  try {
    return await openRepository(repositoryPath);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(
      `Shared repository cache at ${repositoryPath} is invalid; recreating it: ${message}`,
    );
    await removePathIfExists(repositoryPath);
    return null;
  }
}

/**
 * Installs a freshly cloned repository into the shared cache path.
 */
async function installClonedRepository(
  clonePath: string,
  repositoryPath: string,
): Promise<void> {
  if (await pathExists(repositoryPath)) {
    console.error(
      `Shared repository cache at ${repositoryPath} appeared during clone; reusing it.`,
    );

    try {
      await openRepository(repositoryPath);
      await removePathIfExists(clonePath);
      return;
    } catch (openError) {
      const message = openError instanceof Error
        ? openError.message
        : String(openError);
      console.error(
        `Existing shared repository cache was invalid after race; replacing it: ${message}`,
      );
      await removePathIfExists(repositoryPath);
    }
  }

  try {
    await Deno.rename(clonePath, repositoryPath);
  } catch (error) {
    if (
      !(error instanceof Deno.errors.AlreadyExists) &&
      !(await pathExists(repositoryPath))
    ) {
      throw error;
    }

    console.error(
      `Shared repository cache at ${repositoryPath} appeared during clone; reusing it.`,
    );

    try {
      await openRepository(repositoryPath);
    } catch (openError) {
      const message = openError instanceof Error
        ? openError.message
        : String(openError);
      console.error(
        `Existing shared repository cache was invalid after race; replacing it: ${message}`,
      );
      await removePathIfExists(repositoryPath);
      await Deno.rename(clonePath, repositoryPath);
      return;
    }

    await removePathIfExists(clonePath);
  }
}

/**
 * Syncs the working tree to the fetched remote default branch.
 */
async function syncRepositoryToRemoteDefaultBranch(
  repo: Repository,
  repositoryPath: string,
): Promise<Repository> {
  const remote = repo.getRemote("origin");
  await remote.fetch([]);
  repo = await openRepository(repositoryPath);

  const refreshedRemote = repo.getRemote("origin");
  const defaultBranchRef = await refreshedRemote.defaultBranch();
  repo = await openRepository(repositoryPath);

  if (!defaultBranchRef.startsWith("refs/heads/")) {
    throw new Error(
      `Remote default branch has unexpected format: ${defaultBranchRef}`,
    );
  }

  const branchName = defaultBranchRef.slice("refs/heads/".length);
  const remoteTrackingRef = repo.getReference(
    `refs/remotes/origin/${branchName}`,
  )
    .resolve();
  const targetOid = remoteTrackingRef.target();

  if (!targetOid) {
    throw new Error(
      `Remote tracking branch refs/remotes/origin/${branchName} has no target.`,
    );
  }

  repo.setHeadDetached(repo.getCommit(targetOid));
  repo.checkoutHead({ force: true, removeUntracked: true });
  return await openRepository(repositoryPath);
}

/**
 * Initializes the FEP repository using a shared on-disk cache.
 * This should be called on server startup.
 *
 * @returns The shared repository path
 * @throws Error if initialization fails
 */
export async function initializeRepository(
  options: InitializeRepositoryOptions = {},
): Promise<string> {
  currentRepo = null;
  currentRepoPath = null;

  const repositoryPath = resolveRepositoryPath(options);
  const existingRepo = await openExistingRepository(repositoryPath);

  if (existingRepo) {
    currentRepo = existingRepo;
    currentRepoPath = repositoryPath;
    console.error(`Reusing shared FEP repository cache at: ${repositoryPath}`);

    try {
      await refreshRepository();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(
        `Warning: Failed to refresh shared repository cache, continuing with stale data: ${message}`,
      );
    }

    return repositoryPath;
  }

  const tempClonePath = await createTempCloneDir(repositoryPath);

  try {
    await cloneWithRetry(resolveRepositoryUrl(options), tempClonePath);
    await options.onBeforeInstallClone?.();
    await installClonedRepository(tempClonePath, repositoryPath);

    currentRepo = await openRepository(repositoryPath);
    currentRepoPath = repositoryPath;

    return repositoryPath;
  } catch (error) {
    await removePathIfExists(tempClonePath);
    throw error;
  }
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
    console.error("Refreshing shared FEP repository cache...");
    currentRepo = await syncRepositoryToRemoteDefaultBranch(
      currentRepo,
      currentRepoPath,
    );
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

  const fullPath = join(currentRepoPath, relativePath);
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

  const fullPath = join(currentRepoPath, relativePath);
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

  const fullPath = join(currentRepoPath, relativePath);
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
 * Releases in-process repository state on shutdown.
 */
export function cleanupRepository(): void {
  currentRepo = null;
  currentRepoPath = null;
}
