import { SchemaChange } from "../capnp/schema-diff.ts";

/**
 * Given a list of changes, determines their locations in their respective files and sets their
 * {@linkcode LocatedChange.sourceInfo} properties, updating them in-place.
 *
 * If `options.snippet` is provided, snippets will be provided for all changes.
 *
 * If files cannot be determined or read for a change, their `sourceInfo` will not be updated.
 *
 * This function is designed to work on batches of changes in order to only read and process files
 * once when determining locations and snippets.
 */
export async function locateChanges(
  changes: Iterable<SchemaChange>,
  options: {
    fileMap: ReadonlyMap<bigint, string>;
    snippets?: boolean | {
      linesBefore?: number;
      linesAfter?: number;
    };
  },
): Promise<void> {
  const { fileMap, snippets } = options;

  // Determine all files containing changes.
  const changesFiles = Array.from(
    changes,
    (change) => fileMap.get(change.fileId),
  );
  const allFiles = new Set(
    changesFiles.filter((file) => file !== undefined),
  );

  // Read all files, ignoring those that cannot be read.
  const allFilesContentsPromises = await Promise.allSettled(
    Array.from(
      allFiles,
      async (file) => [file, await Deno.readFile(file)] as const,
    ),
  );
  const allFilesLines = new Map(
    allFilesContentsPromises.filter((result) => result.status === "fulfilled")
      .map((result) => {
        const [file, contents] = result.value;

        return [file, splitLines(contents)];
      }),
  );

  // Group changes by file, sorting by file name.
  const changesByFileName = [
    ...Map.groupBy(changes, (_, index) => changesFiles[index]),
  ].sort(([a], [b]) => {
    if (a === undefined && b === undefined) {
      return 0;
    }
    if (a === undefined) {
      return 1;
    }
    if (b === undefined) {
      return -1;
    }
    return a.localeCompare(b);
  });

  for (const [file, changes] of changesByFileName) {
    // Sort changes by position in their source file:
    //
    // - This provides better diagnostics to the user, who likely expects some specific ordering
    //   for changes.
    //
    // - This allows us to process the file line by line linearly when determining locations and
    //   snippets.
    changes.sort((a, b) => a.startByte - b.startByte);

    const lines = file === undefined ? undefined : allFilesLines.get(file);

    if (lines === undefined) {
      continue;
    }

    let currentLine = 0;

    for (const change of changes) {
      const { startByte, endByte } = change;

      if (startByte + endByte === 0) {
        continue;
      }

      const sourceInfo = change._initSourceInfo();
      const start = sourceInfo._initStartPosition();
      const end = sourceInfo._initEndPosition();

      // Compute start position.
      while (
        currentLine < lines.length &&
        startByte >= lines[currentLine].startOffset
      ) {
        currentLine++;
      }
      start.column = startByte - lines[currentLine - 1].startOffset + 1;
      start.line = currentLine;

      // Compute end position.
      while (
        currentLine < lines.length && endByte >= lines[currentLine].startOffset
      ) {
        currentLine++;
      }
      end.column = endByte - lines[currentLine - 1].startOffset + 1;
      end.line = currentLine + 1;

      // Add snippet.
      if (snippets) {
        const { linesBefore = 1, linesAfter = 1 } = snippets === true
          ? {}
          : snippets;

        const textDecoder = new TextDecoder();
        const snippetStartLine = Math.max(1, start.line - linesBefore);
        const snippetEndLine = Math.min(lines.length, start.line + linesAfter);
        const snippet = sourceInfo._initSnippet();
        const snippetLines = snippet._initLines(
          snippetEndLine - snippetStartLine,
        );

        snippet.startLine = snippetStartLine;

        for (let i = 0; i < snippetLines.length; i++) {
          snippetLines.set(
            i,
            textDecoder.decode(lines[snippetStartLine + i - 1].line),
          );
        }
      }
    }
  }
}

/**
 * Splits the given {@linkcode Uint8Array} into lines, returning subarrays for each line,
 * as well as the offset (in bytes) where each line starts.
 */
function splitLines(
  contents: Uint8Array,
): { line: Uint8Array; startOffset: number }[] {
  const lines: { line: Uint8Array; startOffset: number }[] = [];

  let lineStart = 0;

  for (let i = 0; i < contents.length; i++) {
    const byte = contents[i];
    const lineEnd = i;

    if (byte === CharCode.LN) {
      // Line end.
    } else if (
      byte === CharCode.CR && i + 1 < contents.length &&
      contents[i + 1] === CharCode.LN
    ) {
      // Line end w/ CRLF.
      i++;
    } else {
      continue;
    }

    lines.push({
      line: contents.subarray(lineStart, lineEnd),
      startOffset: lineStart,
    });
    lineStart = i + 1;
  }

  return lines;
}

const enum CharCode {
  LN = 0x0A, // deno eval -p '"\n".charCodeAt(0).toString(16)'
  CR = 0x0D, // deno eval -p '"\r".charCodeAt(0).toString(16)'
}

// spell-checker: ignore subarrays
