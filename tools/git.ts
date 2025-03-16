#!/usr/bin/env -S deno run --allow-read --allow-run --allow-write
import { join, relative } from "node:path";
import type { CodeGeneratorRequest } from "../lib/capnp/schema.ts";
import { baseCommand, displayChanges } from "../lib/internal/cli.ts";
import { loadCapnpSchema, schemaDiffWithSourceInfo } from "../mod.ts";

if (import.meta.main) {
  const { options } = await baseCommand(
    "capnp-diff-git",
    "Compares two Cap'n Proto schemas on different Git revisions.",
  )
    .group("Common options")
    .option(
      "--files <files:file[]>",
      ".capnp files to compare in both old and new revisions.",
      {
        collect: true,
      },
    )
    .option(
      "--import-path <import-path:string>",
      "The import path used to process --files.",
      {
        collect: true,
      },
    )
    .group("Old schema options")
    .option(
      "--old-rev <old-revision:string>",
      "The old Git revision.\nIf unspecified, use the file system.",
    )
    .option("--old-files <old-files:file[]>", "The old .capnp files.", {
      collect: true,
    })
    .option(
      "--old-import-path <old-import-path:string>",
      "The import path used to process --old-files.",
      {
        collect: true,
        depends: ["old-files"],
      },
    )
    .group("New schema options")
    .option(
      "--new-rev <new-revision:string>",
      "The new Git revision.\nIf unspecified, use the file system.",
    )
    .option("--new-files <new-files:file[]>", "The new .capnp files.", {
      collect: true,
    })
    .option(
      "--new-import-path <new-import-path:string>",
      "The import path used to process --new-files.",
      {
        collect: true,
        depends: ["new-files"],
      },
    )
    .parse(Deno.args);

  if (options.oldRev === undefined && options.newRev === undefined) {
    console.error(
      "Error: At least one of --old-rev or --new-rev must be given.",
    );
    Deno.exit(1);
  }

  const [oldSchema, newSchema] = await Promise.all([
    loadSchema({
      capnpPath: options.capnpPath,
      commonCapnpPaths: options.files,
      commonImportPaths: options.importPath,
      capnpPaths: options.oldFiles,
      importPaths: options.oldImportPath,
      rev: options.oldRev,
    }),
    loadSchema({
      capnpPath: options.capnpPath,
      commonCapnpPaths: options.files,
      commonImportPaths: options.importPath,
      capnpPaths: options.newFiles,
      importPaths: options.newImportPath,
      rev: options.newRev,
    }),
  ]);

  const diff = await schemaDiffWithSourceInfo(oldSchema, newSchema, {
    snippets: options.format === "text",
  });

  await displayChanges(diff, {
    format: options.format,
    breakage: options.breakage,
  });
}

async function loadSchema(
  options: {
    commonCapnpPaths?: readonly string[][];
    commonImportPaths?: readonly string[];
    capnpPaths?: readonly string[][];
    importPaths?: readonly string[];
    rev?: string;
    capnpPath?: string;
  },
): Promise<CodeGeneratorRequest> {
  const {
    commonCapnpPaths,
    commonImportPaths,
    capnpPaths,
    importPaths,
    rev,
    capnpPath,
  } = options;

  const allCapnpPaths = [...capnpPaths ?? [], ...commonCapnpPaths ?? []].flat();
  const allImportPaths = [...importPaths ?? [], ...commonImportPaths ?? []];

  if (rev === undefined) {
    return await loadCapnpSchema(allCapnpPaths, {
      capnpPath,
      importPaths: allImportPaths,
    });
  }

  const cwdDir = Deno.cwd();
  const tmpDir = await Deno.makeTempDir({ prefix: "capnp-diff-git-" });

  await using _ = {
    async [Symbol.asyncDispose]() {
      await Deno.remove(tmpDir, { recursive: true });
    },
  };

  let code: number;

  // Create clone to local directory.
  ({ code } = await new Deno.Command("git", {
    args: ["clone", cwdDir, "--no-checkout", "."],
    stdout: "piped",
    stderr: "piped",
    cwd: tmpDir,
  }).output());

  if (code !== 0) {
    console.error(`Failed to create Git clone`);
    Deno.exit(1);
  }

  ({ code } = await new Deno.Command("git", {
    args: ["checkout", rev, "--", ...allCapnpPaths],
    stdout: "piped",
    stderr: "piped",
    cwd: tmpDir,
  }).output());

  if (code !== 0) {
    console.error(`Failed to checkout files via Git`);
    Deno.exit(1);
  }

  const absoluteCapnpPaths = allCapnpPaths.map((path) =>
    join(tmpDir, relative(cwdDir, path))
  );
  const absoluteImportPaths = allImportPaths.map((path) =>
    join(tmpDir, relative(cwdDir, path))
  );

  return await loadCapnpSchema(absoluteCapnpPaths, {
    capnpPath,
    importPaths: absoluteImportPaths,
  });
}
