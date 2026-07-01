import { ArgumentsHost, Catch, ExceptionFilter, Logger } from '@nestjs/common';
import { ThrottlerException } from '@nestjs/throttler';
import type { Response } from 'express';

const TOO_MANY_REQUESTS_CODE = 'TOO_MANY_REQUESTS';
const TOO_MANY_REQUESTS_MESSAGE =
  'リクエストが多すぎます。しばらく待ってから再試行してください';
const HTTP_STATUS_TOO_MANY_REQUESTS = 429;

@Catch(ThrottlerException)
export class ThrottlerExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(ThrottlerExceptionFilter.name);

  catch(_exception: ThrottlerException, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();

    this.logger.warn('レートリミット超過');

    response.status(HTTP_STATUS_TOO_MANY_REQUESTS).json({
      message: TOO_MANY_REQUESTS_MESSAGE,
      code: TOO_MANY_REQUESTS_CODE,
      statusCode: HTTP_STATUS_TOO_MANY_REQUESTS,
    });
  }
}
