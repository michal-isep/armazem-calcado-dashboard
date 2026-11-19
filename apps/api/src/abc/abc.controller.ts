import { Controller, Get } from '@nestjs/common';
import { QueryFilters } from '../filters/query-filters.decorator.js';
import type { Filters } from '../filters/filters.js';
import { QueryAbcParams } from './abc-params.decorator.js';
import { AbcService, type AbcParams, type AbcResult } from './abc.service.js';

@Controller('indicators')
export class AbcController {
  constructor(private readonly abc: AbcService) {}

  // M1 ABC classification. Query: the global filters plus basis (lines |
  // units, default lines), thresholdA and thresholdB (default 80 and 95).
  @Get('abc')
  async getAbc(
    @QueryFilters() filters: Filters,
    @QueryAbcParams() abc: AbcParams,
  ): Promise<AbcResult> {
    return this.abc.compute(filters, abc);
  }
}
