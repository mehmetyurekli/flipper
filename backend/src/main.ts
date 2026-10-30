import 'reflect-metadata';
import { Logger, ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { mkdirSync } from 'fs';
import { AppModule } from './app.module';
import { config } from './config';

async function bootstrap() {
  mkdirSync(config.uploadsDir, { recursive: true });

  const app = await NestFactory.create<NestExpressApplication>(AppModule, { bodyParser: false });
  app.useBodyParser('json', { limit: config.jsonLimit });
  app.useBodyParser('urlencoded', { limit: config.jsonLimit, extended: true });
  app.enableCors({ origin: config.corsOrigins });
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
  // serve-static resolves inside the root and rejects traversal; dotfiles (.gitkeep) are hidden.
  app.useStaticAssets(config.uploadsDir, { prefix: '/uploads/', index: false, dotfiles: 'deny', fallthrough: true });

  await app.listen(config.port);
  Logger.log(`flipper backend on http://localhost:${config.port} (mongo ${config.mongoUri}, uploads ${config.uploadsDir})`, 'Bootstrap');
}

bootstrap();
