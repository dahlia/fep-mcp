import $ from "@david/dax";

interface Target {
  name: string;
  denoTarget: string;
  ext: string;
  archive: "zip" | "tar.bz2";
}

const TARGETS: Target[] = [
  {
    name: "windows-x86_64",
    denoTarget: "x86_64-pc-windows-msvc",
    ext: ".exe",
    archive: "zip",
  },
  {
    name: "linux-x86_64",
    denoTarget: "x86_64-unknown-linux-gnu",
    ext: "",
    archive: "tar.bz2",
  },
  {
    name: "linux-aarch64",
    denoTarget: "aarch64-unknown-linux-gnu",
    ext: "",
    archive: "tar.bz2",
  },
  {
    name: "darwin-x86_64",
    denoTarget: "x86_64-apple-darwin",
    ext: "",
    archive: "tar.bz2",
  },
  {
    name: "darwin-aarch64",
    denoTarget: "aarch64-apple-darwin",
    ext: "",
    archive: "tar.bz2",
  },
];

const PERMISSIONS = [
  "--allow-ffi",
  "--allow-read",
  "--allow-write",
  "--allow-net",
  "--allow-env",
  "--allow-sys",
];

async function getVersion(): Promise<string> {
  const denoJson = JSON.parse(await Deno.readTextFile("deno.json"));
  return denoJson.version;
}

async function main() {
  const version = await getVersion();
  console.log(`Building fep-mcp v${version}`);

  await $`rm -rf dists`;
  await $`mkdir -p dists`;

  for (const target of TARGETS) {
    const binaryName = `fep-mcp${target.ext}`;
    const archiveName = target.archive === "zip"
      ? `fep-mcp-${version}-${target.name}.zip`
      : `fep-mcp-${version}-${target.name}.tar.bz2`;

    console.log(`\nBuilding for ${target.name}...`);

    await $`deno compile ${PERMISSIONS} --target ${target.denoTarget} -o ${binaryName} main.ts`;

    console.log(`Packaging ${archiveName}...`);

    const files = [binaryName, "README.md", "LICENSE"];
    if (target.archive === "zip") {
      await $`zip dists/${archiveName} ${files}`;
    } else {
      await $`tar -cjf dists/${archiveName} ${files}`;
    }

    await $`rm ${binaryName}`;
  }

  console.log("\nDone! Archives created in dists/:");
  await $`ls -la dists/`;
}

main();
