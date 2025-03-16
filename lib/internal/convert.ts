import type { List, Struct } from "capnp-es";

/**
 * Converts a plain JS object into a Cap'n Proto struct.
 *
 * This does not support lists or `Data` fields.
 */
export function convertToStruct<T extends Struct>(
  struct: T,
  object: ObjectForStruct<T>,
): void {
  const s = struct as Record<string, unknown>;

  for (const key in object) {
    if (key === "which") {
      continue;
    }

    const value = object[key];

    if (typeof value !== "object") {
      s[key] = value;
      continue;
    }

    const initKey = `_init${key[0].toUpperCase()}${key.slice(1)}`;

    if (Array.isArray(value)) {
      throw new Error("lists are not supported");
    }

    const valueStruct = (s as Record<string, () => Struct>)[initKey]();

    convertToStruct(valueStruct, value as ObjectForStruct<Struct>);
  }
}

/**
 * The plain JS value corresponding to a Cap'n Proto value.
 */
export type ValueFor<T> = T extends List<infer U> ? readonly ValueFor<U>[]
  : T extends Struct ? ObjectForStruct<T>
  : T;

/**
 * The plain JS object corresponding to a Cap'n Proto struct.
 */
export type ObjectForStruct<T extends Struct> = "which" extends keyof T
  ? Union<UnionProps<T>, NonUnionProps<T>>
  : NonUnionProps<T>;

type NonUnionProps<T extends object> = {
  readonly [
    K in keyof T & string as K extends
      `_${string}` | "segment" | "byteOffset" | "toString" | "which" ? never
      : T extends { [_ in `_is${Capitalize<K>}`]: boolean } ? never
      : K
  ]?: ValueFor<T[K]>;
};

type UnionProps<T extends object> = {
  readonly [
    K in keyof T & string as T extends { [_ in `_is${Capitalize<K>}`]: boolean }
      ? K
      : never
  ]: ValueFor<T[K]>;
};

type Union<T extends object, Common extends object> = {
  [K in keyof T]: { [_ in K]: T[K] } & { readonly which: K } & Common;
}[keyof T];
