export function isPositiveInt(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value > 0;
}

export async function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export function compareFields(
  a: Record<string, any>,
  b: Record<string, any>,
  fields: string[]
): boolean {
  return fields.every(field => {
    return (
      (field in a && field in b && a[field] === b[field]) ||
      (!(field in a) && !(field in b)) ||
      (field in a && b[field] === undefined) ||
      (a[field] === undefined && field in b)
    );
  });
}

export function tryFn<T>(fn: () => T): T | Error {
  try {
    return fn();
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);

    return new Error(message, { cause: e });
  }
}
