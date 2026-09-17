/**
 * Option merging shared by the module resolver (plain Node) and runtime code:
 * nested objects merge, arrays and scalars replace. No imports on purpose.
 */
const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === "object" && !Array.isArray(value);

export function mergeOptions<T extends Record<string, unknown>>(defaults: T, overrides: Record<string, unknown> | undefined): T {
  const result: Record<string, unknown> = { ...defaults };
  for (const [key, value] of Object.entries(overrides ?? {})) {
    result[key] = isPlainObject(value) && isPlainObject(result[key]) ? mergeOptions(result[key] as Record<string, unknown>, value) : value;
  }
  return result as T;
}

/** Reads a dot path such as "content.pages". */
export function readPath(value: unknown, dotPath: string): unknown {
  return dotPath.split(".").reduce<unknown>((node, key) => (isPlainObject(node) ? node[key] : undefined), value);
}
