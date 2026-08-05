import {
  CallHandler,
  ExecutionContext,
  Injectable,
  Logger,
  NestInterceptor,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';
import { v4 as uuidv4 } from 'uuid';

@Injectable()
export class LoggingInterceptor implements NestInterceptor {
  private readonly logger = new Logger('HTTP');

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const httpContext = context.switchToHttp();
    const request = httpContext.getRequest<Request>();
    const response = httpContext.getResponse<Response>();

    const correlationId =
      (request.headers['x-correlation-id'] as string) || uuidv4();
    request.headers['x-correlation-id'] = correlationId;
    response.setHeader('x-correlation-id', correlationId);

    const { method, url } = request;
    const now = Date.now();

    this.logger.log(`[${correlationId}] --> ${method} ${url}`);

    return next.handle().pipe(
      tap({
        next: () => {
          this.logger.log(
            `[${correlationId}] <-- ${method} ${url} ${response.statusCode} +${Date.now() - now}ms`,
          );
        },
        error: (err: Error) => {
          this.logger.error(
            `[${correlationId}] <-- ${method} ${url} ERROR +${Date.now() - now}ms`,
            err.stack,
          );
        },
      }),
    );
  }
}
