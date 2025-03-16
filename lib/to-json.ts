import {
  type SchemaChange,
  SchemaChange_NodeRef,
  SchemaChange_TypedNodeRef,
} from "./capnp/schema-diff.ts";
import { breakageToString, id } from "./internal/format-helpers.ts";
import {
  annotationTargetToString,
  schemaChangeWhichString,
} from "./internal/format-helpers.ts";

export function changeToJson(
  change: SchemaChange,
  options: { fileMap?: ReadonlyMap<bigint, string> } = {},
): object {
  const which = schemaChangeWhichString[change.which()];

  const result: Record<string, unknown> = {
    breakage: breakageToString(change.breakage),
    fileId: id(change.fileId),

    which,
    // deno-lint-ignore no-explicit-any
    [which]: convertToJson[which](change[which] as any),
  };

  const file = options.fileMap?.get(change.fileId);

  if (file !== undefined) {
    result.file = file;
  }

  if (change._hasSourceInfo()) {
    const sourceInfo = change.sourceInfo;

    result.start = {
      offset: change.startByte,
      line: sourceInfo.startPosition.line,
      column: sourceInfo.startPosition.column,
    };
    result.end = {
      offset: change.endByte,
      line: sourceInfo.endPosition.line,
      column: sourceInfo.endPosition.column,
    };
  } else {
    result.start = { offset: change.startByte };
    result.end = { offset: change.endByte };
  }

  return result;
}

const convertToJson: {
  [K in typeof schemaChangeWhichString[number]]: (
    change: SchemaChange[K],
  ) => object;
} = {
  annotationTargetAdded({ addedTarget, annotation }) {
    return {
      addedTarget: annotationTargetToString(addedTarget),
      annotation: {
        id: id(annotation.id),
        shortName: annotation.shortName,
      },
    };
  },
  annotationTargetRemoved({ removedTarget, annotation }) {
    return {
      removedTarget: annotationTargetToString(removedTarget),
      annotation: {
        id: id(annotation.id),
        shortName: annotation.shortName,
      },
    };
  },
  constValueChanged({ changedNode }) {
    return {
      changedNode: nodeRefToJson(changedNode),
    };
  },
  fieldDefaultValueChanged({ changedNode }) {
    return {
      changedNode: nodeRefToJson(changedNode),
    };
  },
  memberOrdinalChanged({ changedMember, oldOrdinal }) {
    return {
      changedMember: nodeRefToJson(changedMember),
      oldOrdinal: `@${oldOrdinal}`,
    };
  },
  nodeAdded({ addedNode }) {
    return {
      addedNode: nodeRefToJson(addedNode),
    };
  },
  nodeIdChanged({ changedNode, oldId }) {
    return {
      changedNode: nodeRefToJson(changedNode),
      oldId: id(oldId),
    };
  },
  nodeRemoved({ removedNode }) {
    return {
      removedNode: nodeRefToJson(removedNode),
    };
  },
  nodeRenamed({ renamedNode, oldName }) {
    return {
      renamedNode: nodeRefToJson(renamedNode),
      oldName,
    };
  },
  nodeTypeChanged({ changedNode }) {
    return {
      changedNode: typedNodeRefToJson(changedNode),
    };
  },
  unsupported({ node, reason }) {
    return {
      node: nodeRefToJson(node),
      reason,
    };
  },
};

function nodeRefToJson(nodeRef: SchemaChange_NodeRef): object {
  switch (nodeRef.kind) {
    case SchemaChange_NodeRef.Kind.FILE:
      return nodeToJson("file", nodeRef);
    case SchemaChange_NodeRef.Kind.STRUCT:
      return nodeToJson("struct", nodeRef);
    case SchemaChange_NodeRef.Kind.ENUM:
      return nodeToJson("enum", nodeRef);
    case SchemaChange_NodeRef.Kind.INTERFACE:
      return nodeToJson("interface", nodeRef);
    case SchemaChange_NodeRef.Kind.CONST:
      return nodeToJson("const", nodeRef);
    case SchemaChange_NodeRef.Kind.ANNOTATION:
      return nodeToJson("annotation", nodeRef);

    case SchemaChange_NodeRef.Kind.FIELD:
      return {
        which: "field",
        id: `@${nodeRef.ordinal}`,
        structId: id(nodeRef.id),
        shortName: nodeRef.shortName,
      };
    case SchemaChange_NodeRef.Kind.ENUMERANT:
      return {
        which: "enumerant",
        id: `@${nodeRef.ordinal}`,
        enumId: id(nodeRef.id),
        shortName: nodeRef.shortName,
      };
    case SchemaChange_NodeRef.Kind.METHOD:
      return {
        which: "method",
        id: `@${nodeRef.ordinal}`,
        interfaceId: id(nodeRef.id),
        shortName: nodeRef.shortName,
      };
  }
}

function nodeToJson(
  which: string,
  nodeRef: { readonly id: bigint; readonly shortName: string },
): object {
  return {
    which,
    id: id(nodeRef.id),
    shortName: nodeRef.shortName,
  };
}

function typedNodeRefToJson(
  nodeRef: SchemaChange_TypedNodeRef,
): object {
  switch (nodeRef.kind) {
    case SchemaChange_TypedNodeRef.Kind.CONST:
      return nodeToJson("const", nodeRef);
    case SchemaChange_TypedNodeRef.Kind.ANNOTATION:
      return nodeToJson("annotation", nodeRef);

    case SchemaChange_TypedNodeRef.Kind.FIELD:
      return {
        which: "field",
        id: `@${nodeRef.ordinal}`,
        structId: id(nodeRef.id),
        shortName: nodeRef.shortName,
      };
    case SchemaChange_TypedNodeRef.Kind.METHOD_INPUT:
      return {
        which: "method",
        id: `@${nodeRef.ordinal}`,
        interfaceId: id(nodeRef.id),
        shortName: nodeRef.shortName,
        position: "input",
      };
    case SchemaChange_TypedNodeRef.Kind.METHOD_OUTPUT:
      return {
        which: "method",
        id: `@${nodeRef.ordinal}`,
        interfaceId: id(nodeRef.id),
        shortName: nodeRef.shortName,
        position: "output",
      };
  }
}
