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
```
📍 New Studio Available!
WEST-641: $1,991/mo
Available: 9/28
Floorplan: The Dellwood
```

## Implementation Details
- **Project Structure**: TypeScript with strict type checking
- **Services**: Database (Supabase), Scraper (Playwright), Notifications (Ntfy.sh)
- **Workers**: BullMQ background worker with Redis queue
- **Jobs**: Recurring scrape job (every 2 hours) + one-time runner
- **Testing**: Jest with full coverage (51 tests passing)
- **Deployment**: render.yaml blueprint with automatic Redis setup

## Environment Variables
- SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY
- NTFY_TOPIC, NTFY_SERVER (defaults to https://ntfy.sh)
- REDIS_URL (auto-configured by Render)
- NODE_ENV, LOG_LEVEL

## Key Requirements
- Only track studios (0BR) and 1-bedrooms
- Send notifications only for newly available units  
- Run every 2 hours via scheduled worker
- Use BullMQ for reliable job processing
- Maintain apartment availability history