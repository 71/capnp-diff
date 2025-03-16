import { dim } from "@std/fmt/colors";
import {
  SchemaChange,
  SchemaChange_NodeRef,
  SchemaChange_TypedNodeRef,
} from "./capnp/schema-diff.ts";
import {
  annotationTargetToString,
  id as idText,
  schemaChangeWhichString,
} from "./internal/format-helpers.ts";

type Highlight = (text: string) => string;

/**
 * Formats the given change to a string.
 */
export function changeToString(
  change: SchemaChange,
  options: { highlight?: Highlight } = {},
): string {
  const { highlight: h = (t) => t } = options;
  const which = schemaChangeWhichString[change.which()];

  const convertToString: {
    [K in typeof schemaChangeWhichString[number]]: (
      change: SchemaChange[K],
    ) => string;
  } = {
    annotationTargetAdded({ addedTarget, annotation }) {
      return `Target ${h(annotationTargetToString(addedTarget))} added to ${
        annotationToString(annotation, h)
      }`;
    },
    annotationTargetRemoved({ removedTarget, annotation }) {
      return `Target ${
        h(annotationTargetToString(removedTarget))
      } removed from ${annotationToString(annotation, h)}`;
    },
    constValueChanged({ changedNode }) {
      return `Value of ${nodeRefToString(changedNode, h)} changed`;
    },
    fieldDefaultValueChanged({ changedNode }) {
      return `Default value of ${nodeRefToString(changedNode, h)} changed`;
    },
    memberOrdinalChanged({ changedMember, oldOrdinal }) {
      return `Ordinal of ${
        nodeRefToString(changedMember, h)
      } changed from @${oldOrdinal}`;
    },
    nodeAdded({ addedNode }) {
      return `${nodeRefToString(addedNode, h)} added`;
    },
    nodeIdChanged({ changedNode, oldId }) {
      return `ID of ${nodeRefToString(changedNode, h)} changed from ${
        id(oldId)
      }`;
    },
    nodeRemoved({ removedNode }) {
      return `${nodeRefToString(removedNode, h)} removed`;
    },
    nodeRenamed({ renamedNode, oldName }) {
      return `${nodeRefToString(renamedNode, h)} renamed from ${oldName}`;
    },
    nodeTypeChanged({ changedNode }) {
      return `Type of ${typedNodeRefToString(changedNode, h)} changed`;
    },
    unsupported({ node, reason }) {
      return `${nodeRefToString(node, h)} is not supported: ${reason}`;
    },
  };

  // deno-lint-ignore no-explicit-any
  return convertToString[which](change[which] as any);
}

function id(id: bigint): string {
  return dim(idText(id));
}

function nodeRefToString(nodeRef: SchemaChange_NodeRef, h: Highlight): string {
  switch (nodeRef.kind) {
    case SchemaChange_NodeRef.Kind.ANNOTATION:
      return `annotation ${h(nodeRef.shortName)} ${id(nodeRef.id)}`;
    case SchemaChange_NodeRef.Kind.FILE:
      return `file ${h(nodeRef.shortName)} ${id(nodeRef.id)}`;
    case SchemaChange_NodeRef.Kind.STRUCT:
      return `struct ${h(nodeRef.shortName)} ${id(nodeRef.id)}`;
    case SchemaChange_NodeRef.Kind.ENUM:
      return `enum ${h(nodeRef.shortName)} ${id(nodeRef.id)}`;
    case SchemaChange_NodeRef.Kind.INTERFACE:
      return `interface ${h(nodeRef.shortName)} ${id(nodeRef.id)}`;
    case SchemaChange_NodeRef.Kind.CONST:
      return `const ${h(nodeRef.shortName)} ${id(nodeRef.id)}`;
    case SchemaChange_NodeRef.Kind.FIELD:
      return `field ${h(nodeRef.shortName)} @${nodeRef.ordinal} in ${
        id(nodeRef.id)
      }`;
    case SchemaChange_NodeRef.Kind.ENUMERANT:
      return `enumerant ${h(nodeRef.shortName)} @${nodeRef.ordinal} in ${
        id(nodeRef.id)
      }`;
    case SchemaChange_NodeRef.Kind.METHOD:
      return `method ${h(nodeRef.shortName)} @${nodeRef.ordinal} in ${
        id(nodeRef.id)
      }`;
  }
}

function typedNodeRefToString(
  nodeRef: SchemaChange_TypedNodeRef,
  h: Highlight,
): string {
  switch (nodeRef.kind) {
    case SchemaChange_TypedNodeRef.Kind.CONST:
      return `const ${h(nodeRef.shortName)} ${id(nodeRef.id)}`;
    case SchemaChange_TypedNodeRef.Kind.ANNOTATION:
      return `annotation ${h(nodeRef.shortName)} ${id(nodeRef.id)}`;
    case SchemaChange_TypedNodeRef.Kind.FIELD:
      return `field ${h(nodeRef.shortName)} @${nodeRef.ordinal} in ${
        id(nodeRef.id)
      }`;
    case SchemaChange_TypedNodeRef.Kind.METHOD_INPUT:
      return `parameters of ${h(nodeRef.shortName)} @${nodeRef.ordinal} in ${
        id(nodeRef.id)
      }`;
    case SchemaChange_TypedNodeRef.Kind.METHOD_OUTPUT:
      return `return type of ${h(nodeRef.shortName)} @${nodeRef.ordinal} in ${
        id(nodeRef.id)
      }`;
  }
}

function annotationToString(
  annotation: { shortName: string; id: bigint },
  h: Highlight,
): string {
  return `annotation ${h(annotation.shortName)} ${id(annotation.id)}`;
}
