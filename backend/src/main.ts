import { Logger, ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module';
import { AllExceptionsFilter } from './common/all-exceptions.filter';
import { LoggingInterceptor } from './common/logging.interceptor';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  app.enableCors();
  app.setGlobalPrefix('api');
  app.useGlobalFilters(new AllExceptionsFilter());
  app.useGlobalInterceptors(new LoggingInterceptor());
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: false,
    }),
  );

  const config = new DocumentBuilder()
    .setTitle('Telecom AI Self-Care API')
    .setDescription(
      'Multi-agent orchestration API powering an AI-driven telecom self-care platform',
    )
    .setVersion('1.0')
    .addBearerAuth()
    .build();
  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api/docs', app, document);

  const port = process.env.PORT ?? 3001;
  await app.listen(port);
  Logger.log(`🚀 Application is running on: http://localhost:${port}/api`);
  Logger.log(`📘 Swagger docs available at: http://localhost:${port}/api/docs`);
}
bootstrap().catch((error: unknown) => {
  Logger.error(
    'Failed to bootstrap application',
    error instanceof Error ? error.stack : error,
  );
  process.exit(1);
});
