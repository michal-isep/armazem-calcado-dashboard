import { Module } from '@nestjs/common';
import { DatabaseService } from './database.service.js';
import { FiltersController } from './filters/filters.controller.js';
import { HealthController } from './health.controller.js';

@Module({
  controllers: [HealthController, FiltersController],
  providers: [DatabaseService],
})
export class AppModule {}
