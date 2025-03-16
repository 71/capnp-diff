import { assertDirectoryChangesMatch } from "../helpers.ts";

Deno.test("add-struct", async () => {
  await assertDirectoryChangesMatch(import.meta, [
    {
      breakage: "none",
      nodeAdded: {
        addedNode: {
          shortName: "Person",
        },
      },
    },
  ]);
});
