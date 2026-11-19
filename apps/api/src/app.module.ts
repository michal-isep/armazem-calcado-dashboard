import { Module } from '@nestjs/common';
import { DatabaseService } from './database.service.js';
import { IndicatorsController } from './indicators/indicators.controller.js';
import { OrderSizeService } from './indicators/order-size.service.js';
import { HealthController } from './health.controller.js';

@Module({
  controllers: [HealthController, IndicatorsController],
  providers: [DatabaseService, OrderSizeService],
})
export class AppModule {}
