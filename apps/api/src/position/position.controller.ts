import { BadRequestException, Controller, Get, Query } from '@nestjs/common';
import { AbcParamError, parseAbcParams } from '../abc/abc.js';
import { QueryFilters } from '../filters/query-filters.decorator.js';
import type { Filters } from '../filters/filters.js';
import {
  PositionService,
  type LocationCoverageResult,
  type ShelfPositionResult,
} from './position.service.js';

@Controller('indicators')
export class PositionController {
  constructor(private readonly position: PositionService) {}

  // X7 picks by shelf position (proxy, not distance). Query: the global
  // filters plus basis, thresholdA and thresholdB, which choose the ABC the
  // classes come from (as on /indicators/abc).
  @Get('shelf-position')
  async getShelfPosition(
    @QueryFilters() filters: Filters,
    @Query() query: Record<string, unknown>,
  ): Promise<ShelfPositionResult> {
    try {
      const { basis, thresholds } = parseAbcParams(query);
      return await this.position.shelfPosition(filters, basis, thresholds);
    } catch (error) {
      if (error instanceof AbcParamError) {
        throw new BadRequestException(error.message);
      }
      throw error;
    }
  }

  // X8 location coverage: picks with and without coordinates. Same query as
  // above (the ABC params only matter with the abcClass filter).
  @Get('location-coverage')
  async getLocationCoverage(
    @QueryFilters() filters: Filters,
    @Query() query: Record<string, unknown>,
  ): Promise<LocationCoverageResult> {
    try {
      const { basis, thresholds } = parseAbcParams(query);
      return await this.position.locationCoverage(filters, basis, thresholds);
    } catch (error) {
      if (error instanceof AbcParamError) {
        throw new BadRequestException(error.message);
      }
      throw error;
    }
  }
}
