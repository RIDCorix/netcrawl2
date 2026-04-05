/**
 * client.ts
 *
 * HTTP client for communicating with the NetCrawl API server.
 * Uses Node.js built-in fetch (Node 18+) for zero dependencies.
 */

export async function httpPost(url: string, data: Record<string, unknown>, timeout: number = 10000): Promise<Record<string, unknown>> {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeout);
    const resp = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
      signal: controller.signal,
    });
    clearTimeout(timer);
    const text = await resp.text();
    try {
      return JSON.parse(text);
    } catch {
      return { ok: false, error: `HTTP ${resp.status}: ${text}` };
    }
  } catch (e: unknown) {
    return { ok: false, error: String(e) };
  }
}

export async function httpGet(url: string, timeout: number = 10000): Promise<Record<string, unknown>> {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeout);
    const resp = await fetch(url, {
      method: 'GET',
      signal: controller.signal,
    });
    clearTimeout(timer);
    const text = await resp.text();
    try {
      return JSON.parse(text);
    } catch {
      return { ok: false, error: `HTTP ${resp.status}: ${text}` };
    }
  } catch (e: unknown) {
    return { ok: false, error: String(e) };
  }
}

/**
 * Synchronous-style HTTP client for worker subprocess -> game server communication.
 *
 * NOTE: Unlike the Python SDK which uses synchronous urllib, JavaScript fetch is
 * inherently async. All action() calls return Promises that must be awaited.
 * The runner and base class handle this by making lifecycle methods async.
 */
export class ApiClient {
  private apiUrl: string;
  readonly workerId: string;

  constructor(apiUrl: string, workerId: string) {
    this.apiUrl = apiUrl.replace(/\/+$/, '');
    this.workerId = workerId;
  }

  async action(action: string, payload: Record<string, unknown>): Promise<Record<string, unknown>> {
    return httpPost(`${this.apiUrl}/api/worker/action`, {
      workerId: this.workerId,
      action,
      payload,
    });
  }
}
