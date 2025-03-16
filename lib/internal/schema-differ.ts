import type { List } from "capnp-es";
import {
  CodeGeneratorRequest,
  Field,
  Field_Which,
  Method,
  Node,
  Node_Annotation,
  Node_Const,
  Node_Enum,
  Node_Interface,
  Node_NestedNode,
  Node_Struct,
  Node_Which,
  Type,
  Type_Which,
  Value,
} from "../capnp/schema.ts";
import {
  SchemaChange,
  SchemaChange_AnnotationTarget,
  SchemaChange_Breakage as Breakage,
  SchemaChange_NodeRef,
  SchemaChange_TypedNodeRef,
} from "../capnp/schema-diff.ts";
import { type OneOfBreakages } from "./breakages.ts";
import type { ObjectForStruct } from "./convert.ts";
import { TypeCompatibility, typeCompatibility } from "./type-compatibility.ts";
import { valuesAreEqual } from "./value-equality.ts";

interface Location {
  readonly startByte: number;
  readonly endByte: number;
}

type SchemaChangeObj = ObjectForStruct<SchemaChange>;

/**
 * Helper class used to diff two Cap'n Proto schemas.
 */
export class SchemaDiffer {
  private readonly oldNodeById = new Map<bigint, Node>();
  private readonly newNodeById = new Map<bigint, Node>();

  private readonly oldNodeLocById = new Map<bigint, Location>();
  private readonly newNodeLocById = new Map<bigint, Location>();

  private currentFileId: bigint = 0n;

  private readonly changedFileNames = new Map<bigint, string>();

  public get changedFileNamesById(): ReadonlyMap<bigint, string> {
    return this.changedFileNames;
  }

  public constructor(
    /** The {@link CodeGeneratorRequest} representing the schema to compare against `newSchema`. */
    public readonly oldSchema: CodeGeneratorRequest,
    /** The {@link CodeGeneratorRequest} representing the schema to compare against `oldSchema`. */
    public readonly newSchema: CodeGeneratorRequest,
    /** Adds a new {@link SchemaChange} to the diff. */
    public readonly addChangeFunction: (change: SchemaChangeObj) => void,
  ) {
    const indexNodes = (
      schema: CodeGeneratorRequest,
      nodeById: Map<bigint, Node>,
      nodeLocById: Map<bigint, Location>,
    ) => {
      for (const node of schema.nodes) {
        nodeById.set(node.id, node);
      }

      // Store the source information for nodes. In theory the nodes contain this inline in
      // `startByte` and `endByte`, but this is not always the case (e.g. for annotations, see
      // https://github.com/capnproto/capnproto/pull/2126#discussion_r2029886844).
      for (const sourceInfo of schema.sourceInfo) {
        nodeLocById.set(sourceInfo.id, {
          startByte: sourceInfo.startByte,
          endByte: sourceInfo.endByte,
        });

        for (let i = 0; i < sourceInfo.members.length; i++) {
          const member = sourceInfo.members[i];

          if (member.startByte + member.endByte !== 0) {
            nodeLocById.set(memberId(sourceInfo.id, i), {
              startByte: member.startByte,
              endByte: member.endByte,
            });
          }
        }
      }
    };

    indexNodes(this.oldSchema, this.oldNodeById, this.oldNodeLocById);
    indexNodes(this.newSchema, this.newNodeById, this.newNodeLocById);
  }

  // ----------------------------------------------------------------------------------------------
  // MARK: Diff schemas

  /**
   * Compares the schemas of the old and new files, yielding all detected schema changes
   * by creating changes with {@linkcode createChange()}.
   */
  public diffSchemas(options?: { requestedFilesOnly?: boolean }): void {
    const { requestedFilesOnly = false } = options ?? {};
    const getFiles = requestedFilesOnly
      ? (req: CodeGeneratorRequest, nodeById: ReadonlyMap<bigint, Node>) =>
        req.requestedFiles.map((file) => nodeById.get(file.id)!)
      : (req: CodeGeneratorRequest) =>
        req.nodes.filter((node) => node.which() === Node_Which.FILE);

    const oldFiles = new Map(
      getFiles(this.oldSchema, this.oldNodeById).map((file) => [file.id, file]),
    );
    const newFiles = getFiles(this.newSchema, this.newNodeById);

    for (const newFile of newFiles) {
      const oldFile = this.oldNodeById.get(newFile.id);

      if (oldFile === undefined) {
        this.addChange(
          "nodeAdded",
          Breakage.NONE,
          newFile.startByte,
          newFile.startByte + 1,
          {
            addedNode: toNodeRef(newFile),
          },
        );
        continue;
      }

      this.diffFiles(oldFile, newFile);

      oldFiles.delete(oldFile.id);
    }

    for (const removedFile of oldFiles.values()) {
      this.addChange(
        "nodeRemoved",
        Breakage.CODE,
        removedFile.startByte,
        removedFile.startByte + 1,
        {
          removedNode: toNodeRef(removedFile),
        },
      );
    }
  }

  private diffFiles(oldFile: Node, newFile: Node): void {
    this.currentFileId = newFile.id;
    this.diffNodes(oldFile, newFile);
    this.currentFileId = 0n;
  }

  // ----------------------------------------------------------------------------------------------
  // MARK: Diff nodes
  //
  // See https://github.com/capnproto/capnproto/blob/master/c%2B%2B/src/capnp/schema.capnp for the
  // schema we want to diff.

  private diffNodes(oldNode: Node, newNode: Node): void {
    if (oldNode.which() !== newNode.which()) {
      // These nodes have the same ID, but different kinds, so we consider that one was removed and
      // the other was added.
      this.addChangeAt("nodeRemoved", Breakage.CODE, oldNode, {
        removedNode: toNodeRef(oldNode),
      });
      this.addChangeAt("nodeAdded", Breakage.NONE, newNode, {
        addedNode: toNodeRef(newNode),
      });
      this.diffNestedNodes(oldNode.nestedNodes, newNode.nestedNodes);

      return;
    }

    // TODO: compare generic parameters
    const oldShortName = shortName(oldNode);
    const newShortName = shortName(newNode);

    if (oldShortName !== newShortName) {
      const changeLoc = this.newNodeLoc(newNode);

      this.addChangeAt("nodeRenamed", Breakage.CODE, changeLoc, {
        renamedNode: toNodeRef(newNode),
        oldName: oldShortName,
      });
    }

    const sameWhich = oldNode.which();

    switch (sameWhich) {
      case Node_Which.FILE:
        break;
      case Node_Which.STRUCT:
        this.diffStructs(oldNode.struct, newNode.struct, oldNode, newNode);
        break;
      case Node_Which.ENUM:
        this.diffEnums(oldNode.enum, newNode.enum, oldNode, newNode);
        break;
      case Node_Which.INTERFACE:
        this.diffInterfaces(
          oldNode.interface,
          newNode.interface,
          oldNode,
          newNode,
        );
        break;
      case Node_Which.CONST:
        this.diffConsts(oldNode.const, newNode.const, newNode);
        break;
      case Node_Which.ANNOTATION:
        this.diffAnnotations(oldNode.annotation, newNode.annotation, newNode);
        break;
      default:
        throw new Error(`unknown node kind ${sameWhich satisfies never}`);
    }

    // We want to report changes to nested nodes after the changes inherent to the node itself, so
    // we do this at the end of the method.
    this.diffNestedNodes(oldNode.nestedNodes, newNode.nestedNodes);
  }

  private diffNestedNodes(
    oldNodes: readonly Node_NestedNode[],
    newNodes: readonly Node_NestedNode[],
  ): void {
    for (const oldNestedNode of oldNodes) {
      const oldNode = this.oldNodeById.get(oldNestedNode.id)!;
      const newNode = this.newNodeById.get(oldNestedNode.id);

      if (newNode !== undefined) {
        // A corresponding node exists in the new schema; we'll diff it below.
        continue;
      }

      // Node was removed.
      const oldName = oldNestedNode.name;
      const newNodeWithSameName = newNodes.find(
        (newNestedNode) => newNestedNode.name === oldName,
      );

      if (newNodeWithSameName !== undefined) {
        const newNode = this.newNodeById.get(newNodeWithSameName.id)!;

        if (oldNode.which() === newNode.which()) {
          // The ID of the node changed, but another node with the same name and type exists so we
          // consider that they're the same.
          this.addChangeAt(
            "nodeIdChanged",
            Breakage.WIRE,
            this.newNodeLoc(newNode),
            {
              changedNode: toNodeRef(newNode),
              oldId: oldNode.id,
            },
          );
          this.diffNodes(oldNode, newNode);

          continue;
        }
      }

      this.addChangeAt("nodeRemoved", Breakage.CODE, this.oldNodeLoc(oldNode), {
        removedNode: toNodeRef(oldNode),
      });
    }

    for (const newNestedNode of newNodes) {
      const oldNode = this.oldNodeById.get(newNestedNode.id);
      const newNode = this.newNodeById.get(newNestedNode.id)!;

      if (oldNode !== undefined) {
        this.diffNodes(oldNode, newNode);
      } else {
        this.addChangeAt("nodeAdded", Breakage.NONE, this.newNodeLoc(newNode), {
          addedNode: toNodeRef(newNode),
        });
      }
    }
  }

  // ----------------------------------------------------------------------------------------------
  // MARK: Diff structs

  private diffStructs(
    oldStruct: Node_Struct,
    newStruct: Node_Struct,
    oldStructNode: Node,
    newStructNode: Node,
  ): void {
    this.diffMembers(
      oldStructNode,
      oldStruct.fields,
      newStructNode,
      newStruct.fields,
      (oldField, newField, newOrdinal) => {
        const newFieldLoc = this.newMemberLoc(newStructNode, newOrdinal);
        const oldFieldWhich = oldField.which();

        if (oldFieldWhich !== newField.which()) {
          this.addChangeAt("nodeTypeChanged", Breakage.WIRE, newFieldLoc, {
            changedNode: fieldToTypedNodeRef(
              newStructNode,
              newOrdinal,
              newField.name,
            ),
          });
          return;
        }

        switch (oldFieldWhich) {
          case Field_Which.SLOT:
            {
              const isCompatible = this.diffType(
                oldField.slot.type,
                newField.slot.type,
                newFieldLoc,
                () =>
                  fieldToTypedNodeRef(
                    newStructNode,
                    newOrdinal,
                    newField.name,
                  ),
              );

              if (
                isCompatible && !this.valuesAreEqual(
                  oldField.slot.defaultValue,
                  newField.slot.defaultValue,
                  (reason) => {
                    this.addChangeAt(
                      "unsupported",
                      Breakage.WIRE,
                      newFieldLoc,
                      {
                        reason,
                        node: fieldToNodeRef(
                          newStructNode,
                          newOrdinal,
                          newField.name,
                        ),
                      },
                    );
                  },
                )
              ) {
                this.addChangeAt(
                  "fieldDefaultValueChanged",
                  Breakage.WIRE,
                  newFieldLoc,
                  {
                    changedNode: fieldToNodeRef(
                      newStructNode,
                      newOrdinal,
                      newField.name,
                    ),
                  },
                );
              }
            }
            break;

          case Field_Which.GROUP:
            this.diffStructTypes(
              oldField.group.typeId,
              newField.group.typeId,
              newFieldLoc,
              () =>
                fieldToTypedNodeRef(
                  newStructNode,
                  newOrdinal,
                  newField.name,
                ),
            );
            break;
        }
      },
    );
  }

  // ----------------------------------------------------------------------------------------------
  // MARK: Diff enums

  private diffEnums(
    oldEnum: Node_Enum,
    newEnum: Node_Enum,
    oldEnumNode: Node,
    newEnumNode: Node,
  ): void {
    // We perform a simpler diff for enumerants (compared to fields and methods) since "changing
    // the ID" of an enumerant completely changes its definition.
    const oldEnumerants = oldEnum.enumerants;
    const newEnumerants = newEnum.enumerants;

    for (
      let i = 0;
      i < Math.min(oldEnumerants.length, newEnumerants.length);
      i++
    ) {
      const oldEnumerant = oldEnumerants[i];
      const newEnumerant = newEnumerants[i];

      if (oldEnumerant.name !== newEnumerant.name) {
        const enumerantLoc = this.newMemberLoc(newEnumNode, i);

        this.addChangeAt("nodeRenamed", Breakage.CODE, enumerantLoc, {
          oldName: oldEnumerant.name,
          renamedNode: enumerantToNodeRef(newEnumNode, i, newEnumerant.name),
        });
      }
    }

    for (let i = newEnumerants.length; i < oldEnumerants.length; i++) {
      const enumerantLoc = this.oldMemberLoc(oldEnumNode, i);

      // Removing an enumerant is considered a wire-breaking change, as it would allow a future
      // member with a different name to be added with a different meaning.
      this.addChangeAt("nodeRemoved", Breakage.WIRE, enumerantLoc, {
        removedNode: enumerantToNodeRef(oldEnumNode, i, oldEnumerants[i].name),
      });
    }

    for (let i = oldEnumerants.length; i < newEnumerants.length; i++) {
      const enumerantLoc = this.newMemberLoc(newEnumNode, i);

      this.addChangeAt("nodeAdded", Breakage.NONE, enumerantLoc, {
        addedNode: enumerantToNodeRef(newEnumNode, i, newEnumerants[i].name),
      });
    }
  }

  // ----------------------------------------------------------------------------------------------
  // MARK: Diff interfaces

  private diffInterfaces(
    oldInterface: Node_Interface,
    newInterface: Node_Interface,
    oldInterfaceNode: Node,
    newInterfaceNode: Node,
  ): void {
    this.diffMembers(
      oldInterfaceNode,
      oldInterface.methods,
      newInterfaceNode,
      newInterface.methods,
      (oldMethod, newMethod, newOrdinal) => {
        if (
          newMethod.paramBrand.scopes.length +
              newMethod.resultBrand.scopes.length !== 0
        ) {
          throw new Error(
            `generic methods are not yet supported (in ${newInterfaceNode.displayName})`,
          );
        }
        if (
          oldMethod.paramBrand.scopes.length +
              oldMethod.resultBrand.scopes.length !== 0
        ) {
          throw new Error(
            `generic methods are not yet supported (in ${oldInterfaceNode.displayName})`,
          );
        }
        if (newMethod.implicitParameters.length !== 0) {
          throw new Error(
            `implicit parameters are not yet supported (in ${newInterfaceNode.displayName})`,
          );
        }
        if (oldMethod.implicitParameters.length !== 0) {
          throw new Error(
            `implicit parameters are not yet supported (in ${oldInterfaceNode.displayName})`,
          );
        }

        const newMethodLoc = this.newMemberLoc(newInterfaceNode, newOrdinal);

        this.diffStructTypes(
          oldMethod.paramStructType,
          newMethod.paramStructType,
          newMethodLoc,
          () => ({
            shortName: newMethod.name,
            which: "methodInput",
            methodInput: {
              interfaceId: newInterfaceNode.id,
              methodId: newOrdinal,
            },
          }),
        );

        this.diffStructTypes(
          oldMethod.resultStructType,
          newMethod.resultStructType,
          newMethodLoc,
          () => ({
            shortName: newMethod.name,
            which: "methodOutput",
            methodOutput: {
              interfaceId: newInterfaceNode.id,
              methodId: newOrdinal,
            },
          }),
        );

        for (
          const [oldId, newId] of [
            [oldMethod.paramStructType, newMethod.paramStructType],
            [oldMethod.resultStructType, newMethod.resultStructType],
          ]
        ) {
          const oldNode = this.oldNodeById.get(oldId)!;
          const newNode = this.newNodeById.get(newId)!;

          if (oldNode.scopeId === 0n || newNode.scopeId === 0n) {
            // One of the nodes is automatically generated.
            this.diffNodes(oldNode, newNode);
          }
        }
      },
    );
  }

  // ----------------------------------------------------------------------------------------------
  // MARK: Diff members

  /**
   * Diffs the two given lists of members (i.e. fields or methods) by position, attempting to
   * detect renames, ID changes, additions, and removals.
   */
  private diffMembers<T extends Field | Method>(
    oldParentNode: Node,
    oldMembers: List<T>,
    newParentNode: Node,
    newMembers: List<T>,
    diff: (oldMember: T, newMember: T, newOrdinal: number) => void,
  ): void {
    const unseenNewMemberPositions = new Set<number>();

    for (let i = 0; i < newMembers.length; i++) {
      unseenNewMemberPositions.add(i);
    }

    // If two members `a` and `b` have the same ordinal but different names and types, and there is
    // another member `c` with the same name as `a` (or `b`), we consider that `a` (or `b`) is the
    // same as `c`, but had its ordinal changed.
    for (let i = 0; i < Math.min(oldMembers.length, newMembers.length); i++) {
      const oldMember = oldMembers[i];
      const oldOrdinal = "ordinal" in oldMember && oldMember.ordinal._isExplicit
        ? oldMember.ordinal.explicit
        : i;

      const newMember = newMembers[i];

      if (oldMember.name === newMember.name) {
        // Same name and ordinal? Likely the same member.
        //
        // Note that the condition above cannot be true if we already processed `newMember` as part
        // of an ordinal change.
        diff(oldMember, newMember, oldOrdinal);
        unseenNewMemberPositions.delete(i);
        continue;
      }

      const newMemberDifferentOrdinalButSameNameIndex = newMembers.findIndex((
        member,
        j,
      ) => j !== i && member.name === oldMember.name);

      if (newMemberDifferentOrdinalButSameNameIndex === -1) {
        // Different ordinal and no other member with the same name? Likely a rename.
        //
        // Similarly, if we already processed `newMember` as part of an ordinal change, then its
        // previous member had a different name (as two members cannot have the same name), so it
        // would have gotten matched with another `newMember`.
        this.addChangeAt(
          "nodeRenamed",
          Breakage.CODE,
          this.newMemberLoc(newParentNode, oldOrdinal),
          {
            renamedNode: fieldToNodeRef(
              newParentNode,
              oldOrdinal,
              newMember.name,
            ),
            oldName: oldMember.name,
          },
        );

        diff(oldMember, newMember, oldOrdinal);
        unseenNewMemberPositions.delete(i);
        continue;
      }

      // Different ordinal but there is another member with the same name? Likely an ordinal
      // change.
      const newOrdinal = "ordinal" in newMember && newMember.ordinal._isExplicit
        ? newMember.ordinal.explicit
        : newMemberDifferentOrdinalButSameNameIndex;

      this.addChangeAt(
        "memberOrdinalChanged",
        Breakage.WIRE,
        this.newMemberLoc(newParentNode, newOrdinal),
        {
          changedMember: fieldToTypedNodeRef(
            newParentNode,
            newOrdinal,
            newMember.name,
          ),
          oldOrdinal,
        },
      );

      diff(oldMember, newMember, newOrdinal);
      unseenNewMemberPositions.delete(
        newMemberDifferentOrdinalButSameNameIndex,
      );
    }

    // Members in `oldMembers` not in `newMembers` were removed.
    for (let i = newMembers.length; i < oldMembers.length; i++) {
      const oldMember = oldMembers[i];
      const oldOrdinal = "ordinal" in oldMember && oldMember.ordinal._isExplicit
        ? oldMember.ordinal.explicit
        : i;

      this.addChangeAt(
        "nodeRemoved",
        // Removing a member is a wire breaking change as it would allow future additions which are
        // incompatible with the freshly removed member.
        Breakage.WIRE,
        this.oldMemberLoc(oldParentNode, oldOrdinal),
        {
          removedNode: fieldToNodeRef(
            oldParentNode,
            oldOrdinal,
            oldMember.name,
          ),
        },
      );
    }

    // Members in `unseenNewMemberPositions` were added. In theory we could go through items in
    // `newMembers[oldItems.length..]`, but we try to match items with different ordinals in the
    // loop above, so instead we have to go through unseen members.
    for (const i of unseenNewMemberPositions) {
      const newMember = newMembers[i];
      const newOrdinal = "ordinal" in newMember && newMember.ordinal._isExplicit
        ? newMember.ordinal.explicit
        : i;

      this.addChangeAt(
        "nodeAdded",
        Breakage.NONE,
        this.newMemberLoc(newParentNode, newOrdinal),
        {
          addedNode: fieldToNodeRef(newParentNode, newOrdinal, newMember.name),
        },
      );
    }
  }

  // ----------------------------------------------------------------------------------------------
  // MARK: Diff consts

  private diffConsts(
    oldConst: Node_Const,
    newConst: Node_Const,
    newConstNode: Node,
  ): void {
    const newConstLoc = this.newNodeLoc(newConstNode);

    const isCompatible = this.diffType(
      oldConst.type,
      newConst.type,
      newConstLoc,
      () => ({
        shortName: shortName(newConstNode),
        which: "constId",
        constId: newConstNode.id,
      }),
    );

    if (
      isCompatible && !this.valuesAreEqual(
        oldConst.value,
        newConst.value,
        (reason) =>
          this.addChangeAt("unsupported", Breakage.WIRE, newConstLoc, {
            reason,
            node: toNodeRef(newConstNode),
          }),
      )
    ) {
      this.addChangeAt("constValueChanged", Breakage.CODE, newConstLoc, {
        changedNode: toNodeRef(newConstNode),
      });
    }
  }

  // ----------------------------------------------------------------------------------------------
  // MARK: Diff annotations

  private diffAnnotations(
    oldAnnotation: Node_Annotation,
    newAnnotation: Node_Annotation,
    newAnnotationNode: Node,
  ): void {
    const newAnnotationLoc = this.newNodeLoc(newAnnotationNode);

    this.diffType(
      oldAnnotation.type,
      newAnnotation.type,
      newAnnotationLoc,
      () => ({
        shortName: shortName(newAnnotationNode),
        which: "annotationId",
        annotationId: newAnnotationNode.id,
      }),
    );

    const boolToEnum = {
      targetsFile: SchemaChange_AnnotationTarget.FILE,
      targetsConst: SchemaChange_AnnotationTarget.CONST,
      targetsEnum: SchemaChange_AnnotationTarget.ENUM,
      targetsEnumerant: SchemaChange_AnnotationTarget.ENUMERANT,
      targetsStruct: SchemaChange_AnnotationTarget.STRUCT,
      targetsField: SchemaChange_AnnotationTarget.FIELD,
      targetsUnion: SchemaChange_AnnotationTarget.UNION,
      targetsGroup: SchemaChange_AnnotationTarget.GROUP,
      targetsInterface: SchemaChange_AnnotationTarget.INTERFACE,
      targetsMethod: SchemaChange_AnnotationTarget.METHOD,
      targetsParam: SchemaChange_AnnotationTarget.PARAM,
      targetsAnnotation: SchemaChange_AnnotationTarget.ANNOTATION,
    };

    for (const rawPropName in boolToEnum) {
      const propName = rawPropName as keyof typeof boolToEnum;
      const oldIsTarget = oldAnnotation[propName];
      const newIsTarget = newAnnotation[propName];

      if (oldIsTarget && !newIsTarget) {
        this.addChangeAt(
          "annotationTargetRemoved",
          Breakage.CODE,
          newAnnotationLoc,
          {
            annotation: {
              id: newAnnotationNode.id,
              shortName: shortName(newAnnotationNode),
            },
            removedTarget: boolToEnum[propName],
          },
        );
      } else if (!oldIsTarget && newIsTarget) {
        this.addChangeAt(
          "annotationTargetAdded",
          Breakage.NONE,
          newAnnotationLoc,
          {
            annotation: {
              id: newAnnotationNode.id,
              shortName: shortName(newAnnotationNode),
            },
            addedTarget: boolToEnum[propName],
          },
        );
      }
    }
  }

  // ----------------------------------------------------------------------------------------------
  // MARK: Diff types

  private diffStructTypes(
    oldStructId: bigint,
    newStructId: bigint,
    newStructLoc: Location,
    newNodeRef: () => ObjectForStruct<SchemaChange_TypedNodeRef>,
  ): void {
    const fakeStructType = (typeId: bigint) =>
      ({
        which: () => Type_Which.STRUCT,
        struct: {
          typeId,
          brand: {
            scopes: { length: 0 },
          },
        },
      }) as Type;

    this.diffType(
      fakeStructType(oldStructId),
      fakeStructType(newStructId),
      newStructLoc,
      newNodeRef,
    );
  }

  private diffType(
    oldType: Type,
    newType: Type,
    newTypeLoc: Location,
    newNodeRef: () => ObjectForStruct<SchemaChange_TypedNodeRef>,
  ): boolean {
    const compatibility = typeCompatibility(oldType, newType, this.newNodeById);

    switch (compatibility) {
      case TypeCompatibility.Same:
      case TypeCompatibility.Equivalent:
        return true;

      case TypeCompatibility.Compatible:
      case TypeCompatibility.Incompatible: {
        this.addChangeAt(
          "nodeTypeChanged",
          compatibility === TypeCompatibility.Incompatible
            ? Breakage.WIRE
            : Breakage.CODE,
          newTypeLoc,
          {
            changedNode: newNodeRef(),
          },
        );

        return compatibility === TypeCompatibility.Compatible;
      }
    }
  }

  // ----------------------------------------------------------------------------------------------
  // MARK: Diff values

  private valuesAreEqual(
    oldValue: Value,
    newValue: Value,
    addUnsupportedError: (reason: string) => void,
  ): boolean {
    try {
      return valuesAreEqual(oldValue, newValue);
    } catch (e) {
      addUnsupportedError((e as Error).message);

      return true;
    }
  }

  // ----------------------------------------------------------------------------------------------
  // MARK: Helper methods

  private addChange<Which extends SchemaChangeObj["which"]>(
    which: Which,
    breakage: OneOfBreakages[Which],
    startByte: number,
    endByte: number,
    value: ObjectForStruct<SchemaChange[Which]>,
  ): void {
    const fileId = this.currentFileId;

    this.changedFileNames.set(
      fileId,
      this.newNodeById.get(fileId)?.displayName ??
        this.oldNodeById.get(fileId)?.displayName!,
    );

    this.addChangeFunction({
      breakage,
      fileId,
      startByte,
      endByte,
      which,
      [which]: value,
    } as unknown as SchemaChangeObj);
  }

  private addChangeAt<Which extends SchemaChangeObj["which"]>(
    which: Which,
    breakage: OneOfBreakages[Which],
    loc: Location,
    value: ObjectForStruct<SchemaChange[Which]>,
  ): void {
    this.addChange(which, breakage, loc.startByte, loc.endByte, value);
  }

  private newNodeLoc(node: Node): Location {
    return this.newNodeLocById.get(node.id) ?? node;
  }
  private oldNodeLoc(node: Node): Location {
    return this.oldNodeLocById.get(node.id) ?? node;
  }

  private newMemberLoc(
    node: Node,
    memberOrdinal: number,
  ): Location {
    return this.newNodeLocById.get(memberId(node.id, memberOrdinal)) ?? node;
  }
  private oldMemberLoc(
    node: Node,
    memberOrdinal: number,
  ): Location {
    return this.oldNodeLocById.get(memberId(node.id, memberOrdinal)) ?? node;
  }
}

// ------------------------------------------------------------------------------------------------
// MARK: Helpers

function shortName(node: Node): string {
  return node.displayName.slice(node.displayNamePrefixLength);
}

function toNodeRef(node: Node): ObjectForStruct<SchemaChange_NodeRef> {
  const nodeWhich = node.which();
  const shortName = node.displayName.slice(node.displayNamePrefixLength);

  switch (nodeWhich) {
    case Node_Which.FILE:
      return {
        shortName,
        kind: SchemaChange_NodeRef.Kind.FILE,
        id: node.id,
      };
    case Node_Which.STRUCT:
      return {
        shortName,
        kind: SchemaChange_NodeRef.Kind.STRUCT,
        id: node.id,
      };
    case Node_Which.ENUM:
      return {
        shortName,
        kind: SchemaChange_NodeRef.Kind.ENUM,
        id: node.id,
      };
    case Node_Which.INTERFACE:
      return {
        shortName,
        kind: SchemaChange_NodeRef.Kind.INTERFACE,
        id: node.id,
      };
    case Node_Which.CONST:
      return {
        shortName,
        kind: SchemaChange_NodeRef.Kind.CONST,
        id: node.id,
      };
    case Node_Which.ANNOTATION:
      return {
        shortName,
        kind: SchemaChange_NodeRef.Kind.ANNOTATION,
        id: node.id,
      };

    default:
      throw new Error(`unknown node kind ${nodeWhich satisfies never}`);
  }
}

function fieldToNodeRef(
  parent: Node,
  ordinal: number,
  name: string,
): ObjectForStruct<SchemaChange_NodeRef> {
  return {
    shortName: name,
    kind: SchemaChange_NodeRef.Kind.FIELD,
    id: parent.id,
    ordinal,
  };
}

function fieldToTypedNodeRef(
  parent: Node,
  ordinal: number,
  name: string,
): ObjectForStruct<SchemaChange_TypedNodeRef> {
  return {
    shortName: name,
    kind: SchemaChange_TypedNodeRef.Kind.FIELD,
    id: parent.id,
    ordinal,
  };
}

function enumerantToNodeRef(
  parent: Node,
  ordinal: number,
  name: string,
): ObjectForStruct<SchemaChange_NodeRef> {
  return {
    shortName: name,
    kind: SchemaChange_NodeRef.Kind.ENUMERANT,
    id: parent.id,
    ordinal,
  };
}

/**
 * Returns a fake ID used to refer to a `member` in its parent `node`.
 */
function memberId(nodeId: bigint, memberOrdinal: number): bigint {
  return nodeId << 64n | BigInt(memberOrdinal);
}
