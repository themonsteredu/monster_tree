/** Bounded mobile requests, including the response body read. No global timers. */
export async function fetchSocialJson<T>(url: string, init: RequestInit = {}): Promise<T> {
  const abort = new AbortController();
  const upstream = init.signal;
  const cancel = () => abort.abort();
  let rejectOnAbort: (() => void) | undefined;
  const cancelled = new Promise<never>((_, reject) => {
    rejectOnAbort = () => reject(new Error("social request cancelled"));
    abort.signal.addEventListener("abort", rejectOnAbort, { once: true });
  });
  if (upstream?.aborted) abort.abort();
  else upstream?.addEventListener("abort", cancel, { once: true });
  const timeout = window.setTimeout(cancel, 12_000);
  try {
    // Some WebViews/adapters do not settle a stalled body reader when aborted.
    // Racing the entire operation keeps the deadline real, and any late result
    // from that operation can no longer resolve the caller's promise.
    return await Promise.race([
      (async () => {
        const response = await fetch(url, { ...init, signal: abort.signal, credentials: "same-origin", cache: "no-store" });
        const body = await response.json() as T & { ok?: boolean; error?: string };
        if (!response.ok || body.ok !== true) throw new Error(body.error || "요청을 마치지 못했어요. 다시 눌러 주세요.");
        return body;
      })(),
      cancelled,
    ]);
  } catch (error) {
    if (abort.signal.aborted) throw new Error("연결이 오래 걸리고 있어요. 인터넷을 확인한 뒤 다시 눌러 주세요.");
    throw error;
  } finally {
    window.clearTimeout(timeout);
    if (rejectOnAbort) abort.signal.removeEventListener("abort", rejectOnAbort);
    upstream?.removeEventListener("abort", cancel);
  }
}
