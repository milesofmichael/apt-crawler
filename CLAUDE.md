# Apartment Availability Tracker - Project Context

## Architecture
- **Hosting**: Render.com (background worker + Redis)
- **Database**: Supabase PostgreSQL  
- **Queue**: BullMQ with Redis (Render managed)
- **Runtime**: Node.js 20+ with TypeScript
- **Scraping**: Playwright (headless browser)
- **Notifications**: Ntfy.sh push notifications (no API keys needed)

## Scraping Logic
1. Navigate to https://flatsatpcm.com/floorplans/
2. Find all studio and 1-bedroom floorplans
3. For each available unit, visit detail page (e.g., /floorplans/the-dellwood/)
4. Extract:
   - Unit number: `.jd-fp-card-info__title--large` (e.g., "WEST-641")
   - Date: `.jd-fp-card-info__text--brand` (format: "9/28")
   - Rent: `.jd-fp-strong-text` (e.g., "$1,991")

## Database Schema
- `apartments` table:
  - id (UUID primary key)
  - unit_number (unique identifier)
  - floorplan_name 
  - floorplan_url
  - bedroom_count (0 for studio, 1 for 1BR)
  - rent (decimal)
  - availability_date (date)
  - is_available (boolean)
  - last_seen, first_seen, created_at, updated_at (timestamps)

- `scraping_logs` table:
  - id, started_at, completed_at
  - units_found, new_units, errors, status

## Notification Format (Ntfy.sh)
**Single Unit:**
```
New Unit Available
The Dellwood - #WEST-641 - $1,991 - Available Sep 28
```

**Multiple Units (3 or fewer):**
```
3 New Units Available
The Dellwood - #WEST-641 - $1,991 - Available Sep 28 | The Gateway - #WEST-437 - $2,699 - Available Sep 05 | ...
```

**Multiple Units (4+):**
```
5 New Units Available
2 studios, 3 1BRs - View all at flatsatpcm.com/floorplans
```

## Implementation Details
- **Project Structure**: TypeScript with strict type checking
- **Services**: Database (Supabase), Scraper (Playwright), Notifications (Ntfy.sh)
- **Workers**: BullMQ background worker with Redis queue
- **Jobs**: Recurring scrape job (every hour) + one-time runner
- **Testing**: Jest with full coverage (51 tests passing)
- **Deployment**: render.yaml blueprint with automatic Redis setup
- **Browser Installation**: Automatic runtime installation for Render.com's ephemeral filesystem

## Environment Variables
- SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY
- NTFY_TOPIC, NTFY_SERVER (defaults to https://ntfy.sh)
- REDIS_URL (auto-configured by Render)
- NODE_ENV, LOG_LEVEL

## Commands
- `npm run scrape:once` - Run scraper once and check for new units
- `npm run scrape:once -- --ignore-database` - Force send notifications for ALL found units (bypasses database checks)
- `npm test` - Run all unit tests (83 tests)
- `npm run build` - Compile TypeScript to JavaScript
- `npm start` - Start the background worker (production)

## Key Requirements
- Only track studios (0BR) and 1-bedrooms
- Send notifications only for newly available units (unless `--ignore-database` flag used)
- Run every hour via scheduled worker
- Use BullMQ for reliable job processing
- Maintain apartment availability history
- Concise notification format for mobile push notifications

## Development Requirements
- **ALWAYS write comprehensive unit tests for ALL new code**
- **100% of tests MUST pass before deployment**
- Test coverage should include edge cases, error handling, and all code paths
- Use Jest for testing with proper mocking of external dependencies

## Render.com Notes
- ScraperService auto-installs Playwright browsers at runtime (ephemeral filesystem issue)
- Multi-strategy navigation with timeout handling (DOM loaded → full load → network idle)
- 3-attempt retry logic with exponential backoff for network reliability
- Build command: `npm install && npm run build` (no browser pre-install needed)