import { describe, it, expect, vi } from 'vitest';

vi.mock('../app/shopify.server', () => ({
  authenticate: { public: { appProxy: async () => {} } },
}));

vi.mock('../app/db.server', () => ({ default: { customerProfile: { findUnique: vi.fn().mockResolvedValue({ heightCentimetres: 170 }) } } }));

describe('fit.height loader', () => {
  it('401 when not logged in', async () => {
    const mod = await import('../app/routes/fit.height');
    const req = new Request('https://store/apps/rapso/fit/height?shop=x');
    const res = await mod.loader({ request: req } as any);
    expect(res.status).toBe(401);
  });

  it('returns height when logged in', async () => {
    const mod = await import('../app/routes/fit.height');
    const req = new Request('https://store/apps/rapso/fit/height?shop=x&logged_in_customer_id=123');
    const res = await mod.loader({ request: req } as any);
    expect(res.status).toBe(200);
  });
});

