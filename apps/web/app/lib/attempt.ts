import { ApiError } from './api';

export type Attempt<T> =
  { data: T; error?: undefined } | { data?: undefined; error: string };

/** The value or the API's error message, so a failure is shown, not hidden. */
export async function attempt<T>(p: Promise<T>): Promise<Attempt<T>> {
  try {
    return { data: await p };
  } catch (e) {
    return { error: e instanceof ApiError ? e.message : 'Request failed' };
  }
}
