import {
  BadRequestException,
  createParamDecorator,
  type ExecutionContext,
} from '@nestjs/common';
import { FilterError, parseFilters, type Filters } from './filters.js';

/** Controller parameter: the validated global filters from the query string. */
export const QueryFilters = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): Filters => {
    const req = ctx
      .switchToHttp()
      .getRequest<{ query: Record<string, unknown> }>();
    try {
      return parseFilters(req.query);
    } catch (e) {
      if (e instanceof FilterError) throw new BadRequestException(e.message);
      throw e;
    }
  },
);
