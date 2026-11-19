import { DatabaseService } from '../database.service.js';
import { DataQualityService } from './data-quality.service.js';

describe('DataQualityService', () => {
  it('maps the counts and derives the unit difference', async () => {
    const query = vi.fn().mockResolvedValue({
      rows: [
        {
          order_rows: 122370,
          excluded: 33,
          blank_size: 16,
          duplicates: 2559,
          pick_rows: 215192,
          pick_units: 215192,
          order_units: 228195,
          order_wave_count: 1000,
          pick_wave_count: 923,
          missing_waves: 77,
        },
      ],
    });
    const service = new DataQualityService({
      query,
    } as unknown as DatabaseService);
    const result = await service.compute();
    expect(result.customerOrder).toEqual({
      rows: 122370,
      excludedQuantityZero: 33,
      blankSizeUnknown: 16,
      exactDuplicates: 2559,
    });
    expect(result.sourceDisagreement).toMatchObject({
      wavesMissingFromPicking: 77,
      unitsDifference: 13003,
    });
  });
});
