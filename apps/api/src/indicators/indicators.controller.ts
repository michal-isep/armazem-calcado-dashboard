import { Controller, Get } from '@nestjs/common';
import { QueryAbcParams } from '../abc/abc-params.decorator.js';
import type { AbcParams } from '../abc/abc.service.js';
import type { Filters } from '../filters/filters.js';
import type { DataQuality } from './data-quality.service.js';
import { DataQualityService } from './data-quality.service.js';
import { QueryFilters } from '../filters/query-filters.decorator.js';
import type { MonthlyTrend } from './monthly-trend.service.js';
import { MonthlyTrendService } from './monthly-trend.service.js';
import type { OrderSizeIndicators } from './order-size.service.js';
import { OrderSizeService } from './order-size.service.js';
import type { SectorIndicators } from './sector.service.js';
import { SectorService } from './sector.service.js';
import type { WaveSplitIndicators } from './wave-split.service.js';
import { WaveSplitService } from './wave-split.service.js';
import {
  WaveDistributionService,
  type WaveDistributionResult,
} from './wave-distribution.service.js';

// All endpoints take the global filters (src/filters/). abcClass selects the
// lines of references in that class, ranked on the date range only (ADR 0002)
// with the basis and thresholds of the M1 endpoint (basis, thresholdA,
// thresholdB; default lines, 80/95).
@Controller('indicators')
export class IndicatorsController {
  constructor(
    private readonly orderSize: OrderSizeService,
    private readonly waveSplit: WaveSplitService,
    private readonly waveDistribution: WaveDistributionService,
    private readonly sector: SectorService,
    private readonly monthlyTrend: MonthlyTrendService,
    private readonly dataQuality: DataQualityService,
  ) {}

  // M2 average order size and X1 lines per order, with the orders, lines and
  // units behind them.
  @Get('order-size')
  getOrderSize(
    @QueryFilters() filters: Filters,
    @QueryAbcParams() abc: AbcParams,
  ): Promise<OrderSizeIndicators> {
    return this.orderSize.compute(filters, abc);
  }

  // M3 average orders per wave and X2 share of orders split across waves, with
  // the orders, waves and lines behind them.
  @Get('wave-split')
  getWaveSplit(
    @QueryFilters() filters: Filters,
    @QueryAbcParams() abc: AbcParams,
  ): Promise<WaveSplitIndicators> {
    return this.waveSplit.compute(filters, abc);
  }

  // X6 wave size distribution and waves per split order: the spread behind
  // M3 and X2, from the same counts.
  @Get('wave-distribution')
  getWaveDistribution(
    @QueryFilters() filters: Filters,
    @QueryAbcParams() abc: AbcParams,
  ): Promise<WaveDistributionResult> {
    return this.waveDistribution.compute(filters, abc);
  }

  // M4 sector share and M5 multi-sector orders, with the orders, units and
  // lines behind them. notInformative is set while only one sector exists.
  @Get('sector')
  getSector(
    @QueryFilters() filters: Filters,
    @QueryAbcParams() abc: AbcParams,
  ): Promise<SectorIndicators> {
    return this.sector.compute(filters, abc);
  }

  // Monthly M2, M3, X1 and X2 with counts, days covered and partial-month
  // flags, plus the comparison with the previous equal-length period.
  @Get('monthly-trend')
  getMonthlyTrend(
    @QueryFilters() filters: Filters,
    @QueryAbcParams() abc: AbcParams,
  ): Promise<MonthlyTrend> {
    return this.monthlyTrend.compute(filters, abc);
  }

  // Row counts excluded or flagged by the ETL and the disagreement between
  // the order and picking files. Whole files: no filters.
  @Get('data-quality')
  getDataQuality(): Promise<DataQuality> {
    return this.dataQuality.compute();
  }
}
