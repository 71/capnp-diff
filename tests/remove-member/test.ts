import { assertDirectoryChangesMatch } from "../helpers.ts";

Deno.test("remove-member", async () => {
  await assertDirectoryChangesMatch(import.meta, [
    {
      breakage: "wire",
      nodeRemoved: {
        removedNode: { shortName: "field1" },
      },
    },
    {
      breakage: "wire",
      nodeRemoved: {
        removedNode: { shortName: "enumerant1" },
      },
    },
    {
      breakage: "wire",
      nodeRemoved: {
        removedNode: { shortName: "in1" },
      },
    },
    {
      breakage: "wire",
      nodeRemoved: {
        removedNode: { shortName: "out1" },
      },
    },
    {
      breakage: "wire",
      nodeRemoved: {
        removedNode: { shortName: "method1" },
      },
    },
  ]);
});
