import { BadRequestException, Controller, Get, Query } from '@nestjs/common';
import { InvalidFilterError, parseOrderFilters } from './filters.js';
import type { RawQuery } from './filters.js';
import type { OrderSizeIndicators } from './order-size.service.js';
import { OrderSizeService } from './order-size.service.js';

@Controller('indicators')
export class IndicatorsController {
  constructor(private readonly orderSize: OrderSizeService) {}

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
}
