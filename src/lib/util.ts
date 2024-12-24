export function isPositiveInt(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value > 0;
}

export async function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export function compareFields(
  a: Record<string, unknown>,
  b: Record<string, unknown>,
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

export async function waitForState({
  checkFn,
  pollingInterval = 2000,
  maxAttempts = 90,
  errorMsg = 'Desired state was not reached'
}: {
  checkFn: () => Promise<boolean>;
  pollingInterval?: number;
  maxAttempts?: number;
  errorMsg?: string;
}) {
  let attempts = 0;

  while (attempts < maxAttempts) {
    const result = await checkFn();

    if (result) {
      return;
    }

    await sleep(pollingInterval);

    attempts++;
  }

  const elapsedSeconds = (maxAttempts * pollingInterval) / 1000;

  throw new Error(`${errorMsg} after ${elapsedSeconds} seconds.`);
}
