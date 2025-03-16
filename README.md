# capnp-diff

[Deno](https://deno.com) tools for comparing two sets of
[Cap'n Proto](https://capnproto.org) schemas and displaying the changes between
them.

> [!WARNING]
>
> This is a proof of concept. Many checks are not yet implemented and interfaces
> may break without warning.

All supported rules are available in
[`schema-diff.capnp`](lib/capnp/schema-diff.capnp), under "Possible changes".

> [!NOTE]
>
> A fork of `capnp` is currently recommended for improved diagnostics:
> https://github.com/capnproto/capnproto/pull/2275.
>
> To use it, run the following:
>
> ```sh
> git clone https://github.com/71/capnproto.git --branch v2 --depth 1
> cd capnproto
> cmake -B build -S .
> cmake --build build --target capnp_tool capnpc_cpp
> export PATH="$PWD/build/c++/src/capnp:$PATH"
> ```

## Quick start

Compare changes between two directories:

```sh
$ ./main.ts --old-files tests/remove-struct/old.capnp --new-files tests/remove-struct/new.capnp
[C02] Code breakage: struct Person @0xa09745d0bf68d96a removed

  > tests/remove-struct/old.capnp:3:1:
2 |
3 | struct Person {
4 |   id @0 :UInt32;

1 change found.
```

Compare changes between two Git revisions:

```sh
$ git clone https://github.com/capnproto/capnproto.git
$ cd capnproto
$ ../tools/git.ts --old-rev eb7da61572a7cc8688d12b82f80f55546417e6b5 --files c++/src/capnp/c++.capnp --breakage none
[C07] No breakage: Target union added to annotation name @0xf264a779fef191ce

   > c++/src/capnp/c++.capnp:26:1:
25 | annotation namespace(file): Text;
26 | annotation name(field, enumerant, struct, enum, interface, method, param, group, union): Text;
27 |

[C01] No breakage: annotation allowCancellation @0xac7096ff8cfc9dce added

   > c++/src/capnp/c++.capnp:28:1:
27 |
28 | annotation allowCancellation(interface, method, file) :Void;
29 | # Indicates that the server-side implementation of a method is allowed to be canceled when the

2 changes found.
```

Dump changes as a Cap'n Proto message:

```sh
$ ./main.ts --old-files tests/u16-to-u32/old.capnp --new-files tests/u16-to-u32/new.capnp --format binary \
  | capnp convert binary:text lib/capnp/schema-diff.capnp SchemaDiff
( changes = [
    ( breakage = wire,
      fileId = 15995657890504460412,
      startByte = 40,
      endByte = 54,
      sourceInfo = (
        startPosition = (line = 4, column = 3),
        endPosition = (line = 5, column = 17) ),
      nodeTypeChanged = (
        changedNode = (
          kind = field,
          id = 11571794530418612586,
          ordinal = 0,
          shortName = "id" ) ) ) ],
  files = [
    ( id = 15995657890504460412,
      path = "tests/u16-to-u32/new.capnp" ) ] )
```

Dump changes as JSON:

```sh
$ ./main.ts --old-files tests/u16-to-u32/old.capnp --new-files tests/u16-to-u32/new.capnp --format json
[
  {
    "breakage": "wire",
    "fileId": "@0xddfbfe1a5031487c",
    "which": "nodeTypeChanged",
    "nodeTypeChanged": {
      "changedNode": {
        "which": "field",
        "id": "@0",
        "structId": "@0xa09745d0bf68d96a",
        "shortName": "id"
      }
    },
    "file": "tests/u16-to-u32/new.capnp",
    "start": {
      "offset": 40,
      "line": 4,
      "column": 3
    },
    "end": {
      "offset": 54,
      "line": 5,
      "column": 17
    }
  }
]
```

<!-- spell-checker: ignore capnpc -->
