import { BadRequestException, Controller, Get, Query } from '@nestjs/common';
import type { DataQuality } from './data-quality.service.js';
import { DataQualityService } from './data-quality.service.js';
import { InvalidFilterError, parseOrderFilters } from './filters.js';
import type { RawQuery } from './filters.js';
import type { MonthlyTrend } from './monthly-trend.service.js';
import { MonthlyTrendService } from './monthly-trend.service.js';
import type { OrderSizeIndicators } from './order-size.service.js';
import { OrderSizeService } from './order-size.service.js';
import type { SectorIndicators } from './sector.service.js';
import { SectorService } from './sector.service.js';
import type { WaveSplitIndicators } from './wave-split.service.js';
import { WaveSplitService } from './wave-split.service.js';

@Controller('indicators')
export class IndicatorsController {
  constructor(
    private readonly orderSize: OrderSizeService,
    private readonly waveSplit: WaveSplitService,
    private readonly sector: SectorService,
    private readonly monthlyTrend: MonthlyTrendService,
    private readonly dataQuality: DataQualityService,
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

  // M4 sector share and M5 multi-sector orders, with the orders, units and
  // lines behind them. notInformative is set while only one sector exists.
  @Get('sector')
  async getSector(@Query() query: RawQuery): Promise<SectorIndicators> {
    try {
      return await this.sector.compute(parseOrderFilters(query));
    } catch (error) {
      if (error instanceof InvalidFilterError) {
        throw new BadRequestException(error.message);
      }
      throw error;
    }
  }

  // Monthly M2, M3, X1 and X2 with counts, days covered and partial-month
  // flags, plus the comparison with the previous equal-length period.
  @Get('monthly-trend')
  async getMonthlyTrend(@Query() query: RawQuery): Promise<MonthlyTrend> {
    try {
      return await this.monthlyTrend.compute(parseOrderFilters(query));
    } catch (error) {
      if (error instanceof InvalidFilterError) {
        throw new BadRequestException(error.message);
      }
      throw error;
    }
  }

  // Row counts excluded or flagged by the ETL and the disagreement between
  // the order and picking files. Whole files: no filters.
  @Get('data-quality')
  getDataQuality(): Promise<DataQuality> {
    return this.dataQuality.compute();
  }
}
