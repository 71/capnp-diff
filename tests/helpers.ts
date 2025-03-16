import { assertObjectMatch } from "@std/assert/object-match";
import { assertEquals } from "@std/assert/equals";
import { resolve } from "node:path";
import { changeToJson, loadCapnpSchema, schemaDiff } from "../mod.ts";

/**
 * Asserts that the JSON diff between the `from.capnp` and `to.capnp` files in the calling module's
 * directory matches the expected changes.
 *
 * @note We typically use "old" and "new" to refer to the two schemas, but in a file listing that
 * leads to confusion as "new" appears before "old" alphabetically. We therefore use "a" and "b"
 * instead.
 */
export async function assertDirectoryChangesMatch(
  importMeta: ImportMeta,
  expected: readonly object[],
) {
  const options = { importPaths: [], noStandardImports: true };
  const dirPath = importMeta.dirname!;
  const [oldSchema, newSchema] = await Promise.all([
    loadCapnpSchema([resolve(dirPath, "a.capnp")], options),
    loadCapnpSchema([resolve(dirPath, "b.capnp")], options),
  ]);

  const diff = schemaDiff(oldSchema, newSchema);

  assertObjectMatch({
    changes: diff.changes.map((change) => changeToJson(change)),
  }, {
    changes: expected,
  });

  assertEquals(diff.changes.length, expected.length);
}
