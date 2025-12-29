import { Controller, Post, Body } from '@nestjs/common';
import { AppService } from './app.service';

@Controller()
export class AppController {
  constructor(private readonly appService: AppService) {}

  @Post('convert')
  convert(@Body() body: { from: string; to: string; amount: number }) {
    const { from, to, amount } = body;

    return this.appService.convert(from, to, amount);
  }
}
