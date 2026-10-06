import { describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';

describe('api smoke', () => {
  it('GET /api/health returns ok', async () => {
    const app = createApp();
    const server = app.listen(0);
    try {
      const address = server.address();
      if (!address || typeof address === 'string') {
        throw new Error('failed to acquire a port for the test server');
      }
      const res = await fetch(`http://127.0.0.1:${address.port}/api/health`);
      expect(res.status).toBe(200);
      const body = (await res.json()) as { status: string };
      expect(body.status).toBe('ok');
    } finally {
      server.close();
    }
  });
});
