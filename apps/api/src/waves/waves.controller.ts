import { BadRequestException, Controller, Get, Param } from '@nestjs/common';
import { QueryFilters } from '../filters/query-filters.decorator.js';
import type { Filters } from '../filters/filters.js';
import { WavesService, type WaveDetail } from './waves.service.js';
import { WaveParamError, parseWaveNumber } from './waves.js';

@Controller('waves')
export class WavesController {
  constructor(private readonly waves: WavesService) {}

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
