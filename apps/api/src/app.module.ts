import { Module } from '@nestjs/common';
import { DatabaseService } from './database.service.js';
import { FiltersController } from './filters/filters.controller.js';
import { IndicatorsController } from './indicators/indicators.controller.js';
import { MonthlyTrendService } from './indicators/monthly-trend.service.js';
import { OrderSizeService } from './indicators/order-size.service.js';
import { SectorService } from './indicators/sector.service.js';
import { WaveSplitService } from './indicators/wave-split.service.js';
import { HealthController } from './health.controller.js';

@Module({
  controllers: [HealthController, FiltersController, IndicatorsController],
  providers: [
    DatabaseService,
    OrderSizeService,
    WaveSplitService,
    SectorService,
    MonthlyTrendService,
  ],
})
export class AppModule {}
