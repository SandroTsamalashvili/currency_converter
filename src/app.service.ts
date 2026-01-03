import { Injectable, HttpException, HttpStatus, Logger } from '@nestjs/common';
import {
  CurrencyApiService,
  MonobankRate,
} from './currency/currency-api.service';
import { ConvertResponseDto } from './dto/convert.dto';
import { UAH_CODE } from './constants/currency-codes';

@Injectable()
export class AppService {
  private readonly logger = new Logger(AppService.name);

  constructor(private readonly currencyApiService: CurrencyApiService) {}

  async convert(
    from: string,
    to: string,
    amount: number,
  ): Promise<ConvertResponseDto> {
    if (typeof amount !== 'number' || amount <= 0) {
      throw new HttpException(
        `Invalid amount: ${amount}. Amount must be a positive number.`,
        HttpStatus.BAD_REQUEST,
      );
    }

    const fromCode = this.currencyApiService.getCurrencyCode(from);
    const toCode = this.currencyApiService.getCurrencyCode(to);

    if (!fromCode) {
      throw new HttpException(
        `Unsupported currency: ${from}. Supported: ${this.currencyApiService.getSupportedCurrencies().join(', ')}`,
        HttpStatus.BAD_REQUEST,
      );
    }

    if (!toCode) {
      throw new HttpException(
        `Unsupported currency: ${to}. Supported: ${this.currencyApiService.getSupportedCurrencies().join(', ')}`,
        HttpStatus.BAD_REQUEST,
      );
    }

    const rates = await this.currencyApiService.getExchangeRates();

    const rate = this.findRate(rates, fromCode, toCode);

    if (!rate) {
      throw new HttpException(
        `Exchange rate not found for ${from} to ${to}`,
        HttpStatus.NOT_FOUND,
      );
    }

    const result = this.calculateConversion(amount, rate, fromCode, toCode);

    this.logger.debug(
      `Converted ${amount} ${from} to ${result.toFixed(4)} ${to} (rate: ${rate.rateBuy || rate.rateCross})`,
    );

    return {
      from: from.toUpperCase(),
      to: to.toUpperCase(),
      amount,
      result: Number(result.toFixed(4)),
    };
  }

  private findRate(
    rates: MonobankRate[],
    fromCode: number,
    toCode: number,
  ): MonobankRate | null {
    if (fromCode === UAH_CODE || toCode === UAH_CODE) {
      const foreignCode = fromCode === UAH_CODE ? toCode : fromCode;

      return (
        rates.find(
          (r) =>
            r.currencyCodeA === foreignCode && r.currencyCodeB === UAH_CODE,
        ) || null
      );
    }

    // Cross-rate conversion (neither currency is UAH)
    // We need to go through UAH: FROM -> UAH -> TO
    // For this, I'll return a special combined rate
    const fromToUah = rates.find(
      (r) => r.currencyCodeA === fromCode && r.currencyCodeB === UAH_CODE,
    );

    const toToUah = rates.find(
      (r) => r.currencyCodeA === toCode && r.currencyCodeB === UAH_CODE,
    );

    if (fromToUah && toToUah) {
      const crossRate =
        (fromToUah.rateBuy || fromToUah.rateCross || 1) /
        (toToUah.rateSell || toToUah.rateCross || 1);

      return {
        currencyCodeA: fromCode,
        currencyCodeB: toCode,
        date: Math.max(fromToUah.date, toToUah.date),
        rateCross: crossRate,
      };
    }

    return null;
  }

  private calculateConversion(
    amount: number,
    rate: MonobankRate,
    fromCode: number,
    toCode: number,
  ): number {
    if (toCode === UAH_CODE) {
      return amount * (rate.rateBuy || rate.rateCross || 1);
    }

    if (fromCode === UAH_CODE) {
      return amount / (rate.rateSell || rate.rateCross || 1);
    }

    return amount * (rate.rateCross || 1);
  }

  getSupportedCurrencies(): string[] {
    return this.currencyApiService.getSupportedCurrencies();
  }

  async invalidateCache(): Promise<void> {
    await this.currencyApiService.invalidateCache();
  }
}
