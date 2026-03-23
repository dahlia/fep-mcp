import { assert, assertEquals, assertStringIncludes } from "@std/assert";
import { join } from "@std/path";
import {
  cleanupRepository,
  fileExists,
  initializeRepository,
  readFile,
  refreshRepository,
} from "./repository.ts";

const decoder = new TextDecoder();

interface RemoteFixture {
  rootDir: string;
  remoteDir: string;
  sourceDir: string;
}

async function runGit(args: string[], cwd?: string): Promise<string> {
  const command = new Deno.Command("git", {
    args,
    cwd,
    stdout: "piped",
    stderr: "piped",
  });
  const { code, stdout, stderr } = await command.output();

  if (code !== 0) {
    throw new Error(
      `git ${args.join(" ")} failed:\n${decoder.decode(stderr)}`,
    );
  }

  return decoder.decode(stdout).trim();
}

async function writeFixtureDocument(
  sourceDir: string,
  revision: string,
): Promise<void> {
  await Deno.mkdir(join(sourceDir, "fep", "a4ed"), { recursive: true });
  await Deno.writeTextFile(
    join(sourceDir, "index.json"),
    JSON.stringify(
      [
        {
          slug: "a4ed",
          title: `FEP Process ${revision}`,
          status: "FINAL",
          authors: ["Test Author"],
        },
      ],
      null,
      2,
    ),
  );
  await Deno.writeTextFile(
    join(sourceDir, "fep", "a4ed", "fep-a4ed.md"),
    `---\ntitle: FEP Process ${revision}\nstatus: FINAL\nauthors:\n  - Test Author\n---\n\nRevision ${revision}\n`,
  );
}

async function commitChanges(
  sourceDir: string,
  message: string,
): Promise<void> {
  await runGit(["add", "."], sourceDir);
  await runGit([
    "-c",
    "user.name=Test User",
    "-c",
    "user.email=test@example.com",
    "commit",
    "-m",
    message,
  ], sourceDir);
}

async function pushMain(sourceDir: string): Promise<void> {
  await runGit(["push", "origin", "main"], sourceDir);
}

async function createRemoteFixture(
  initialRevision: string,
): Promise<RemoteFixture> {
  const rootDir = await Deno.makeTempDir({ prefix: "fep-mcp-repo-test-" });
  const sourceDir = join(rootDir, "source");
  const remoteDir = join(rootDir, "remote.git");

  await runGit(["init", "-b", "main", sourceDir]);
  await writeFixtureDocument(sourceDir, initialRevision);
  await commitChanges(sourceDir, `revision ${initialRevision}`);
  await runGit(["clone", "--bare", sourceDir, remoteDir], rootDir);
  await runGit(["remote", "add", "origin", remoteDir], sourceDir);
  await runGit(["push", "--set-upstream", "origin", "main"], sourceDir);

  return { rootDir, remoteDir, sourceDir };
}

async function pushRevision(
  fixture: RemoteFixture,
  revision: string,
): Promise<void> {
  await writeFixtureDocument(fixture.sourceDir, revision);
  await commitChanges(fixture.sourceDir, `revision ${revision}`);
  await pushMain(fixture.sourceDir);
}

async function removeFixture(fixture: RemoteFixture): Promise<void> {
  await Deno.remove(fixture.rootDir, { recursive: true });
}

Deno.test("shared repository cache lifecycle", async (t) => {
  await t.step("first startup clones into the shared path", async () => {
    const fixture = await createRemoteFixture("initial");
    const repositoryDir = join(fixture.rootDir, "cache");

    try {
      const repoPath = await initializeRepository({
        repositoryDir,
        repositoryUrl: fixture.remoteDir,
      });

      assertEquals(repoPath, repositoryDir);
      assert(await fileExists("index.json"));
      assertStringIncludes(
        await readFile("fep/a4ed/fep-a4ed.md"),
        "Revision initial",
      );
    } finally {
      await cleanupRepository();
      await removeFixture(fixture);
    }
  });

  await t.step("second startup reuses the same cached repository", async () => {
    const fixture = await createRemoteFixture("initial");
    const repositoryDir = join(fixture.rootDir, "cache");

    try {
      await initializeRepository({
        repositoryDir,
        repositoryUrl: fixture.remoteDir,
      });
      await cleanupRepository();

      const repoPath = await initializeRepository({ repositoryDir });
      assertEquals(repoPath, repositoryDir);
      assertStringIncludes(
        await readFile("fep/a4ed/fep-a4ed.md"),
        "Revision initial",
      );
    } finally {
      await cleanupRepository();
      await removeFixture(fixture);
    }
  });

  await t.step("refresh updates the checked-out files", async () => {
    const fixture = await createRemoteFixture("initial");
    const repositoryDir = join(fixture.rootDir, "cache");

    try {
      await initializeRepository({
        repositoryDir,
        repositoryUrl: fixture.remoteDir,
      });

      await pushRevision(fixture, "updated");
      await refreshRepository();

      assertStringIncludes(await readFile("index.json"), "updated");
      assertStringIncludes(
        await readFile("fep/a4ed/fep-a4ed.md"),
        "Revision updated",
      );
    } finally {
      await cleanupRepository();
      await removeFixture(fixture);
    }
  });

  await t.step(
    "startup falls back to stale cached data when refresh fails",
    async () => {
      const fixture = await createRemoteFixture("initial");
      const repositoryDir = join(fixture.rootDir, "cache");
      const offlineRemoteDir = `${fixture.remoteDir}.offline`;

      try {
        await initializeRepository({
          repositoryDir,
          repositoryUrl: fixture.remoteDir,
        });
        await cleanupRepository();

        await Deno.rename(fixture.remoteDir, offlineRemoteDir);

        const repoPath = await initializeRepository({ repositoryDir });
        assertEquals(repoPath, repositoryDir);
        assertStringIncludes(
          await readFile("fep/a4ed/fep-a4ed.md"),
          "Revision initial",
        );
      } finally {
        await cleanupRepository();
        try {
          await Deno.rename(offlineRemoteDir, fixture.remoteDir);
        } catch {
          // Ignore if the fixture has already been cleaned up.
        }
        await removeFixture(fixture);
      }
    },
  );

  await t.step("startup replaces an invalid shared cache", async () => {
    const fixture = await createRemoteFixture("initial");
    const repositoryDir = join(fixture.rootDir, "cache");

    try {
      await Deno.mkdir(repositoryDir, { recursive: true });
      await Deno.writeTextFile(join(repositoryDir, "not-a-repo.txt"), "broken");

      await initializeRepository({
        repositoryDir,
        repositoryUrl: fixture.remoteDir,
      });

      assertStringIncludes(
        await readFile("fep/a4ed/fep-a4ed.md"),
        "Revision initial",
      );
      await Deno.stat(join(repositoryDir, ".git", "HEAD"));
    } finally {
      await cleanupRepository();
      await removeFixture(fixture);
    }
  });

  await t.step(
    "rename races reuse the repository that won the path",
    async () => {
      const loserFixture = await createRemoteFixture("loser");
      const winnerFixture = await createRemoteFixture("winner");
      const repositoryDir = join(loserFixture.rootDir, "cache");

      try {
        await initializeRepository({
          repositoryDir,
          repositoryUrl: loserFixture.remoteDir,
          onBeforeInstallClone: async () => {
            await runGit(["clone", winnerFixture.remoteDir, repositoryDir]);
          },
        });

        assertStringIncludes(
          await readFile("fep/a4ed/fep-a4ed.md"),
          "Revision winner",
        );
      } finally {
        await cleanupRepository();
        await removeFixture(loserFixture);
        await removeFixture(winnerFixture);
      }
    },
  );
});
