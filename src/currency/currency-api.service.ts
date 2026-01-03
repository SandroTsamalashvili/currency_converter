import { Injectable, Logger, HttpException, HttpStatus } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { Inject } from '@nestjs/common';
import type { Cache } from 'cache-manager';
import { firstValueFrom } from 'rxjs';
import { AxiosError } from 'axios';
import { CURRENCY_CODES } from '../constants/currency-codes';

export interface MonobankRate {
  currencyCodeA: number;
  currencyCodeB: number;
  date: number;
  rateBuy?: number;
  rateSell?: number;
  rateCross?: number;
}
const CACHE_KEY = 'monobank_rates';

@Injectable()
export class CurrencyApiService {
  private readonly logger = new Logger(CurrencyApiService.name);
  private readonly apiUrl: string;
  private readonly cacheTtl: number;

  // Circuit breaker state
  private failureCount = 0;
  private lastFailureTime: number | null = null;
  private circuitOpen = false;
  private readonly failureThreshold: number;
  private readonly circuitTimeout: number;

  constructor(
    private readonly httpService: HttpService,
    private readonly configService: ConfigService,
    @Inject(CACHE_MANAGER) private cacheManager: Cache,
  ) {
    this.apiUrl = this.configService.get<string>(
      'MONOBANK_API_URL',
      'https://api.monobank.ua/bank/currency',
    );

    this.cacheTtl = this.configService.get<number>('CACHE_TTL', 300);

    this.failureThreshold = this.configService.get<number>(
      'CIRCUIT_BREAKER_THRESHOLD',
      5,
    );

    this.circuitTimeout = this.configService.get<number>(
      'CIRCUIT_BREAKER_TIMEOUT',
      30000,
    );
  }

  async getExchangeRates(): Promise<MonobankRate[]> {
    const cachedRates = await this.cacheManager.get<MonobankRate[]>(CACHE_KEY);

    if (cachedRates) {
      this.logger.debug('Cache HIT - returning cached exchange rates');
      return cachedRates;
    }

    this.logger.debug('Cache MISS - fetching from Monobank API');

    const rates = await this.fetchWithCircuitBreaker();

    await this.cacheManager.set(CACHE_KEY, rates, this.cacheTtl * 1000);

    this.logger.debug(`Cached exchange rates for ${this.cacheTtl} seconds`);

    return rates;
  }

  private async fetchWithCircuitBreaker(): Promise<MonobankRate[]> {
    if (this.circuitOpen) {
      const timeSinceLastFailure = Date.now() - (this.lastFailureTime || 0);

      if (timeSinceLastFailure < this.circuitTimeout) {
        this.logger.warn('Circuit is OPEN - rejecting request');
        throw new HttpException(
          'Service temporarily unavailable. Please try again later.',
          HttpStatus.SERVICE_UNAVAILABLE,
        );
      }

      this.logger.log('Circuit is HALF-OPEN - attempting recovery');
    }

    try {
      const rates = await this.fetchWithRetry();

      this.failureCount = 0;
      this.circuitOpen = false;
      this.lastFailureTime = null;

      return rates;
    } catch (error) {
      this.handleCircuitBreakerFailure();
      throw error;
    }
  }

  private async fetchWithRetry(
    retries = 3,
    delay = 1000,
  ): Promise<MonobankRate[]> {
    for (let attempt = 1; attempt <= retries; attempt++) {
      try {
        this.logger.debug(
          `Fetching exchange rates (attempt ${attempt}/${retries})`,
        );

        const response = await firstValueFrom(
          this.httpService.get<MonobankRate[]>(this.apiUrl, {
            timeout: 5000,
            headers: {
              Accept: 'application/json',
            },
          }),
        );

        return response.data;
      } catch (error) {
        const axiosError = error as AxiosError;

        this.logger.warn(
          `Attempt ${attempt} failed: ${axiosError.message}`,
          axiosError.response?.status,
        );

        if (
          axiosError.response?.status &&
          axiosError.response.status >= 400 &&
          axiosError.response.status < 500
        ) {
          throw new HttpException(
            `Monobank API error: ${axiosError.response.statusText}`,
            axiosError.response.status,
          );
        }

        if (attempt === retries) {
          throw new HttpException(
            'Failed to fetch exchange rates after multiple attempts',
            HttpStatus.SERVICE_UNAVAILABLE,
          );
        }

        const backoffDelay = delay * Math.pow(2, attempt - 1);
        this.logger.debug(`Waiting ${backoffDelay}ms before retry`);
        await this.sleep(backoffDelay);
      }
    }

    throw new HttpException(
      'Failed to fetch exchange rates',
      HttpStatus.SERVICE_UNAVAILABLE,
    );
  }

  private handleCircuitBreakerFailure(): void {
    this.failureCount++;
    this.lastFailureTime = Date.now();

    if (this.failureCount >= this.failureThreshold) {
      this.circuitOpen = true;
      this.logger.error(
        `Circuit OPENED after ${this.failureCount} consecutive failures`,
      );
    }
  }

  getCurrencyCode(currency: string): number | undefined {
    return CURRENCY_CODES[currency.toUpperCase()];
  }

  getSupportedCurrencies(): string[] {
    return Object.keys(CURRENCY_CODES);
  }

  async invalidateCache(): Promise<void> {
    await this.cacheManager.del(CACHE_KEY);
    this.logger.log('Cache invalidated');
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
