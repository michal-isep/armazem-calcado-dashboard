import {
  BadRequestException,
  Controller,
  Get,
  Param,
  Query,
} from '@nestjs/common';
import { QueryFilters } from '../filters/query-filters.decorator.js';
import type { Filters } from '../filters/filters.js';
import { QueryAbcParams } from '../abc/abc-params.decorator.js';
import type { AbcParams } from '../abc/abc.service.js';
import {
  WavesService,
  type WaveDetail,
  type WaveList,
} from './waves.service.js';
import { WaveParamError, parseListParams, parseWaveNumber } from './waves.js';

@Controller('waves')
export class WavesController {
  constructor(private readonly waves: WavesService) {}

  // List of waves from Customer_Order on the shared filters (abcClass uses
  // basis, thresholdA, thresholdB like the indicators), with paging: page,
  // pageSize (default 50, max 200), sort (waveNumber or firstCreatedAt), order.
  @Get()
  async listWaves(
    @QueryFilters() filters: Filters,
    @QueryAbcParams() abc: AbcParams,
    @Query() query: Record<string, unknown>,
  ): Promise<WaveList> {
    try {
      return await this.waves.list(filters, abc, parseListParams(query));
    } catch (error) {
      if (error instanceof WaveParamError) {
        throw new BadRequestException(error.message);
      }
      throw error;
    }
  }

  // Detail of one wave: its orders (Customer_Order) and its picks with
  // locations (Picking_Wave), as two separate lists. 400 for a malformed wave
  // number or filter, 404 when neither file has the wave.
  @Get(':waveNumber')
  async getWave(
    @Param('waveNumber') waveNumber: string,
    @QueryFilters() filters: Filters,
  ): Promise<WaveDetail> {
    try {
      return await this.waves.detail(parseWaveNumber(waveNumber), filters);
    } catch (error) {
      if (error instanceof WaveParamError) {
        throw new BadRequestException(error.message);
      }
      throw error;
    }
  }
}
