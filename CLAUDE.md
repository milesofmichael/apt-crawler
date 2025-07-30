# Apartment Availability Tracker - Project Context

## Architecture
- **Hosting**: Render.com (background worker)
- **Database**: Supabase PostgreSQL
- **Queue**: BullMQ with Redis
- **Runtime**: Node.js with TypeScript
- **Scraping**: Playwright
- **Notifications**: Twilio SMS

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
  - unit_number (unique identifier)
  - floorplan_name
  - bedroom_count
  - rent
  - availability_date
  - last_seen
  - first_seen

## Notification Format
```
New 1BR available!
WEST-641: $1,991/mo
Available: 9/28
View: [floorplan URL]
```

## Key Requirements
- Only track studios (0BR) and 1-bedrooms
- Send SMS only for newly available units
- Run every 2 hours via cron
- Use BullMQ for job processing