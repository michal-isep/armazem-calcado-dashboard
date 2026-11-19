import { ServiceUnavailableException } from '@nestjs/common';
import { HealthController } from './health.controller.js';
import type { DatabaseService } from './database.service.js';

describe('HealthController', () => {
  it('returns ok when the database answers', async () => {
    const db = { ping: async () => {} } as unknown as DatabaseService;
    await expect(new HealthController(db).check()).resolves.toEqual({
      status: 'ok',
      database: 'up',
    });
  });

  it('throws 503 when the database is unreachable', async () => {
    const db = {
      ping: async () => {
        throw new Error('down');
      },
    } as unknown as DatabaseService;
    await expect(new HealthController(db).check()).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
  });
});
