# Currency Converter API

A robust NestJS-based REST API for real-time currency conversion using Monobank exchange rates. Features Redis caching, circuit breaker pattern for fault tolerance, and Docker support.

## Features

- 💱 Real-time currency conversion using Monobank API
- 🚀 Redis caching for optimal performance
- 🔄 Circuit breaker pattern for fault tolerance
- 🐳 Docker & Docker Compose support
- 📊 Support for 80+ currencies
- ⚡ Automatic retry with exponential backoff

---

## Table of Contents

- [Quick Start](#quick-start)
- [Installation](#installation)
- [Environment Configuration](#environment-configuration)
- [API Documentation](#api-documentation)
- [Supported Currencies](#supported-currencies)
- [Architecture](#architecture)
- [Development](#development)
- [Testing](#testing)

---

## Quick Start

### Using Docker (Recommended)

The fastest way to get started:

```bash
# Clone the repository and navigate to the project
cd currency_converter

# Create environment file
cp .env.example .env  # Or create .env with required variables

# Start with Docker Compose
npm run docker:dev
```

The API will be available at `http://localhost:3000`

### Using npm

```bash
# Install dependencies
npm install

# Start in development mode
npm run start:dev
```

> **Note:** When running without Docker, you need to have Redis running locally or configure `REDIS_HOST` accordingly.

---

## Installation

### Prerequisites

- **Node.js** >= 20.x
- **npm** >= 9.x
- **Docker** & **Docker Compose** (for containerized setup)
- **Redis** (if running without Docker)

### Step-by-Step Setup

1. **Clone the repository**

   ```bash
   git clone <repository-url>
   cd currency_converter
   ```

2. **Install dependencies**

   ```bash
   npm install
   ```

3. **Configure environment variables**

   ```bash
   # Create .env file in project root
   touch .env
   ```

   See [Environment Configuration](#environment-configuration) for all available options.

4. **Start the application**

   **Option A: Docker (recommended)**

   ```bash
   npm run docker:dev
   ```

   **Option B: Local development**

   ```bash
   # Ensure Redis is running locally
   npm run start:dev
   ```

---

## Environment Configuration

Create a `.env` file in the project root with the following variables:

| Variable                    | Description                   | Default                                 | Required |
| --------------------------- | ----------------------------- | --------------------------------------- | -------- |
| `PORT`                      | Application port              | `3000`                                  | No       |
| `NODE_ENV`                  | Environment mode              | `development`                           | No       |
| `REDIS_HOST`                | Redis server hostname         | `localhost`                             | No       |
| `REDIS_PORT`                | Redis server port             | `6379`                                  | No       |
| `MONOBANK_API_URL`          | Monobank API endpoint         | `https://api.monobank.ua/bank/currency` | No       |
| `CACHE_TTL`                 | Cache time-to-live (seconds)  | `300`                                   | No       |
| `CIRCUIT_BREAKER_THRESHOLD` | Failures before circuit opens | `5`                                     | No       |
| `CIRCUIT_BREAKER_TIMEOUT`   | Circuit reset timeout (ms)    | `30000`                                 | No       |

### Example `.env` file

```env
# Application
PORT=3000
NODE_ENV=development

# Redis Configuration
REDIS_HOST=localhost
REDIS_PORT=6379

# Monobank API
MONOBANK_API_URL=https://api.monobank.ua/bank/currency

# Caching
CACHE_TTL=300

# Circuit Breaker
CIRCUIT_BREAKER_THRESHOLD=5
CIRCUIT_BREAKER_TIMEOUT=30000
```

### Docker Environment

When using Docker Compose, the following variables are automatically set:

- `REDIS_HOST=redis` (Docker service name)
- `REDIS_PORT=6379`
- `NODE_ENV=development`
- `PORT=3000`

---

## API Documentation

### Base URL

```
http://localhost:3000
```

### Endpoints

#### Convert Currency

Converts an amount from one currency to another.

```
POST /convert
```

**Request Body**

| Field    | Type     | Description                          | Required |
| -------- | -------- | ------------------------------------ | -------- |
| `from`   | `string` | Source currency code (e.g., "USD")   | Yes      |
| `to`     | `string` | Target currency code (e.g., "EUR")   | Yes      |
| `amount` | `number` | Amount to convert (must be positive) | Yes      |

**Example Request**

```bash
curl -X POST http://localhost:3000/convert \
  -H "Content-Type: application/json" \
  -d '{
    "from": "USD",
    "to": "UAH",
    "amount": 100
  }'
```

**Success Response (200 OK)**

```json
{
  "from": "USD",
  "to": "UAH",
  "amount": 100,
  "result": 4150.5
}
```

**Error Responses**

| Status | Description                                       | Example                                                                                      |
| ------ | ------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| `400`  | Invalid amount or unsupported currency            | `{"statusCode": 400, "message": "Invalid amount: -10. Amount must be a positive number."}`   |
| `404`  | Exchange rate not found                           | `{"statusCode": 404, "message": "Exchange rate not found for XYZ to ABC"}`                   |
| `503`  | Service unavailable (circuit open or API failure) | `{"statusCode": 503, "message": "Service temporarily unavailable. Please try again later."}` |

### Usage Examples

**JavaScript (fetch)**

```javascript
const response = await fetch('http://localhost:3000/convert', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    from: 'EUR',
    to: 'USD',
    amount: 50,
  }),
});
const data = await response.json();
console.log(data);
```

---

## Supported Currencies

The API supports 80+ currencies. Here are some commonly used ones:

| Code | Currency          |
| ---- | ----------------- |
| UAH  | Ukrainian Hryvnia |
| USD  | US Dollar         |
| EUR  | Euro              |
| GBP  | British Pound     |
| CHF  | Swiss Franc       |
| JPY  | Japanese Yen      |
| CAD  | Canadian Dollar   |
| AUD  | Australian Dollar |
| CNY  | Chinese Yuan      |
| PLN  | Polish Zloty      |
| TRY  | Turkish Lira      |
| INR  | Indian Rupee      |
| AED  | UAE Dirham        |
| SGD  | Singapore Dollar  |
| HKD  | Hong Kong Dollar  |

<details>
<summary><strong>View all supported currencies</strong></summary>

UAH, USD, EUR, GBP, CHF, JPY, CAD, MXN, BRL, ARS, CLP, COP, PEN, CRC, CUP, NIO, PYG, BOB, UYU, PLN, CZK, HUF, RON, BGN, RSD, HRK, DKK, NOK, SEK, ISK, MDL, MKD, ALL, BYN, GEL, TRY, CNY, INR, KRW, IDR, MYR, THB, VND, PHP, SGD, HKD, TWD, PKR, BDT, LKR, NPR, KHR, LAK, MNT, KZT, UZS, KGS, TJS, AZN, AMD, AED, SAR, QAR, KWD, BHD, OMR, JOD, ILS, IQD, LBP, LYD, EGP, ZAR, NGN, KES, MAD, TND, DZD, GHS, ETB, TZS, UGX, MUR, NAD, BWP, MZN, MWK, SCR, SDG, SOS, SZL, GMD, GNF, BIF, DJF, CDF, MGA, SLL, AOA, AFN, YER, AUD, NZD, BND, XAF, XOF

</details>

---

## Architecture

### Project Structure

```
currency_converter/
├── src/
│   ├── main.ts                 # Application entry point
│   ├── app.module.ts           # Root module
│   ├── app.controller.ts       # Main controller (POST /convert)
│   ├── app.service.ts          # Business logic for conversion
│   ├── constants/
│   │   └── currency-codes.ts   # ISO 4217 currency codes mapping
│   ├── currency/
│   │   ├── currency.module.ts  # Currency module
│   │   └── currency-api.service.ts  # Monobank API integration
│   └── dto/
│       └── convert.dto.ts      # Request/Response DTOs
├── docker-compose.yml          # Docker Compose configuration
├── Dockerfile                  # Docker build configuration
└── package.json
```

### Key Components

- **CurrencyApiService**: Handles Monobank API communication with caching and circuit breaker
- **AppService**: Contains currency conversion business logic
- **AppController**: Exposes the REST API endpoint
- **Redis Cache**: Caches exchange rates to reduce API calls

### Circuit Breaker Pattern

The application implements a circuit breaker to handle Monobank API failures gracefully:

1. **Closed State**: Normal operation, requests pass through
2. **Open State**: After N consecutive failures, requests are rejected immediately
3. **Half-Open State**: After timeout, allows one request to test recovery

---

## Development

### Available Scripts

| Command                | Description                        |
| ---------------------- | ---------------------------------- |
| `npm run start`        | Start the application              |
| `npm run start:dev`    | Start in watch mode (hot reload)   |
| `npm run start:debug`  | Start in debug mode                |
| `npm run start:prod`   | Start in production mode           |
| `npm run build`        | Build the application              |
| `npm run lint`         | Run ESLint                         |
| `npm run format`       | Format code with Prettier          |
| `npm run docker:dev`   | Start with Docker Compose          |
| `npm run docker:down`  | Stop Docker containers             |
| `npm run docker:clean` | Stop containers and remove volumes |

### Docker Commands

```bash
# Start application with Docker
npm run docker:dev

# Stop containers
npm run docker:down

# Stop and clean up (removes volumes and images)
npm run docker:clean

# View logs
docker compose logs -f app

# Access Redis CLI
docker exec -it currency_converter_redis redis-cli
```

## Troubleshooting

### Common Issues

**Redis connection failed**

- Ensure Redis is running: `docker ps` or `redis-cli ping`
- Check `REDIS_HOST` and `REDIS_PORT` environment variables

**API returns 503 Service Unavailable**

- Circuit breaker may be open due to Monobank API issues
- Wait for `CIRCUIT_BREAKER_TIMEOUT` (default: 30s) and retry

**Unsupported currency error**

- Verify the currency code is in the supported list
- Currency codes are case-insensitive (USD, usd, Usd all work)
