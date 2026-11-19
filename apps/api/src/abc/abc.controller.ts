import { BadRequestException, Controller, Get, Query } from '@nestjs/common';
import { QueryFilters } from '../filters/query-filters.decorator.js';
import type { Filters } from '../filters/filters.js';
import { AbcParamError, parseAbcParams } from './abc.js';
import { AbcService, type AbcResult } from './abc.service.js';

@Controller('indicators')
export class AbcController {
  constructor(private readonly abc: AbcService) {}

  // M1 ABC classification. Query: the global filters plus basis (lines |
  // units, default lines), thresholdA and thresholdB (default 80 and 95).
  @Get('abc')
  async getAbc(
    @QueryFilters() filters: Filters,
    @Query() query: Record<string, unknown>,
  ): Promise<AbcResult> {
    try {
      const { basis, thresholds } = parseAbcParams(query);
      return await this.abc.compute(filters, basis, thresholds);
    } catch (error) {
      if (error instanceof AbcParamError) {
        throw new BadRequestException(error.message);
      }
      throw error;
    }
  }
}
