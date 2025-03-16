import { Message } from "capnp-es";
import { CodeGeneratorRequest } from "./lib/capnp/schema.ts";
import { SchemaChange, SchemaDiff } from "./lib/capnp/schema-diff.ts";
import { convertToStruct, type ValueFor } from "./lib/internal/convert.ts";
import { SchemaDiffer } from "./lib/internal/schema-differ.ts";
import { locateChanges } from "./lib/internal/locate-changes.ts";

export { CodeGeneratorRequest, SchemaChange, SchemaDiff };
export { changeToString } from "./lib/to-string.ts";
export { changeToJson } from "./lib/to-json.ts";

/**
 * Compares all the files in the given {@linkcode CodeGeneratorRequest}s, yielding all detected
 * schema changes as a {@linkcode SchemaDiff}. Changes will be ordered by file name, and then
 * position in each file.
 */
export function schemaDiff(
  source: CodeGeneratorRequest,
  target: CodeGeneratorRequest,
): SchemaDiff {
  // Compute changes.
  const allChanges: ValueFor<SchemaChange>[] = [];
  const schemaDiffer = new SchemaDiffer(
    source,
    target,
    (change) => allChanges.push(change),
  );

  schemaDiffer.diffSchemas();

  // Sort changes by position.
  const changedFileNames = schemaDiffer.changedFileNamesById;

  allChanges.sort((a, b) => {
    const aFileName = changedFileNames.get(a.fileId!)!;
    const bFileName = changedFileNames.get(b.fileId!)!;
    const fileNameComparison = aFileName.localeCompare(bFileName);

    if (fileNameComparison !== 0) {
      return fileNameComparison;
    }

    return a.startByte! - b.startByte!;
  });

  // Convert changes to structs.
  const message = new Message();
  const root = message.initRoot(SchemaDiff);
  const realChanges = root._initChanges(allChanges.length);

  for (let i = 0; i < allChanges.length; i++) {
    convertToStruct(realChanges.get(i), allChanges[i]);
  }

  // Add file names.
  const files = root._initFiles(changedFileNames.size);
  let i = 0;

  for (const [id, name] of changedFileNames) {
    const file = files.get(i++);
    file.id = id;
    file.path = name;
  }

  return root;
}

/**
 * Same as {@linkcode schemaDiff()}, but also provides the source information for each change.
 */
export async function schemaDiffWithSourceInfo(
  source: CodeGeneratorRequest,
  target: CodeGeneratorRequest,
  options?: {
    snippets?: boolean;
  },
): Promise<SchemaDiff> {
  const diff = schemaDiff(source, target);

  await locateChanges(diff.changes, {
    fileMap: new Map(diff.files.map((file) => [file.id, file.path])),
    snippets: options?.snippets,
  });

  return diff;
}

/**
 * Loads the schema of all the given Cap'n Proto files as a {@linkcode CodeGeneratorRequest}.
 *
 * `capnp` needs to be installed and available in the system path. Alternatively, its path can be
 * specified using the `capnpPath` option.
 */
export async function loadCapnpSchema(
  capnpPaths: readonly string[],
  options?: {
    capnpPath?: string;
    importPaths?: readonly string[];
    noStandardImports?: boolean;
  },
): Promise<CodeGeneratorRequest> {
  const { capnpPath = "capnp", importPaths = [], noStandardImports = false } =
    options ?? {};

  const { code, stdout, stderr } = await new Deno.Command(capnpPath, {
    args: [
      "compile",
      "--output=-",
      ...importPaths.map((path) => `--import-path=${path}`),
      ...(noStandardImports ? ["--no-standard-import"] : []),
      ...capnpPaths,
    ],
  }).output();

  if (code !== 0) {
    throw new Error(
      `capnp compile failed with code ${code}:\n${
        new TextDecoder().decode(stderr)
      }`,
    );
  }

  const message = new Message(
    stdout,
    /*packed=*/ false,
    /*singleSegment=*/ false,
  );

  return message.getRoot(CodeGeneratorRequest);
}
