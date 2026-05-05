import {
  ValidationPipe as NestValidationPipe,
  BadRequestException,
} from '@nestjs/common';

export const AppValidationPipe = new NestValidationPipe({
  whitelist: true,
  forbidNonWhitelisted: true,
  transform: true,
  transformOptions: {
    enableImplicitConversion: true,
  },
  exceptionFactory: (errors) => {
    const messages = errors.map((err) => {
      return Object.values(err.constraints || {}).join('; ');
    });
    return new BadRequestException(messages.join('; '));
  },
});
