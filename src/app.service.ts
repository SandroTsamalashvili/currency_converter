import {
  Injectable,
  HttpException,
  HttpStatus,
  Logger,
  Inject,
} from '@nestjs/common';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import type { Cache } from 'cache-manager';
import { ConfigService } from '@nestjs/config';
import {
  CurrencyApiService,
  MonobankRate,
} from './currency/currency-api.service';
import { ConvertResponseDto } from './dto/convert.dto';
import { UAH_CODE } from './constants/currency-codes';

const CONVERSION_CACHE_PREFIX = 'conversion';

@Injectable()
export class AppService {
  private readonly logger = new Logger(AppService.name);
  private readonly conversionCacheTtl: number;

  constructor(
    private readonly currencyApiService: CurrencyApiService,
    private readonly configService: ConfigService,
    @Inject(CACHE_MANAGER) private cacheManager: Cache,
  ) {
    this.conversionCacheTtl = this.configService.get<number>('CACHE_TTL', 300);
  }

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
        `Unsupported currency: ${from}.}`,
        HttpStatus.BAD_REQUEST,
      );
    }

    if (!toCode) {
      throw new HttpException(
        `Unsupported currency: ${to}.}`,
        HttpStatus.BAD_REQUEST,
      );
    }

    // Check cache for conversion result
    const cacheKey = this.getConversionCacheKey(from, to, amount);

    const cachedResult =
      await this.cacheManager.get<ConvertResponseDto>(cacheKey);

    if (cachedResult) {
      this.logger.debug(`Conversion cache HIT for ${amount} ${from} -> ${to}`);
      return cachedResult;
    }

    this.logger.debug(`Conversion cache MISS for ${amount} ${from} -> ${to}`);

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

    const response: ConvertResponseDto = {
      from: from.toUpperCase(),
      to: to.toUpperCase(),
      amount,
      result: Number(result.toFixed(4)),
    };

    // Cache the conversion result
    await this.cacheManager.set(
      cacheKey,
      response,
      this.conversionCacheTtl * 1000,
    );

    return response;
  }

  private getConversionCacheKey(
    from: string,
    to: string,
    amount: number,
  ): string {
    return `${CONVERSION_CACHE_PREFIX}:${from.toUpperCase()}:${to.toUpperCase()}:${amount}`;
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
      return amount * this.getRequiredRate(rate, 'buy');
    }

    if (fromCode === UAH_CODE) {
      return amount / this.getRequiredRate(rate, 'sell');
    }

    return amount * this.getRequiredRate(rate, 'cross');
  }

  private getRequiredRate(
    rate: MonobankRate,
    type: 'buy' | 'sell' | 'cross',
  ): number {
    let value: number | undefined;

    if (type === 'buy') {
      value = rate.rateBuy ?? rate.rateCross;
    }

    if (type === 'sell') {
      value = rate.rateSell ?? rate.rateCross;
    }

    if (type === 'cross') {
      value = rate.rateCross;
    }

    if (!value) {
      throw new HttpException(
        `Incomplete exchange rate data.`,
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    }

    return value;
  }

  getSupportedCurrencies(): string[] {
    return this.currencyApiService.getSupportedCurrencies();
  }

  async invalidateCache(): Promise<void> {
    // Clear conversion cache by resetting the cache store
    await (this.cacheManager as Cache & { reset: () => Promise<void> }).reset();
    this.logger.debug('Conversion cache invalidated');

    // Invalidate the rates cache
    await this.currencyApiService.invalidateCache();
  }
}
