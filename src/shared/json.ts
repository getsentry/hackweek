export type JsonInput =
  | boolean
  | null
  | number
  | string
  | JsonInput[]
  | JsonObject
  | undefined;

export interface JsonObject {
  [key: string]: JsonInput;
}

export function isJsonObject<T>(value: T): value is T & JsonObject {
  return (
    value !== null &&
    value !== undefined &&
    !Array.isArray(value) &&
    Object.prototype.toString.call(value) === '[object Object]'
  );
}

export function isJsonString<T>(value: T): value is T & string {
  return Object.prototype.toString.call(value) === '[object String]';
}

export function isJsonNumber<T>(value: T): value is T & number {
  return Object.prototype.toString.call(value) === '[object Number]';
}

export function isJsonBoolean<T>(value: T): value is T & boolean {
  return Object.prototype.toString.call(value) === '[object Boolean]';
}
