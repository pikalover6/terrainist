/**
 * Minimal typed NBT tag model.
 *
 * `prismarine-nbt` consumes plain objects of the shape `{ type, value }`; it
 * ships no usable types for the *authoring* direction, so we model the subset
 * we need here and let the adapter serialise it.
 *
 * Longs are `[high, low]` signed-int32 pairs, which is what prismarine-nbt's
 * writer expects.
 */

/** A 64-bit value as prismarine-nbt represents it: `[high, low]`. */
export type NbtLongValue = readonly [number, number];

/** The long `0`. Used everywhere a timestamp would otherwise leak wall-clock. */
export const LONG_ZERO: NbtLongValue = [0, 0];

export interface NbtByte {
  readonly type: "byte";
  readonly value: number;
}
export interface NbtShort {
  readonly type: "short";
  readonly value: number;
}
export interface NbtInt {
  readonly type: "int";
  readonly value: number;
}
export interface NbtLong {
  readonly type: "long";
  readonly value: NbtLongValue;
}
export interface NbtFloat {
  readonly type: "float";
  readonly value: number;
}
export interface NbtDouble {
  readonly type: "double";
  readonly value: number;
}
export interface NbtString {
  readonly type: "string";
  readonly value: string;
}
export interface NbtCompound {
  readonly type: "compound";
  readonly value: NbtCompoundValue;
}
export interface NbtList {
  readonly type: "list";
  readonly value: NbtListValue;
}
export interface NbtIntArray {
  readonly type: "intArray";
  readonly value: readonly number[];
}

/** The body of a compound tag: named child tags. */
export type NbtCompoundValue = { readonly [key: string]: NbtTag };

/** The body of a list tag: an element type plus a homogeneous array. */
export type NbtListValue =
  | { readonly type: "end"; readonly value: readonly never[] }
  | { readonly type: "string"; readonly value: readonly string[] }
  | { readonly type: "int"; readonly value: readonly number[] }
  | { readonly type: "compound"; readonly value: readonly NbtCompoundValue[] };

export type NbtTag =
  | NbtByte
  | NbtShort
  | NbtInt
  | NbtLong
  | NbtFloat
  | NbtDouble
  | NbtString
  | NbtCompound
  | NbtList
  | NbtIntArray;

/** A whole NBT document: an (almost always unnamed) root compound. */
export interface NbtRoot {
  readonly type: "compound";
  readonly name: string;
  readonly value: NbtCompoundValue;
}

export const byte = (value: number): NbtByte => ({ type: "byte", value });
export const bool = (value: boolean): NbtByte => ({ type: "byte", value: value ? 1 : 0 });
export const short = (value: number): NbtShort => ({ type: "short", value });
export const int = (value: number): NbtInt => ({ type: "int", value });
export const long = (value: NbtLongValue = LONG_ZERO): NbtLong => ({ type: "long", value });
export const float = (value: number): NbtFloat => ({ type: "float", value });
export const double = (value: number): NbtDouble => ({ type: "double", value });
export const string = (value: string): NbtString => ({ type: "string", value });
export const compound = (value: NbtCompoundValue): NbtCompound => ({ type: "compound", value });
export const intArray = (value: readonly number[]): NbtIntArray => ({ type: "intArray", value });

/** An empty list (element type `end`, as vanilla writes it). */
export const emptyList = (): NbtList => ({ type: "list", value: { type: "end", value: [] } });

export const stringList = (value: readonly string[]): NbtList =>
  value.length === 0 ? emptyList() : { type: "list", value: { type: "string", value } };

export const compoundList = (value: readonly NbtCompoundValue[]): NbtList =>
  value.length === 0 ? emptyList() : { type: "list", value: { type: "compound", value } };
