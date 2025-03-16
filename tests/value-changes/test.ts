import { assertDirectoryChangesMatch } from "../helpers.ts";

Deno.test("value-changes", async () => {
  await assertDirectoryChangesMatch(import.meta, [
    {
      breakage: "code",
      nodeTypeChanged: {},
    },
  ]);
});
