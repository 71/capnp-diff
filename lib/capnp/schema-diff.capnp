@0x8da477514bc0df39;

using Schema = import "schema.capnp";

# -------------------------------------------------------------------------------------------------
# MARK: SchemaChange

struct SchemaChange {
  # Describes a change between two schemas.
  #
  # Note that source-only changes (e.g. fields being reordered or comments changing) are not
  # considered "changes".

  using NodeId = UInt64;
  # The identifier of a node, either specified explicitly in the source with `@0x...`, or computed
  # computed by the Cap'n Proto compiler based on identifiers and file IDs.

  using Identifier = Text;
  # The short identifier of a node, without any scope (e.g. `.`).

  enum Breakage {
    # What might break following a change?
    #
    # This is the "worst case" possible breakage. For instance, in the case of a field which was
    # never actually named in source code and is being renamed, the breakage will be `code` despite
    # no code actually breaking.

    none @0;
    # Nothing will break, this is completely backward compatible.

    code @1;
    # Code depending on generated code might break, e.g. an identifier changed.

    wire @2;
    # Encoded messages might break, e.g. a field type changed.
  }

  breakage @0 :Breakage;

  # -----------------------------------------------------------------------------------------------
  # MARK: Possible changes
  #
  # See https://capnproto.org/language.html#evolving-your-protocol for allowed changes.

  union {
    # Next ordinal: 28.

    unsupported :group $breakage(always = wire) {
      # An unsupported syntax node was used, which prevents further analysis.
      #
      # The exact breakage is unknown because the syntax node is not supported, so to be
      # conservative we use the highest level.

      node @5 :NodeRef;
      reason @6 :Text;
    }

    nodeAdded :group $breakage(always = none) {
      # A node (e.g. struct) was added.

      addedNode @7 :NodeRef;
    }

    nodeRemoved :group $breakage(oneOf = [wire, code]) {
      # A node (e.g. struct) was removed.
      #
      # For non-member nodes (e.g. structs), this is considered a source breaking change only
      # because the schema still compiles, which implies that the node was not used or its usages
      # were replaced with compatible types (e.g. enum -> `UInt16`) or incompatible types (in which
      # case another error will be emitted at usage sites).
      #
      # For member nodes (e.g. fields), this is considered a wire breaking change because another
      # incompatible member may be added again with the same ordinal in the future.

      removedNode @8 :NodeRef;
    }

    nodeRenamed :group $breakage(always = code) {
      # A node (e.g. struct) was renamed, but its ID stayed the same.

      renamedNode @9 :NodeRef;
      oldName @10 :Identifier;
    }

    nodeIdChanged :group $breakage(always = wire) {
      # A node (e.g. struct) had its ID changed.
      #
      # Because the ID changed, the node is actually a completely different node. We however try to
      # detect when only the ID changes (but the identifier / scope remains the same) to produce
      # friendlier error messages.

      changedNode @11 :NodeRef;
      oldId @12 :NodeId;
    }

    memberOrdinalChanged :group $breakage(always = wire) {
      # A member (e.g. field) had its ordinal changed.

      changedMember @26 :NodeRef;
      oldOrdinal @27 :UInt16;
    }

    nodeTypeChanged :group $breakage(oneOf = [wire, code]) {
      # A node's type (e.g. field or method return type) changed.

      # Typically, a type change is a wire breaking change, but it can be wire compatible if the
      # new type is compatible with the previous one (e.g. `enum` -> `UInt16`).

      changedNode @13 :TypedNodeRef;
      newType @14 :Schema.Type;
      oldType @15 :Schema.Type;
    }

    fieldDefaultValueChanged :group $breakage(always = wire) {
      # The default value of a field changed.

      changedNode @16 :NodeRef;
    }

    constValueChanged :group $breakage(always = code) {
      # The value of a const changed.

      changedNode @17 :NodeRef;
      newValue @18 :Schema.Value;
      oldValue @19 :Schema.Value;
    }

    annotationTargetAdded :group $breakage(always = none) {
      # An annotation target was added.

      annotation :group {
        id @20 :NodeId;
        shortName @21 :Identifier;
      }
      addedTarget @22 :AnnotationTarget;
    }

    annotationTargetRemoved :group $breakage(always = code) {
      # An annotation target was removed. Existing code using this annotation may no longer be valid.

      annotation :group {
        id @23 :NodeId;
        shortName @24 :Identifier;
      }
      removedTarget @25 :AnnotationTarget;
    }
  }

  # -----------------------------------------------------------------------------------------------
  # MARK: Source information

  fileId @1 :NodeId;
  # The identifier of the file where the change occurred. Use `SchemaDiff.files` to resolve the
  # name of the file.

  startByte @2 :UInt32;
  # The position in the original schema where the change starts.
  endByte @3 :UInt32;
  # The position in the original schema where the change ends.

  struct SourceInfo {
    startPosition :group {
      line @0 :UInt32;
      # The 1-based line number of the `startByte`.
      column @1 :UInt32;
      # The 1-based column number of the `startByte`.
    }
    endPosition :group {
      line @2 :UInt32;
      # The 1-based line number of the `endByte`.
      column @3 :UInt32;
      # The 1-based column number of the `endByte`.
    }
    snippet :group {
      # A snippet of the code which can be shown when reporting errors.

      lines @4 :List(Text);
      # The lines of the snippet surrounding `startPosition`. The first line corresponds to
      # `startLine`, and the last line can be obtained with `startLine + lines.length`.

      startLine @5 :UInt32;
      # The 1-based line number of the first line in the snippet.
    }
  }

  sourceInfo @4 :SourceInfo;
  # The source information of the change, if requested and `fileId` can be read.
  #
  # The location corresponds to the position of the "main" node referred by the change in its new
  # file, except for deletions in which case the change is located in the old file (as there exists
  # no corresponding location in the new file).

  # -----------------------------------------------------------------------------------------------
  # MARK: Common types.

  struct NodeRef {
    # A reference to a Cap'n Proto node.

    enum Kind {
      # The kind of node.

      file @0;
      struct @1;
      enum @2;
      interface @3;
      const @4;
      annotation @5;
      field @6;
      enumerant @7;
      method @8;
    }

    kind @0 :Kind;
    # The kind of the node.

    id @1 :NodeId;
    # The identifier of the node.
    #
    # If the node is a member (i.e. a field, enumerant, or method), this is the identifier of its
    # parent node (i.e. struct, enum, or interface), and the ordinal of the member is available in
    # `ordinal`.
    #
    # When referring to a node whose ID changed, this corresponds to the _new_ ID.

    ordinal @2 :UInt16;
    # If the node is a member, this is its identifier within its parent.

    shortName @3 :Identifier;
    # The "short" name of the node, e.g. for a field, its name.
    #
    # To obtain the qualified name of the node (e.g. for a field, the name of its containing type
    # followed by the name of the field), use `id` and build up the full name of the resolved node.
    #
    # When referring to a node whose name changed, this corresponds to the _new_ name.
  }

  struct TypedNodeRef {
    # A reference to a Cap'n Proto node which is typed.

    enum Kind {
      # The kind of node.

      const @0;
      annotation @1;
      field @2;
      methodInput @3;
      methodOutput @4;
    }

    kind @0 :Kind;

    id @1 :NodeId;
    # See `NodeRef.id`.
    ordinal @2 :UInt16;
    # See `NodeRef.parentId`.
    shortName @3 :Identifier;
    # See `NodeRef.shortName`.
  }

  enum AnnotationTarget {
    # The target of an annotation.
    #
    # See `Node.annotation`: https://github.com/capnproto/capnproto/blob/f8bcd72a0a469414b5fcbebb0192adfb6440396b/c%2B%2B/src/capnp/schema.capnp#L158-L169.

    file @0;
    const @1;
    enum @2;
    enumerant @3;
    struct @4;
    field @5;
    union @6;
    group @7;
    interface @8;
    method @9;
    param @10;
    annotation @11;
  }
}

# -------------------------------------------------------------------------------------------------
# MARK: SchemaDiff

struct SchemaDiff {
  # The difference between two schemas.

  changes @0 :List(SchemaChange);
  # The list of changes which occurred.

  struct File {
    id @0 :UInt64;
    # The identifier of the file (as given by `SchemaChange.fileId`).
    path @1 :Text;
    # The path of the file. This corresponds to the _new_ file path, except for removals in which
    # case this is the _old_ file path.
  }

  files @1 :List(File);
  # Information about the files which appear in `changes`.
}

# -------------------------------------------------------------------------------------------------
# MARK: Miscellaneous

struct BreakageAnnotation {
  union {
    always @0 :SchemaChange.Breakage;
    # This change always leads to the same breakage.

    oneOf @1 :List(SchemaChange.Breakage);
    # This change can lead to one of the breakages in the list.
  }
}

annotation breakage(group) :BreakageAnnotation;
