import { Test, TestingModule } from '@nestjs/testing';
import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { HttpException } from '@nestjs/common';
import { of, throwError } from 'rxjs';
import { AxiosResponse, AxiosError } from 'axios';
import { CurrencyApiService, MonobankRate } from './currency-api.service';

describe('CurrencyApiService', () => {
  let service: CurrencyApiService;
  let httpService: { get: jest.Mock };
  let cacheManager: { get: jest.Mock; set: jest.Mock; del: jest.Mock };

  const mockRates: MonobankRate[] = [
    {
      currencyCodeA: 840,
      currencyCodeB: 980,
      date: 1704326400,
      rateBuy: 37.5,
      rateSell: 38.0,
    },
    {
      currencyCodeA: 978,
      currencyCodeB: 980,
      date: 1704326400,
      rateBuy: 41.0,
      rateSell: 41.5,
    },
  ];

  const createMockAxiosResponse = <T>(data: T): AxiosResponse<T> => ({
    data,
    status: 200,
    statusText: 'OK',
    headers: {},
    config: { headers: {} } as AxiosResponse['config'],
  });

  const createAxiosError = (message: string, status?: number): AxiosError => {
    const error = new Error(message) as AxiosError;
    error.isAxiosError = true;
    if (status) {
      error.response = {
        status,
        statusText: message,
        data: {},
        headers: {},
        config: {} as AxiosResponse['config'],
      };
    } else {
      error.response = undefined;
    }
    return error;
  };

  const createTestingModule = async () => {
    cacheManager = {
      get: jest.fn(),
      set: jest.fn(),
      del: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CurrencyApiService,
        {
          provide: HttpService,
          useValue: {
            get: jest.fn(),
          },
        },
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn((key: string, defaultValue: unknown) => {
              const config: Record<string, unknown> = {
                MONOBANK_API_URL: 'https://api.monobank.ua/bank/currency',
                CACHE_TTL: 300,
                CIRCUIT_BREAKER_THRESHOLD: 3,
                CIRCUIT_BREAKER_TIMEOUT: 1000,
              };
              return config[key] ?? defaultValue;
            }),
          },
        },
        {
          provide: CACHE_MANAGER,
          useValue: cacheManager,
        },
      ],
    }).compile();

    service = module.get<CurrencyApiService>(CurrencyApiService);
    httpService = module.get(HttpService);
  };

  // Helper to trigger a failure and wait for it to complete
  const triggerFailure = async (): Promise<void> => {
    const promise = service.getExchangeRates().catch(() => {
      // Expected to fail - swallow the error
    });
    await jest.runAllTimersAsync();
    await promise;
  };

  beforeEach(async () => {
    jest.useFakeTimers();
    await createTestingModule();
  });

  afterEach(() => {
    jest.clearAllMocks();
    jest.useRealTimers();
  });

  describe('Circuit Breaker', () => {
    it('should return rates successfully when circuit is closed', async () => {
      cacheManager.get.mockResolvedValue(null);
      httpService.get.mockReturnValue(of(createMockAxiosResponse(mockRates)));

      const result = await service.getExchangeRates();

      expect(result).toEqual(mockRates);
      expect(httpService.get).toHaveBeenCalledTimes(1);
    });

    it('should open circuit after reaching failure threshold', async () => {
      cacheManager.get.mockResolvedValue(null);

      const axiosError = createAxiosError('Network error');
      httpService.get.mockReturnValue(throwError(() => axiosError));

      await triggerFailure();
      await triggerFailure();
      await triggerFailure();

      await expect(service.getExchangeRates()).rejects.toThrow(
        'Service temporarily unavailable',
      );
    });

    it('should reject requests immediately when circuit is open', async () => {
      cacheManager.get.mockResolvedValue(null);

      const axiosError = createAxiosError('Network error');
      httpService.get.mockReturnValue(throwError(() => axiosError));

      await triggerFailure();
      await triggerFailure();
      await triggerFailure();

      httpService.get.mockClear();

      await expect(service.getExchangeRates()).rejects.toThrow(
        'Service temporarily unavailable',
      );

      expect(httpService.get).not.toHaveBeenCalled();
    });

    it('should attempt recovery after circuit timeout (half-open state)', async () => {
      cacheManager.get.mockResolvedValue(null);

      const axiosError = createAxiosError('Network error');
      httpService.get.mockReturnValue(throwError(() => axiosError));

      await triggerFailure();
      await triggerFailure();
      await triggerFailure();

      jest.advanceTimersByTime(1100);

      httpService.get.mockReturnValue(of(createMockAxiosResponse(mockRates)));

      const result = await service.getExchangeRates();

      expect(result).toEqual(mockRates);
    });

    it('should close circuit after successful recovery', async () => {
      cacheManager.get.mockResolvedValue(null);

      const axiosError = createAxiosError('Network error');
      httpService.get.mockReturnValue(throwError(() => axiosError));

      await triggerFailure();
      await triggerFailure();
      await triggerFailure();

      jest.advanceTimersByTime(1100);

      httpService.get.mockReturnValue(of(createMockAxiosResponse(mockRates)));
      await service.getExchangeRates();

      httpService.get.mockClear();
      cacheManager.get.mockResolvedValue(null);
      httpService.get.mockReturnValue(of(createMockAxiosResponse(mockRates)));

      const result = await service.getExchangeRates();
      expect(result).toEqual(mockRates);
      expect(httpService.get).toHaveBeenCalled();
    });

    it('should reset failure count on successful request', async () => {
      cacheManager.get.mockResolvedValue(null);

      const axiosError = createAxiosError('Network error');

      httpService.get.mockReturnValue(throwError(() => axiosError));
      await triggerFailure();
      await triggerFailure();

      httpService.get.mockReturnValue(of(createMockAxiosResponse(mockRates)));
      await service.getExchangeRates();

      httpService.get.mockReturnValue(throwError(() => axiosError));
      await triggerFailure();
      await triggerFailure();

      httpService.get.mockReturnValue(of(createMockAxiosResponse(mockRates)));
      const result = await service.getExchangeRates();
      expect(result).toEqual(mockRates);
    });
  });

  describe('Retry Logic', () => {
    it('should retry on transient failures', async () => {
      cacheManager.get.mockResolvedValue(null);

      const axiosError = createAxiosError('Network error');

      httpService.get
        .mockReturnValueOnce(throwError(() => axiosError))
        .mockReturnValueOnce(throwError(() => axiosError))
        .mockReturnValueOnce(of(createMockAxiosResponse(mockRates)));

      const promise = service.getExchangeRates();
      await jest.runAllTimersAsync();
      const result = await promise;

      expect(result).toEqual(mockRates);
      expect(httpService.get).toHaveBeenCalledTimes(3);
    });

    it('should not retry on 4xx client errors', async () => {
      cacheManager.get.mockResolvedValue(null);

      const axiosError = createAxiosError('Bad Request', 400);
      httpService.get.mockReturnValue(throwError(() => axiosError));

      await expect(service.getExchangeRates()).rejects.toThrow(HttpException);
      expect(httpService.get).toHaveBeenCalledTimes(1);
    });

    it('should throw after exhausting all retries', async () => {
      cacheManager.get.mockResolvedValue(null);

      const axiosError = createAxiosError('Network error');
      httpService.get.mockReturnValue(throwError(() => axiosError));

      let error: Error | undefined;
      const promise = service.getExchangeRates().catch((e: Error) => {
        error = e;
      });
      await jest.runAllTimersAsync();
      await promise;

      expect(error).toBeDefined();
      expect(error?.message).toContain(
        'Failed to fetch exchange rates after multiple attempts',
      );
      expect(httpService.get).toHaveBeenCalledTimes(3);
    });
  });

  describe('Caching', () => {
    it('should return cached rates when available', async () => {
      cacheManager.get.mockResolvedValue(mockRates);

      const result = await service.getExchangeRates();

      expect(result).toEqual(mockRates);
      expect(httpService.get).not.toHaveBeenCalled();
    });

    it('should cache rates after fetching from API', async () => {
      cacheManager.get.mockResolvedValue(null);
      httpService.get.mockReturnValue(of(createMockAxiosResponse(mockRates)));

      await service.getExchangeRates();

      expect(cacheManager.set).toHaveBeenCalledWith(
        'monobank_rates',
        mockRates,
        300000,
      );
    });

    it('should invalidate cache when requested', async () => {
      await service.invalidateCache();

      expect(cacheManager.del).toHaveBeenCalledWith('monobank_rates');
    });
  });

  describe('Currency Code Helpers', () => {
    it('should return correct currency code for valid currency', () => {
      expect(service.getCurrencyCode('USD')).toBe(840);
      expect(service.getCurrencyCode('EUR')).toBe(978);
      expect(service.getCurrencyCode('UAH')).toBe(980);
    });

    it('should handle case-insensitive currency codes', () => {
      expect(service.getCurrencyCode('usd')).toBe(840);
      expect(service.getCurrencyCode('Eur')).toBe(978);
    });

    it('should return undefined for invalid currency', () => {
      expect(service.getCurrencyCode('INVALID')).toBeUndefined();
    });

    it('should return list of supported currencies', () => {
      const currencies = service.getSupportedCurrencies();

      expect(currencies).toContain('USD');
      expect(currencies).toContain('EUR');
      expect(currencies).toContain('UAH');
      expect(Array.isArray(currencies)).toBe(true);
    });
  });
});
