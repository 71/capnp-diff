import { assertDirectoryChangesMatch } from "../helpers.ts";

Deno.test("remove-struct", async () => {
  await assertDirectoryChangesMatch(import.meta, [
    {
      breakage: "code",
      nodeRemoved: {
        removedNode: {
          shortName: "Person",
        },
      },
    },
  ]);
});
