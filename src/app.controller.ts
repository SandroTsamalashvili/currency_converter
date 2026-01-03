import { Controller, Post, Body, Logger } from '@nestjs/common';
import { AppService } from './app.service';
import { ConvertDto, ConvertResponseDto } from './dto/convert.dto';

@Controller('convert')
export class AppController {
  private readonly logger = new Logger(AppController.name);

  constructor(private readonly appService: AppService) {}

  @Post()
  convert(@Body() body: ConvertDto): Promise<ConvertResponseDto> {
    this.logger.log(`Converting ${body.amount} ${body.from} to ${body.to}`);

    const { from, to, amount } = body;

    return this.appService.convert(from, to, amount);
  }
}
