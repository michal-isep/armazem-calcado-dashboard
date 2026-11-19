import { BadRequestException, Controller, Get, Query } from '@nestjs/common';
import { AbcParamError, parseAbcParams } from '../abc/abc.js';
import { QueryFilters } from '../filters/query-filters.decorator.js';
import type { Filters } from '../filters/filters.js';
import { AisleService, type AisleResult } from './aisle.service.js';

@Controller('indicators')
export class AisleController {
  constructor(private readonly aisle: AisleService) {}

  // X3 picks by aisle and A1 aisle share of picks (proxy, not Sector). Query:
  // the global filters plus basis, thresholdA and thresholdB, which choose the
  // ABC the classes come from (as on /indicators/abc).
  @Get('aisle-picks')
  async getAislePicks(
    @QueryFilters() filters: Filters,
    @Query() query: Record<string, unknown>,
  ): Promise<AisleResult> {
    try {
      const { basis, thresholds } = parseAbcParams(query);
      return await this.aisle.compute(filters, basis, thresholds);
    } catch (error) {
      if (error instanceof AbcParamError) {
        throw new BadRequestException(error.message);
      }
      throw error;
    }
  }
}
