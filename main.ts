#!/usr/bin/env -S deno run --allow-read --allow-run
import { Message } from "capnp-es";
import { baseCommand, displayChanges } from "./lib/internal/cli.ts";
import {
  CodeGeneratorRequest,
  loadCapnpSchema,
  schemaDiffWithSourceInfo,
} from "./mod.ts";

if (import.meta.main) {
  const { options } = await baseCommand(
    "capnp-diff",
    "Compares two Cap'n Proto schemas.",
  )
    .group("Old schema options")
    .option(
      "--old-schema <old-schema:file>",
      "The old schema encoded as a `CodeGeneratorRequest`.",
    )
    .option("--old-files <old-files:file[]>", "The old .capnp files.", {
      collect: true,
      conflicts: ["old-schema"],
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
    .option("--new-files <new-files:file[]>", "The new .capnp files.", {
      collect: true,
      conflicts: ["new-schema"],
    })
    .option(
      "--new-schema <new-schema:file>",
      "The new schema encoded as a `CodeGeneratorRequest`.",
    )
    .option(
      "--new-import-path <new-import-path:string>",
      "The import path used to process --new-files.",
      {
        collect: true,
        depends: ["new-files"],
      },
    )
    .parse(Deno.args);

  if (options.oldSchema === undefined && options.oldFiles === undefined) {
    console.error(
      "Error: Exactly one of --old-schema or --old-files must be given.",
    );
    Deno.exit(1);
  }
  if (options.newSchema === undefined && options.newFiles === undefined) {
    console.error(
      "Error: Exactly one of --new-schema or --new-files must be given.",
    );
    Deno.exit(1);
  }

  const [oldSchema, newSchema] = await Promise.all([
    loadSchema({
      capnpPath: options.capnpPath,
      capnpPaths: options.oldFiles?.flat() ?? [],
      importPaths: options.oldImportPath,
      schemaPath: options.oldSchema,
    }),
    loadSchema({
      capnpPath: options.capnpPath,
      capnpPaths: options.newFiles?.flat() ?? [],
      importPaths: options.newImportPath,
      schemaPath: options.newSchema,
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

async function loadSchema(options: {
  capnpPath: string;
  capnpPaths: string[];
  importPaths?: string[];
  schemaPath?: string;
}): Promise<CodeGeneratorRequest> {
  const { capnpPath, capnpPaths, importPaths, schemaPath } = options;

  if (schemaPath !== undefined) {
    const schemaBytes = await Deno.readFile(schemaPath);
    const message = new Message(
      schemaBytes,
      /*packed=*/ false,
      /*singleSegment=*/ false,
    );
    return message.getRoot(CodeGeneratorRequest);
  }

  return await loadCapnpSchema(capnpPaths, {
    capnpPath,
    importPaths,
  });
}
