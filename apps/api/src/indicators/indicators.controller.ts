import { BadRequestException, Controller, Get, Query } from '@nestjs/common';
import { InvalidFilterError, parseOrderFilters } from './filters.js';
import type { RawQuery } from './filters.js';
import type { OrderSizeIndicators } from './order-size.service.js';
import { OrderSizeService } from './order-size.service.js';
import type { WaveSplitIndicators } from './wave-split.service.js';
import { WaveSplitService } from './wave-split.service.js';

@Controller('indicators')
export class IndicatorsController {
  constructor(
    private readonly orderSize: OrderSizeService,
    private readonly waveSplit: WaveSplitService,
  ) {}

  // M2 average order size and X1 lines per order, with the orders, lines and
  // units behind them.
  @Get('order-size')
  async getOrderSize(@Query() query: RawQuery): Promise<OrderSizeIndicators> {
    try {
      return await this.orderSize.compute(parseOrderFilters(query));
    } catch (error) {
      if (error instanceof InvalidFilterError) {
        throw new BadRequestException(error.message);
      }
      throw error;
    }
  }

  // M3 average orders per wave and X2 share of orders split across waves, with
  // the orders, waves and lines behind them.
  @Get('wave-split')
  async getWaveSplit(@Query() query: RawQuery): Promise<WaveSplitIndicators> {
    try {
      return await this.waveSplit.compute(parseOrderFilters(query));
    } catch (error) {
      if (error instanceof InvalidFilterError) {
        throw new BadRequestException(error.message);
      }
      throw error;
    }
  }
}
