import { Controller, Get } from '@nestjs/common';
import { QueryFilters } from '../filters/query-filters.decorator.js';
import type { Filters } from '../filters/filters.js';
import {
  AbcComparisonService,
  type AbcComparisonResult,
} from './abc-comparison.service.js';
import { AbcSizesService, type AbcSizesResult } from './abc-sizes.service.js';
import { QueryAbcParams } from './abc-params.decorator.js';
import { AbcService, type AbcParams, type AbcResult } from './abc.service.js';

@Controller('indicators')
export class AbcController {
  constructor(
    private readonly abc: AbcService,
    private readonly comparison: AbcComparisonService,
    private readonly sizes: AbcSizesService,
  ) {}

  // M1 ABC classification. Query: the global filters plus basis (lines |
  // units, default lines), thresholdA and thresholdB (default 80 and 95).
  @Get('abc')
  async getAbc(
    @QueryFilters() filters: Filters,
    @QueryAbcParams() abc: AbcParams,
  ): Promise<AbcResult> {
    return this.abc.compute(filters, abc);
  }

  // Sizes of one reference (last drill-down level). `reference` is required;
  // `basis` orders the sizes. Same filters as /indicators/abc.
  @Get('abc/sizes')
  getSizes(
    @QueryFilters() filters: Filters,
    @QueryAbcParams() abc: AbcParams,
  ): Promise<AbcSizesResult> {
    return this.sizes.compute(filters, abc.basis);
  }

  // X4 computed ABC vs Product.ABCCOD, per product, with the match count. Same
  // query as /indicators/abc.
  @Get('abc-comparison')
  getAbcComparison(
    @QueryFilters() filters: Filters,
    @QueryAbcParams() abc: AbcParams,
  ): Promise<AbcComparisonResult> {
    return this.comparison.compute(filters, abc);
  }
}
