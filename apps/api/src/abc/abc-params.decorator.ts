import {
  BadRequestException,
  createParamDecorator,
  type ExecutionContext,
} from '@nestjs/common';
import { AbcParamError, parseAbcParams, type AbcBasis } from './abc.js';
import type { AbcThresholds } from './abc.js';

/** Controller parameter: the validated ABC basis and thresholds. */
export const QueryAbcParams = createParamDecorator(
  (
    _data: unknown,
    ctx: ExecutionContext,
  ): { basis: AbcBasis; thresholds: AbcThresholds } => {
    const req = ctx
      .switchToHttp()
      .getRequest<{ query: Record<string, unknown> }>();
    try {
      return parseAbcParams(req.query);
    } catch (e) {
      if (e instanceof AbcParamError) throw new BadRequestException(e.message);
      throw e;
    }
  },
);
