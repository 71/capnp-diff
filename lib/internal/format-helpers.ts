import {
  SchemaChange_AnnotationTarget,
  SchemaChange_Breakage,
  SchemaChange_Which,
} from "../capnp/schema-diff.ts";

/**
 * Converts a node ID to a string, similar to the one used in the Cap'n Proto schema format.
 */
export function id(nodeId: bigint): string {
  return `@0x${nodeId.toString(16)}`;
}

/**
 * Converts an {@link SchemaChange_AnnotationTarget} to a string.
 */
export function annotationTargetToString(
  annotationTarget: SchemaChange_AnnotationTarget,
): string {
  switch (annotationTarget) {
    case SchemaChange_AnnotationTarget.FILE:
      return "file";
    case SchemaChange_AnnotationTarget.CONST:
      return "const";
    case SchemaChange_AnnotationTarget.ENUM:
      return "enum";
    case SchemaChange_AnnotationTarget.ENUMERANT:
      return "enumerant";
    case SchemaChange_AnnotationTarget.STRUCT:
      return "struct";
    case SchemaChange_AnnotationTarget.FIELD:
      return "field";
    case SchemaChange_AnnotationTarget.UNION:
      return "union";
    case SchemaChange_AnnotationTarget.GROUP:
      return "group";
    case SchemaChange_AnnotationTarget.INTERFACE:
      return "interface";
    case SchemaChange_AnnotationTarget.METHOD:
      return "method";
    case SchemaChange_AnnotationTarget.PARAM:
      return "param";
    case SchemaChange_AnnotationTarget.ANNOTATION:
      return "annotation";
  }
}

export function breakageToString(breakage: SchemaChange_Breakage): string {
  switch (breakage) {
    case SchemaChange_Breakage.NONE:
      return "none";
    case SchemaChange_Breakage.CODE:
      return "code";
    case SchemaChange_Breakage.WIRE:
      return "wire";
  }
}

export const schemaChangeWhichString = Object.entries(SchemaChange_Which)
  .sort(([, a], [, b]) => a - b)
  .map(([which]) => toCamelCase(which as keyof typeof SchemaChange_Which));

function toCamelCase<S extends string>(s: S): CamelCase<S> {
  return s.toLowerCase().replaceAll(
    /_([a-z])/g,
    (_, letter) => letter.toUpperCase(),
  ) as CamelCase<S>;
}

type CamelCase<S extends string> = S extends `${infer T}_${infer U}`
  ? `${Lowercase<T>}${Capitalize<CamelCase<U>>}`
  : Lowercase<S>;
