import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../app/shopify.server', () => ({
  authenticate: { public: { appProxy: async () => {} } },
}));

vi.mock('../app/utils/env.server', () => ({
  env: { BACKEND_URL: 'https://example.com' },
}));

describe('fit.presign action', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('rejects non-image types', async () => {
    const mod = await import('../app/routes/fit.presign');
    const req = new Request('https://store/apps/rapso/fit/presign?shop=x', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ files: [{ name: 'x.txt', contentType: 'text/plain', size: 10 }] }),
    });
    const res = await mod.action({ request: req } as any);
    expect(res.status).toBe(400);
  });

  it('rate-limits rapid repeated requests', async () => {
    const mod = await import('../app/routes/fit.presign');
    vi.spyOn(global, 'fetch').mockResolvedValueOnce(new Response(JSON.stringify({ uploads: [{ url: 'https://u', fields: {}, object_key: 'k' }] }), { status: 200 }));
    const okReq = new Request('https://store/apps/rapso/fit/presign?shop=x&logged_in_customer_id=123', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ files: [{ name: 'p.jpg', contentType: 'image/jpeg', size: 1024 }] }),
    });
    const okRes = await mod.action({ request: okReq } as any);
    expect(okRes.status).toBe(200);

    const secondReq = new Request('https://store/apps/rapso/fit/presign?shop=x&logged_in_customer_id=123', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ files: [{ name: 'p2.jpg', contentType: 'image/jpeg', size: 1024 }] }),
    });
    const secondRes = await mod.action({ request: secondReq } as any);
    expect(secondRes.status).toBe(429);
  });
});

