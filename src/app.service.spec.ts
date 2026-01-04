import { Test, TestingModule } from '@nestjs/testing';
import { HttpException, HttpStatus } from '@nestjs/common';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { ConfigService } from '@nestjs/config';
import { AppService } from './app.service';
import {
  CurrencyApiService,
  MonobankRate,
} from './currency/currency-api.service';

describe('AppService', () => {
  let service: AppService;
  let currencyApiService: jest.Mocked<CurrencyApiService>;
  let cacheManager: { get: jest.Mock; set: jest.Mock; reset: jest.Mock };

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
    {
      currencyCodeA: 826,
      currencyCodeB: 980,
      date: 1704326400,
      rateBuy: 47.5,
      rateSell: 48.0,
    },
    {
      currencyCodeA: 756,
      currencyCodeB: 980,
      date: 1704326400,
      rateCross: 43.0,
    },
  ];

  beforeEach(async () => {
    cacheManager = {
      get: jest.fn().mockResolvedValue(null),
      set: jest.fn().mockResolvedValue(undefined),
      reset: jest.fn().mockResolvedValue(undefined),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AppService,
        {
          provide: CurrencyApiService,
          useValue: {
            getExchangeRates: jest.fn(),
            getCurrencyCode: jest.fn(),
            getSupportedCurrencies: jest.fn(),
            invalidateCache: jest.fn(),
          },
        },
        {
          provide: CACHE_MANAGER,
          useValue: cacheManager,
        },
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn().mockReturnValue(300),
          },
        },
      ],
    }).compile();

    service = module.get<AppService>(AppService);
    currencyApiService = module.get(CurrencyApiService);

    currencyApiService.getExchangeRates.mockResolvedValue(mockRates);
    currencyApiService.getCurrencyCode.mockImplementation(
      (currency: string) => {
        const codes: Record<string, number> = {
          USD: 840,
          EUR: 978,
          UAH: 980,
          GBP: 826,
          CHF: 756,
        };
        return codes[currency.toUpperCase()];
      },
    );
    currencyApiService.getSupportedCurrencies.mockReturnValue([
      'USD',
      'EUR',
      'UAH',
      'GBP',
      'CHF',
    ]);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('Calculation - Foreign Currency to UAH', () => {
    it('should convert USD to UAH using rateBuy', async () => {
      const result = await service.convert('USD', 'UAH', 100);

      expect(result).toEqual({
        from: 'USD',
        to: 'UAH',
        amount: 100,
        result: 3750.0,
      });
    });

    it('should convert EUR to UAH using rateBuy', async () => {
      const result = await service.convert('EUR', 'UAH', 50);

      expect(result).toEqual({
        from: 'EUR',
        to: 'UAH',
        amount: 50,
        result: 2050.0,
      });
    });

    it('should convert GBP to UAH using rateBuy', async () => {
      const result = await service.convert('GBP', 'UAH', 25);

      expect(result).toEqual({
        from: 'GBP',
        to: 'UAH',
        amount: 25,
        result: 1187.5,
      });
    });

    it('should use rateCross when rateBuy is not available', async () => {
      const result = await service.convert('CHF', 'UAH', 100);

      expect(result).toEqual({
        from: 'CHF',
        to: 'UAH',
        amount: 100,
        result: 4300.0,
      });
    });
  });

  describe('Calculation - UAH to Foreign Currency', () => {
    it('should convert UAH to USD using rateSell', async () => {
      const result = await service.convert('UAH', 'USD', 3800);

      expect(result).toEqual({
        from: 'UAH',
        to: 'USD',
        amount: 3800,
        result: 100.0,
      });
    });

    it('should convert UAH to EUR using rateSell', async () => {
      const result = await service.convert('UAH', 'EUR', 415);

      expect(result).toEqual({
        from: 'UAH',
        to: 'EUR',
        amount: 415,
        result: 10.0,
      });
    });

    it('should convert UAH to GBP using rateSell', async () => {
      const result = await service.convert('UAH', 'GBP', 480);

      expect(result).toEqual({
        from: 'UAH',
        to: 'GBP',
        amount: 480,
        result: 10.0,
      });
    });

    it('should use rateCross when rateSell is not available', async () => {
      const result = await service.convert('UAH', 'CHF', 430);

      expect(result).toEqual({
        from: 'UAH',
        to: 'CHF',
        amount: 430,
        result: 10.0,
      });
    });
  });

  describe('Calculation - Cross-rate Conversion', () => {
    it('should convert USD to EUR via UAH (cross-rate)', async () => {
      const result = await service.convert('USD', 'EUR', 100);

      expect(result.from).toBe('USD');
      expect(result.to).toBe('EUR');
      expect(result.amount).toBe(100);

      expect(result.result).toBeCloseTo(90.3614, 2);
    });

    it('should convert EUR to USD via UAH (cross-rate)', async () => {
      const result = await service.convert('EUR', 'USD', 100);

      expect(result.from).toBe('EUR');
      expect(result.to).toBe('USD');
      expect(result.amount).toBe(100);

      expect(result.result).toBeCloseTo(107.8947, 2);
    });

    it('should convert GBP to EUR via UAH (cross-rate)', async () => {
      const result = await service.convert('GBP', 'EUR', 50);

      expect(result.from).toBe('GBP');
      expect(result.to).toBe('EUR');
      expect(result.amount).toBe(50);
      expect(result.result).toBeCloseTo(57.2289, 2);
    });
  });

  describe('Calculation - Edge Cases', () => {
    it('should handle small amounts correctly', async () => {
      const result = await service.convert('USD', 'UAH', 0.01);

      expect(result.result).toBeCloseTo(0.375, 4);
    });

    it('should handle large amounts correctly', async () => {
      const result = await service.convert('USD', 'UAH', 1000000);

      expect(result.result).toBe(37500000);
    });

    it('should round result to 4 decimal places', async () => {
      const result = await service.convert('USD', 'EUR', 1);

      const decimalPlaces = (result.result.toString().split('.')[1] || '')
        .length;
      expect(decimalPlaces).toBeLessThanOrEqual(4);
    });

    it('should handle case-insensitive currency codes', async () => {
      const result1 = await service.convert('usd', 'uah', 100);
      const result2 = await service.convert('USD', 'UAH', 100);

      expect(result1.from).toBe('USD');
      expect(result1.to).toBe('UAH');
      expect(result1.result).toBe(result2.result);
    });
  });

  describe('Validation Errors', () => {
    it('should throw error for invalid amount (zero)', async () => {
      await expect(service.convert('USD', 'UAH', 0)).rejects.toThrow(
        HttpException,
      );

      await expect(service.convert('USD', 'UAH', 0)).rejects.toMatchObject({
        status: HttpStatus.BAD_REQUEST,
      });
    });

    it('should throw error for invalid amount (negative)', async () => {
      await expect(service.convert('USD', 'UAH', -100)).rejects.toThrow(
        HttpException,
      );

      await expect(service.convert('USD', 'UAH', -100)).rejects.toMatchObject({
        status: HttpStatus.BAD_REQUEST,
      });
    });

    it('should throw error for unsupported source currency', async () => {
      currencyApiService.getCurrencyCode.mockImplementation(
        (currency: string) => {
          if (currency.toUpperCase() === 'XXX') return undefined;
          return 840;
        },
      );

      await expect(service.convert('XXX', 'UAH', 100)).rejects.toThrow(
        'Unsupported currency: XXX',
      );

      await expect(service.convert('XXX', 'UAH', 100)).rejects.toMatchObject({
        status: HttpStatus.BAD_REQUEST,
      });
    });

    it('should throw error for unsupported target currency', async () => {
      currencyApiService.getCurrencyCode.mockImplementation(
        (currency: string) => {
          if (currency.toUpperCase() === 'YYY') return undefined;
          return 840;
        },
      );

      await expect(service.convert('USD', 'YYY', 100)).rejects.toThrow(
        'Unsupported currency: YYY',
      );

      await expect(service.convert('USD', 'YYY', 100)).rejects.toMatchObject({
        status: HttpStatus.BAD_REQUEST,
      });
    });

    it('should throw error when exchange rate is not found', async () => {
      currencyApiService.getExchangeRates.mockResolvedValue([]);

      await expect(service.convert('USD', 'UAH', 100)).rejects.toThrow(
        'Exchange rate not found',
      );

      await expect(service.convert('USD', 'UAH', 100)).rejects.toMatchObject({
        status: HttpStatus.NOT_FOUND,
      });
    });
  });

  describe('Conversion Caching', () => {
    it('should cache conversion results', async () => {
      await service.convert('USD', 'UAH', 100);

      expect(cacheManager.set).toHaveBeenCalledWith(
        'conversion:USD:UAH:100',
        expect.objectContaining({
          from: 'USD',
          to: 'UAH',
          amount: 100,
          result: 3750.0,
        }),
        300000,
      );
    });

    it('should use correct cache key format', async () => {
      await service.convert('eur', 'uah', 50.5);

      expect(cacheManager.get).toHaveBeenCalledWith('conversion:EUR:UAH:50.5');
      expect(cacheManager.set).toHaveBeenCalledWith(
        'conversion:EUR:UAH:50.5',
        expect.any(Object),
        300000,
      );
    });
  });
});
