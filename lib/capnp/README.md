## Files

- `schema-diff.capnp`: definition of a change between two schemas.

  - `schema-diff.ts`: compiled version of `schema-diff.capnp`.

- `schema.capnp`: Cap'n Proto schema definition as obtained with

  - `schema.ts`: compiled version of `schema.capnp`.

> [!NOTE]
> We use our own version of `schema.capnp` / `schema.ts` rather than the one provided by `capnp-es`
> since that one is outdated, and doesn't have source information (as of 0.0.7).

`schema.capnp` can be updated with:

```sh
curl -fsSL https://github.com/capnproto/capnproto/raw/refs/heads/v2/c++/src/capnp/schema.capnp \
  | grep -v Cxx > lib/schema.capnp
```

We filter out `Cxx` since it requires standard imports, which conflict with our local version of
`schema.capnp`.

> [!NOTE]
> We currently use a forked version of `schema.capnp` which supports member source locations
> for improved diagnostics: https://github.com/capnproto/capnproto/pull/2275.
