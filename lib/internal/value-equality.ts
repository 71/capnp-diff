import {
  AnyPointerList,
  ListElementSize,
  Pointer,
  PointerType,
  Struct,
  utils,
} from "capnp-es";
import { type Value, Value_Which } from "../capnp/schema.ts";

/**
 * Returns whether `oldValue` and `newValue` are equivalent. The values do not have to be fully
 * equal (e.g. this function returns true when comparing a null pointer to a pointer to an empty
 * list or zero struct).
 *
 * If an unsupported value is encountered, an error is thrown.
 */
export function valuesAreEqual(oldValue: Value, newValue: Value): boolean {
  if (oldValue.which() !== newValue.which()) {
    return differentTypesAreEqual(oldValue, newValue);
  }

  const commonWhich = oldValue.which();

  switch (commonWhich) {
    case Value_Which.VOID:
      return true;
    case Value_Which.BOOL:
      return oldValue.bool === newValue.bool;
    case Value_Which.INT8:
      return oldValue.int8 === newValue.int8;
    case Value_Which.INT16:
      return oldValue.int16 === newValue.int16;
    case Value_Which.INT32:
      return oldValue.int32 === newValue.int32;
    case Value_Which.INT64:
      return oldValue.int64 === newValue.int64;
    case Value_Which.UINT8:
      return oldValue.uint8 === newValue.uint8;
    case Value_Which.UINT16:
      return oldValue.uint16 === newValue.uint16;
    case Value_Which.UINT32:
      return oldValue.uint32 === newValue.uint32;
    case Value_Which.UINT64:
      return oldValue.uint64 === newValue.uint64;
    case Value_Which.FLOAT32:
      return oldValue.float32 === newValue.float32;
    case Value_Which.FLOAT64:
      return oldValue.float64 === newValue.float64;
    case Value_Which.TEXT:
      return oldValue.text === newValue.text;
    case Value_Which.ENUM:
      return oldValue.enum === newValue.enum;

    case Value_Which.DATA: {
      const oldData = oldValue.data;
      const newData = newValue.data;

      if (oldData.length !== newData.length) {
        return false;
      }

      for (let i = 0; i < oldData.length; i++) {
        if (oldData[i] !== newData[i]) {
          return false;
        }
      }

      return true;
    }

    case Value_Which.STRUCT:
      return structsAreEqual(oldValue.struct, newValue.struct);

    case Value_Which.LIST:
      return listsAreEqual(oldValue.list, newValue.list);

    case Value_Which.INTERFACE:
      // `interface` is always true, as its default value can only be `null`.
      return true;

    case Value_Which.ANY_POINTER:
      return pointersAreEqual(oldValue.anyPointer, newValue.anyPointer);

    default:
      throw new Error(`unknown value kind ${commonWhich satisfies never}`);
  }
}

function differentTypesAreEqual(a: Value, b: Value): boolean {
  switch (a.which()) {
    case Value_Which.ENUM:
      switch (b.which()) {
        case Value_Which.UINT16:
          return a.enum === b.uint16;
      }
      break;
  }

  throw new Error(
    `equality between ${valueWhichString[a.which()]} and ${
      valueWhichString[b.which()]
    } is not yet supported`,
  );
}

const valueWhichString = Object.keys(Value_Which);

/**
 * Returns whether `oldPointer` and `newPointer` point to equivalent structs.
 */
function structsAreEqual(oldPointer: Pointer, newPointer: Pointer): boolean {
  if (utils.isNull(oldPointer) && utils.isNull(newPointer)) {
    return true;
  }

  // Compare data in common.
  //
  const oldWords = utils.getStructDataWords(oldPointer);
  const oldOffset = utils.getOffsetWords(oldPointer);
  const oldSegment = oldPointer.segment;
  const newWords = utils.getStructDataWords(newPointer);
  const newOffset = utils.getOffsetWords(newPointer);
  const newSegment = newPointer.segment;

  const minWords = Math.min(oldWords, newWords);

  for (let i = 0; i < minWords; i++) {
    const firstHalfIsSame = oldSegment.getUint32(oldOffset + i * 4) ===
      newSegment.getUint32(newOffset + i * 4);
    const secondHalfIsSame = oldSegment.getUint32(oldOffset + (i + 1) * 4) ===
      newSegment.getUint32(newOffset + (i + 1) * 4);

    if (!firstHalfIsSame || !secondHalfIsSame) {
      return false;
    }
  }

  // Compare excess data. Zero words correspond to the default value (thanks to the Cap'n Proto XOR
  // trick), so we need to check that all remaining words are 0.
  //
  if (oldWords !== newWords) {
    const largerSegment = oldWords > newWords ? oldSegment : newSegment;
    const largerOffset = oldWords > newWords ? oldOffset : newOffset;
    const maxWords = Math.max(oldWords, newWords);

    for (let i = minWords; i < maxWords; i++) {
      if (
        largerSegment.getUint32(largerOffset + i * 4) !== 0 ||
        largerSegment.getUint32(largerOffset + (i + 1) * 4) !== 0
      ) {
        return false;
      }
    }
  }

  // Compare pointers in common.
  //
  const oldStruct = new Struct(oldSegment, oldOffset);
  const newStruct = new Struct(newSegment, newOffset);
  const oldPointers = utils.getStructPointerLength(oldPointer);
  const newPointers = utils.getStructPointerLength(newPointer);

  const minPointers = Math.min(oldPointers, newPointers);

  for (let i = 0; i < minPointers; i++) {
    const oldPointer = utils.getPointer(i, oldStruct);
    const newPointer = utils.getPointer(i, newStruct);

    if (!pointersAreEqual(oldPointer, newPointer)) {
      return false;
    }
  }

  // Compare excess pointers.
  //
  if (oldPointers !== newPointers) {
    const largerStruct = oldPointers > newPointers ? oldStruct : newStruct;
    const maxPointers = Math.max(oldPointers, newPointers);

    for (let i = minPointers; i < maxPointers; i++) {
      const pointer = utils.getPointer(i, largerStruct);

      if (!isDefaultPointer(pointer)) {
        return false;
      }
    }
  }

  return true;
}

/**
 * Returns whether `oldPointer` and `newPointer` point to equivalent lists.
 */
function listsAreEqual(oldPointer: Pointer, newPointer: Pointer): boolean {
  if (utils.isNull(oldPointer) && utils.isNull(newPointer)) {
    return true;
  }

  const oldLength = utils.getTargetListLength(oldPointer);
  const newLength = utils.getTargetListLength(newPointer);

  if (oldLength !== newLength) {
    return false;
  }

  if (oldLength === 0) { // Therefore `newLength === 0`.
    return true;
  }

  const oldElementSize = utils.getListElementSize(oldPointer);
  const newElementSize = utils.getListElementSize(newPointer);

  if (oldElementSize === newElementSize) {
    const oldOffset = utils.getOffsetWords(oldPointer);
    const oldSegment = oldPointer.segment;
    const newOffset = utils.getOffsetWords(newPointer);
    const newSegment = newPointer.segment;

    switch (oldElementSize) {
      case ListElementSize.VOID:
        return true;

      case ListElementSize.BIT:
      case ListElementSize.BYTE:
      case ListElementSize.BYTE_2:
      case ListElementSize.BYTE_4:
      case ListElementSize.BYTE_8: {
        const byteLength = utils.getListElementByteLength(oldElementSize);
        const wordsLength = byteLength / 8 + Number(byteLength % 8 !== 0);

        for (let i = 0; i < wordsLength; i++) {
          if (
            oldSegment.getUint32(oldOffset + i * 4) !==
              newSegment.getUint32(newOffset + i * 4) ||
            oldSegment.getUint32(oldOffset + (i + 1) * 4) !==
              newSegment.getUint32(newOffset + (i + 1) * 4)
          ) {
            return false;
          }
        }
        return true;
      }

      case ListElementSize.POINTER: {
        const oldList = new AnyPointerList(oldSegment, oldOffset);
        const newList = new AnyPointerList(newSegment, newOffset);

        for (let i = 0; i < oldLength; i++) {
          if (!pointersAreEqual(oldList.get(i), newList.get(i))) {
            return false;
          }
        }
        return true;
      }

      case ListElementSize.COMPOSITE: {
        for (let i = 0; i < oldLength; i++) {
          const oldStruct = new Struct(oldSegment, oldOffset, undefined, i);
          const newStruct = new Struct(newSegment, newOffset, undefined, i);

          if (!structsAreEqual(oldStruct, newStruct)) {
            return false;
          }
        }
        return true;
      }

      default:
        throw new Error(
          `unknown list element size ${oldElementSize satisfies never}`,
        );
    }
  }

  throw new Error("equality of differently typed lists is not yet supported");
}

/**
 * Returns whether `oldPointer` and `newPointer` point to equivalent values.
 */
function pointersAreEqual(oldPointer: Pointer, newPointer: Pointer): boolean {
  if (utils.isNull(oldPointer) && utils.isNull(newPointer)) {
    return true;
  }

  const oldPointerType = utils.getTargetPointerType(oldPointer);
  const newPointerType = utils.getTargetPointerType(newPointer);

  if (oldPointerType !== newPointerType) {
    return false;
  }

  switch (oldPointerType) {
    case PointerType.STRUCT:
      return structsAreEqual(oldPointer, newPointer);
    case PointerType.LIST:
      return listsAreEqual(oldPointer, newPointer);
    case PointerType.OTHER:
      throw new Error("interface pointer should be null");
    case PointerType.FAR:
      throw new Error("far pointer should have been resolved above");
  }
}

/**
 * Returns whether `pointer` corresponds to the default value for its type (i.e. it is null, or
 * points to an all-zero struct, or points to an empty list).
 */
function isDefaultPointer(pointer: Pointer): boolean {
  if (utils.isNull(pointer)) {
    return true;
  }

  switch (utils.getPointerType(pointer)) {
    case PointerType.STRUCT:
      break; // See below.
    case PointerType.LIST:
      return utils.getListLength(pointer) === 0;
    case PointerType.OTHER:
      throw new Error("interface pointer should be null");
    case PointerType.FAR:
      throw new Error("far pointer should have been resolved above");
  }

  const structWords = utils.getStructDataWords(pointer);
  const structOffset = utils.getOffsetWords(pointer);
  const structSegment = pointer.segment;

  for (let i = 0; i < structWords; i++) {
    if (
      structSegment.getUint32(structOffset + i * 4) !== 0 ||
      structSegment.getUint32(structOffset + (i + 1) * 4) !== 0
    ) {
      return false;
    }
  }

  const structPointers = utils.getStructPointerLength(pointer);

  for (let i = 0; i < structPointers; i++) {
    const pointer = utils.getPointer(
      i,
      new Struct(structSegment, structOffset),
    );

    if (!isDefaultPointer(pointer)) {
      return false;
    }
  }

  return true;
}
