import { Node, type Type, Type_Which } from "../capnp/schema.ts";

export const enum TypeCompatibility {
  /** Two types are exactly the same. */
  Same,
  /** Two types are different, but equivalent (e.g. when making a type generic). */
  Equivalent,
  /**
   * Two types are different, but compatible (e.g. when going from a list of primitives to a list
   * of structs starting with that primitive).
   */
  Compatible,
  /** Two types are different and incompatible. */
  Incompatible,
}

/**
 * Computes the {@linkcode TypeCompatibility} between `oldType` and `newType`.
 */
export function typeCompatibility(
  oldType: Type,
  newType: Type,
  newNodeById: ReadonlyMap<bigint, Node>,
): TypeCompatibility {
  const oldWhich = oldType.which();
  const newWhich = newType.which();

  if (oldWhich !== newWhich) {
    switch (newWhich) {
      case Type_Which.ANY_POINTER:
        // See https://capnproto.org/language.html#dynamically-typed-fields.
        switch (oldWhich) {
          case Type_Which.TEXT:
          case Type_Which.DATA:
          case Type_Which.LIST:
          case Type_Which.STRUCT:
          case Type_Which.INTERFACE:
            return TypeCompatibility.Compatible;
        }
        return TypeCompatibility.Incompatible;

      case Type_Which.UINT16:
        // See https://capnproto.org/encoding.html#enums.
        return oldWhich === Type_Which.ENUM
          ? TypeCompatibility.Compatible
          : TypeCompatibility.Incompatible;

      case Type_Which.DATA:
        // We can go from `Text` (UTF-8 valid bytes) or `List(UInt8)` to `Data` (arbitrary
        // bytes).
        return oldWhich === Type_Which.TEXT ||
            (oldWhich === Type_Which.LIST &&
              oldType.list.elementType.which() === Type_Which.UINT8)
          ? TypeCompatibility.Compatible
          : TypeCompatibility.Incompatible;

      case Type_Which.LIST:
        // We can go from `Data` to `List(UInt8)`.
        return oldWhich === Type_Which.DATA &&
            newType.list.elementType.which() === Type_Which.UINT8
          ? TypeCompatibility.Compatible
          : TypeCompatibility.Incompatible;

      default:
        return TypeCompatibility.Incompatible;
    }
  }

  switch (oldWhich) {
    case Type_Which.VOID:
    case Type_Which.BOOL:
    case Type_Which.INT8:
    case Type_Which.INT16:
    case Type_Which.INT32:
    case Type_Which.INT64:
    case Type_Which.UINT8:
    case Type_Which.UINT16:
    case Type_Which.UINT32:
    case Type_Which.UINT64:
    case Type_Which.FLOAT32:
    case Type_Which.FLOAT64:
    case Type_Which.TEXT:
    case Type_Which.DATA:
    case Type_Which.ANY_POINTER:
      return TypeCompatibility.Same;

    case Type_Which.ENUM:
      return oldType.enum.typeId === newType.enum.typeId
        ? TypeCompatibility.Same
        : TypeCompatibility.Incompatible;

    case Type_Which.LIST: {
      const oldElementType = oldType.list.elementType;
      const newElementType = newType.list.elementType;

      if (oldElementType.which() === newElementType.which()) {
        return typeCompatibility(oldElementType, newElementType, newNodeById);
      }

      // Implement check for ability to upgrade structs from `List(T)` to `List(U)` in
      // https://capnproto.org/language.html#evolving-your-protocol.
      if (newElementType.which() !== Type_Which.STRUCT) {
        return TypeCompatibility.Incompatible;
      }

      const newStruct = newNodeById.get(newElementType.struct.typeId)!;
      const newStructFirstField = newStruct.struct.fields[0];

      if (newStructFirstField?._isSlot !== true) {
        return TypeCompatibility.Incompatible;
      }

      const newStructFirstFieldType = newStructFirstField.slot.type;

      switch (oldElementType.which()) {
        // Note: `List(Bool)` is explicitly not allowed to be modified this way.
        case Type_Which.INT8:
        case Type_Which.INT16:
        case Type_Which.INT32:
        case Type_Which.INT64:
        case Type_Which.UINT8:
        case Type_Which.UINT16:
        case Type_Which.UINT32:
        case Type_Which.UINT64:
        case Type_Which.FLOAT32:
        case Type_Which.FLOAT64:
        case Type_Which.TEXT:
        case Type_Which.DATA:
          return oldElementType.which() === newStructFirstFieldType.which()
            ? TypeCompatibility.Compatible
            : TypeCompatibility.Incompatible;

        case Type_Which.LIST:
          return typeCompatibility(
            oldElementType,
            newStructFirstFieldType,
            newNodeById,
          );
      }
      return TypeCompatibility.Incompatible;
    }

    case Type_Which.STRUCT: {
      const oldStructType = oldType.struct;
      const newStructType = newType.struct;

      if (
        oldStructType.brand.scopes.length +
            newStructType.brand.scopes.length !== 0
      ) {
        throw new Error(
          `compatibility of generic structs is not yet supported`,
        );
      }

      return oldStructType.typeId === newStructType.typeId
        ? TypeCompatibility.Same
        : TypeCompatibility.Incompatible;
    }

    case Type_Which.INTERFACE: {
      const oldInterfaceType = oldType.interface;
      const newInterfaceType = newType.interface;

      if (
        oldInterfaceType.brand.scopes.length +
            newInterfaceType.brand.scopes.length !== 0
      ) {
        throw new Error(
          `compatibility of generic interfaces is not yet supported`,
        );
      }

      return oldInterfaceType.typeId === newInterfaceType.typeId
        ? TypeCompatibility.Same
        : TypeCompatibility.Incompatible;
    }

    default:
      throw new Error(`unknown type kind ${oldWhich satisfies never}`);
  }
}
