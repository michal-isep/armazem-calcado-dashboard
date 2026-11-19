import { Module } from '@nestjs/common';
import { AbcController } from './abc/abc.controller.js';
import { AbcComparisonService } from './abc/abc-comparison.service.js';
import { AbcService } from './abc/abc.service.js';
import { AbcSizesService } from './abc/abc-sizes.service.js';
import { AisleController } from './aisle/aisle.controller.js';
import { AisleService } from './aisle/aisle.service.js';
import { DatabaseService } from './database.service.js';
import { FiltersController } from './filters/filters.controller.js';
import { DataQualityService } from './indicators/data-quality.service.js';
import { IndicatorsController } from './indicators/indicators.controller.js';
import { MonthlyTrendService } from './indicators/monthly-trend.service.js';
import { OrderSizeService } from './indicators/order-size.service.js';
import { SectorService } from './indicators/sector.service.js';
import { WaveSplitService } from './indicators/wave-split.service.js';
import { HealthController } from './health.controller.js';
import { WavesController } from './waves/waves.controller.js';
import { WavesService } from './waves/waves.service.js';

@Module({
  controllers: [
    HealthController,
    FiltersController,
    IndicatorsController,
    AbcController,
    AisleController,
    WavesController,
  ],
  providers: [
    DatabaseService,
    AbcService,
    AbcComparisonService,
    AbcSizesService,
    AisleService,
    OrderSizeService,
    WaveSplitService,
    SectorService,
    MonthlyTrendService,
    DataQualityService,
    WavesService,
  ],
})
export class AppModule {}
