import { describe, it, expect, vi } from 'vitest';

vi.mock('../app/shopify.server', () => ({
  authenticate: { public: { appProxy: async () => {} } },
}));

const upsert = vi.fn().mockResolvedValue({});
vi.mock('../app/db.server', () => ({
  default: { customerProfile: { upsert } },
}));

describe('save-height action', () => {
  it('sets Cache-Control: no-store on success', async () => {
    const mod = await import('../app/routes/save-height');
    const form = new FormData();
    form.append('height_cm', '172');
    form.append('customer_id', '123');
    const req = new Request('https://store/apps/rapso/save-height?shop=x&logged_in_customer_id=123', {
      method: 'POST',
      body: form,
    });
    const res = await mod.action({ request: req } as any);
    expect(res.headers.get('cache-control')).toMatch(/no-store/i);
    expect(res.status).toBe(200);
  });

  it('sets Cache-Control: no-store on error', async () => {
    upsert.mockRejectedValueOnce(new Error('boom'));
    const mod = await import('../app/routes/save-height');
    const form = new FormData();
    form.append('height_cm', '172');
    form.append('customer_id', '123');
    const req = new Request('https://store/apps/rapso/save-height?shop=x&logged_in_customer_id=123', {
      method: 'POST',
      body: form,
    });
    const res = await mod.action({ request: req } as any);
    expect(res.headers.get('cache-control')).toMatch(/no-store/i);
    expect(res.status).toBe(500);
  });
});

