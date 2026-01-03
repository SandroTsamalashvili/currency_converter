import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { CurrencyApiService } from './currency-api.service';

@Module({
  imports: [
    HttpModule.register({
      timeout: 5000,
      maxRedirects: 5,
    }),
  ],
  providers: [CurrencyApiService],
  exports: [CurrencyApiService],
})
export class CurrencyModule {}
