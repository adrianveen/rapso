import { describe, it, expect, vi } from 'vitest';

vi.mock('../app/shopify.server', () => ({
  authenticate: { public: { appProxy: async () => {} } },
}));

vi.mock('../app/utils/env.server', () => ({ env: { BACKEND_URL: 'https://backend.example' } }));

vi.mock('../app/db.server', () => ({ default: { modelRun: { create: vi.fn().mockResolvedValue({}), updateMany: vi.fn().mockResolvedValue({}) } } }));

describe('fit.commit action', () => {
  it('requires object_keys', async () => {
    const mod = await import('../app/routes/fit.commit');
    const req = new Request('https://store/apps/rapso/fit/commit?shop=x', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({}) });
    const res = await mod.action({ request: req } as any);
    expect(res.status).toBe(400);
  });

  it('forbids customer_id mismatch', async () => {
    const mod = await import('../app/routes/fit.commit');
    vi.spyOn(global, 'fetch').mockResolvedValue({ ok: true, text: async () => 'ok' } as any);
    const body = { object_keys: ['k'], customer_id: '999' };
    const req = new Request('https://store/apps/rapso/fit/commit?shop=x&logged_in_customer_id=123', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
    const res = await mod.action({ request: req } as any);
    expect(res.status).toBe(403);
  });
});

