import { Command, EnumType } from "jsr:@cliffy/command@1.0.0-rc.7";
import {
  bold,
  brightGreen as infoColor,
  brightRed as errorColor,
  brightYellow as warningColor,
  dim,
} from "@std/fmt/colors";
import { SchemaChange, SchemaDiff } from "../capnp/schema-diff.ts";
import { changeToJson } from "../to-json.ts";
import { changeToString } from "../to-string.ts";

/**
 * Returns a default {@linkcode Command} which can be built upon for command line tools.
 */
export function baseCommand(name: string, description: string) {
  return new Command()
    .name(name)
    .version("0.1.0")
    .description(description)
    .type("format", new EnumType(["json", "text", "binary"]))
    .type("breakage", new EnumType(["none", "code", "wire"]))
    .option(
      "--capnp-path <capnp-path:string>",
      "The path to the `capnp` executable.\nUnused if both --old-schema and --new-schema are given.",
      {
        default: "capnp",
      },
    )
    .option("--format <format:format>", "The output format.", {
      default: "text",
    })
    .option(
      "--breakage <breakage:breakage>",
      "The minimum breakage to display.",
      {
        default: "code",
      },
    );
}

/**
 * Displays the given changes as specified in the CLI.
 */
export async function displayChanges(
  diff: SchemaDiff,
  options: {
    format: "json" | "text" | "binary";
    breakage: "none" | "code" | "wire";
  },
) {
  const minBreakage = {
    none: SchemaChange.Breakage.NONE,
    code: SchemaChange.Breakage.CODE,
    wire: SchemaChange.Breakage.WIRE,
  }[options.breakage];
  const filteredChanges = diff.changes.filter((change) =>
    change.breakage >= minBreakage
  );

  if (options.format === "binary") {
    await Deno.stdout.write(
      new Uint8Array(diff.segment.message.toArrayBuffer()),
    );
    return;
  }

  const fileMap = new Map(diff.files.map((file) => [file.id, file.path]));

  if (options.format === "json") {
    const jsonChanges = filteredChanges.map((change) =>
      changeToJson(change, { fileMap })
    );

    console.log(JSON.stringify(jsonChanges, undefined, 2));
  } else {
    for (const change of filteredChanges) {
      printChange(change, fileMap);
      console.log();
    }

    const s = filteredChanges.length > 1 ? "s" : "";
    console.error(`${filteredChanges.length} change${s} found.`);
  }
}

function printChange(
  change: SchemaChange,
  fileMap: ReadonlyMap<bigint, string>,
): void {
  let breakageText = "No breakage";
  let breakageColor = infoColor;

  switch (change.breakage) {
    case SchemaChange.Breakage.NONE:
      break;
    case SchemaChange.Breakage.CODE:
      breakageText = "Code breakage";
      breakageColor = warningColor;
      break;
    case SchemaChange.Breakage.WIRE:
      breakageText = "Wire breakage";
      breakageColor = errorColor;
      break;
  }

  console.log(
    `${
      breakageColor(
        `[C${change.which().toString().padStart(2, "0")}] ${breakageText}`,
      )
    }: ${changeToString(change, { highlight: bold })}`,
  );

  const sourceInfo = change.sourceInfo;
  const snippet = sourceInfo.snippet;

  if (snippet.lines.length !== 0) {
    const snippetStartLine = snippet.startLine;
    const snippetEndLine = snippetStartLine +
      snippet.lines.length;
    const maxLineNumberLength = snippetEndLine.toString().length;

    const file = fileMap.get(change.fileId);
    const startPosition = sourceInfo.startPosition;

    console.log(
      `\n${
        " ".repeat(maxLineNumberLength)
      } > ${file}:${startPosition.line}:${startPosition.column}:`,
    );

    const changeStartLine = startPosition.line;

    for (let i = 0; i < snippet.lines.length; i++) {
      const snippetLine = snippet.lines[i];
      const snippetLineNumber = (snippetStartLine + i).toString()
        .padEnd(maxLineNumberLength);
      const text = `${snippetLineNumber} | ${snippetLine}`;

      console.log(
        snippetStartLine + i === changeStartLine ? text : dim(text),
      );
    }
  }
}
