import { afterEach, describe, expect, it, vi } from 'vitest';

afterEach(() => {
  vi.resetModules();
  vi.unstubAllGlobals();
});

describe('desktop API readiness', () => {
  it('retries a failed startup fetch before succeeding', async () => {
    vi.stubGlobal('__TAURI_INTERNALS__', {});
    const fetchMock = vi.fn()
      .mockRejectedValueOnce(new TypeError('Failed to fetch'))
      .mockResolvedValueOnce(new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      }));
    vi.stubGlobal('fetch', fetchMock);

    const { waitForLocalApi } = await import('../src/api');
    await expect(waitForLocalApi({ attempts: 2, delayMs: 0 })).resolves.toBeUndefined();
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock).toHaveBeenLastCalledWith('http://127.0.0.1:4281/api/health', expect.any(Object));
  });

  it('does not poll the sidecar in the browser/server edition', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    const { waitForLocalApi } = await import('../src/api');
    await expect(waitForLocalApi()).resolves.toBeUndefined();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
