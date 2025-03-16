import { assertDirectoryChangesMatch } from "../helpers.ts";

Deno.test("type-changes", async () => {
  await assertDirectoryChangesMatch(import.meta, [
    {
      breakage: "code",
      nodeTypeChanged: {
        changedNode: {
          shortName: "enumToU16",
        },
      },
    },
    {
      breakage: "wire",
      nodeTypeChanged: {
        changedNode: {
          shortName: "u16ToEnum",
        },
      },
    },
    {
      breakage: "wire",
      nodeTypeChanged: {
        changedNode: {
          shortName: "u8ToU16",
        },
      },
    },
    {
      breakage: "wire",
      nodeTypeChanged: {
        changedNode: {
          shortName: "u16ToU8",
        },
      },
    },
  ]);
});
