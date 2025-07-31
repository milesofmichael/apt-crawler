# Implementation Plan - Apartment Availability Tracker

## Architecture Overview
- **Hosting**: Render.com (Background Worker + Cron Job)
- **Database**: Supabase PostgreSQL
- **Queue**: BullMQ with Redis (Render Redis)
- **Runtime**: Node.js 20+ with TypeScript
- **Web Scraping**: Playwright
- **Notifications**: Twilio SMS API

## Phase 1: Account Setup & Prerequisites

### GitHub Repository Setup
- [x] Create new GitHub repository named `apt-crawler`
- [x] Initialize with README.md
- [x] Clone repository locally
- [ ] Set up branch protection rules (optional)

### Environment Variables Setup
**No GitHub secrets needed!** Render will prompt you for these during initial deployment:

- [ ] `SUPABASE_URL` - Your Supabase project URL
- [ ] `SUPABASE_ANON_KEY` - Your Supabase anonymous key
- [ ] `SUPABASE_SERVICE_ROLE_KEY` - Your Supabase service role key
- [ ] `NTFY_TOPIC` - Your ntfy.sh topic name
- [ ] `NTFY_SERVER` - ntfy.sh server URL

### Render.com Setup
- [ ] Create Render.com account (free tier available)
- [ ] Connect GitHub account to Render
- [ ] **Note**: Redis instance will be created automatically via render.yaml blueprint (free trial tier)
- [ ] **Note**: REDIS_URL environment variable is automatically configured via `fromService` property
- [ ] **Note**: Payment method only required if you exceed free tier limits

### Supabase Setup
- [ ] Create Supabase project
- [ ] Go to Settings → API to get:
  - [ ] Project URL (for `SUPABASE_URL`)
  - [ ] Anon key (for `SUPABASE_ANON_KEY`)
  - [ ] Service role key (for `SUPABASE_SERVICE_ROLE_KEY`)
- [ ] Enable Row Level Security (RLS) on tables

### Ntfy.sh Setup
- [x] No account required - ntfy.sh is free and open
- [x] Choose a unique topic name: `your-unique-topic-name`
- [x] Subscribe to topic via:
  - Web: https://ntfy.sh/your-unique-topic-name
  - Mobile app: Download ntfy app and subscribe to topic
  - Command line: `curl -s ntfy.sh/your-unique-topic-name/json`

## Phase 2: Project Initialization

- [x] Initialize Node.js project:
  ```bash
  mkdir apt-crawler && cd apt-crawler
  npm init -y
  npm install typescript @types/node tsx
  npx tsc --init
  ```

- [x] Install dependencies:
  ```bash
  npm install playwright @supabase/supabase-js bullmq ioredis dotenv
  npm install -D jest @types/jest ts-jest @jest/globals nodemon
  ```

- [x] Create project structure:
  ```
  apt-crawler/
  ├── src/
  │   ├── types/
  │   │   └── apartment.ts
  │   ├── services/
  │   │   ├── scraper.ts
  │   │   ├── database.ts
  │   │   └── notifications.ts
  │   ├── workers/
  │   │   └── scrapeWorker.ts
  │   ├── jobs/
  │   │   └── scrapeJob.ts
  │   └── index.ts
  ├── .env.example
  ├── .gitignore
  ├── package.json
  ├── tsconfig.json
  └── render.yaml
  ```

- [x] Copy `.env.example` to `.env` for local development:
  ```bash
  cp .env.example .env
  ```
- [x] Fill in your local `.env` file with actual values (for development only)

- [x] Configure TypeScript (`tsconfig.json`):
  ```json
  {
    "compilerOptions": {
      "target": "ES2022",
      "module": "commonjs",
      "lib": ["ES2022"],
      "outDir": "./dist",
      "rootDir": "./src",
      "strict": true,
      "esModuleInterop": true,
      "skipLibCheck": true,
      "forceConsistentCasingInFileNames": true,
      "resolveJsonModule": true
    }
  }
  ```

## Phase 3: Database Schema Creation

- [x] Connect to Supabase SQL Editor
- [x] Create apartments table:
  ```sql
  CREATE TABLE apartments (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    unit_number TEXT UNIQUE NOT NULL,
    floorplan_name TEXT NOT NULL,
    floorplan_url TEXT NOT NULL,
    bedroom_count INTEGER NOT NULL,
    rent DECIMAL(10,2) NOT NULL,
    availability_date DATE,
    is_available BOOLEAN DEFAULT true,
    last_seen TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    first_seen TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
  );

  CREATE INDEX idx_unit_available ON apartments(unit_number, is_available);
  CREATE INDEX idx_bedroom_count ON apartments(bedroom_count);
  ```

- [x] Create scraping logs table:
  ```sql
  CREATE TABLE scraping_logs (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    started_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    completed_at TIMESTAMP WITH TIME ZONE,
    units_found INTEGER DEFAULT 0,
    new_units INTEGER DEFAULT 0,
    errors TEXT,
    status TEXT DEFAULT 'running',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
  );
  ```

## Phase 4: Core Implementation

### Types Definition
- [x] Create `src/types/apartment.ts`:
  ```typescript
  export interface Apartment {
    unitNumber: string;
    floorplanName: string;
    floorplanUrl: string;
    bedroomCount: number;
    rent: number;
    availabilityDate: Date | null;
    isAvailable: boolean;
  }

  export interface ScrapedUnit {
    unitNumber: string;
    rent: string;
    availabilityDate: string;
    floorplanName: string;
    floorplanUrl: string;
    bedroomCount: number;
  }
  ```

### Web Scraper Service
- [x] Create `src/services/scraper.ts`:
  - Initialize Playwright browser
  - Navigate to https://flatsatpcm.com/floorplans/
  - Find all floorplan cards
  - Filter for studios and 1-bedrooms
  - For each available unit:
    - Click through to detail page
    - Extract unit number, rent, and availability date
    - Parse date from "Available Sep 28" to "9/28"
    - Parse rent from "$1,991" to 1991
  - Return array of ScrapedUnit objects

### Database Service
- [x] Create `src/services/database.ts`:
  - Initialize Supabase client
  - Implement `getActiveApartments()` - fetch all available units
  - Implement `findNewUnits()` - compare scraped vs existing
  - Implement `updateApartments()` - upsert all scraped units
  - Implement `markUnavailable()` - mark missing units as unavailable
  - Implement `logScrapeRun()` - log scraping results

### Notification Service
- [x] Create `src/services/notifications.ts`:
  - Use ntfy.sh for push notifications (no API keys needed)
  - Implement `sendNewApartmentNotification()`:
    ```
    Title: New 1BR Available!
    Message: WEST-641: $1,991/mo
    Available: 9/28
    Floorplan: The Dellwood
    ```
  - Include action buttons for direct links to floorplans
  - Support rich notifications with emojis and priority levels
  - Handle multiple apartments in single notification
  - Batch multiple units with summary format

### BullMQ Worker
- [x] Create `src/workers/scrapeWorker.ts`:
  - Set up BullMQ worker
  - Process scraping jobs:
    1. Log start time
    2. Run scraper
    3. Compare with database
    4. Send notifications for new units
    5. Update database
    6. Log completion
  - Implement retry logic on failure
  - Set job timeout to 5 minutes

### Job Scheduler
- [x] Create `src/jobs/scrapeJob.ts`:
  - Set up BullMQ queue
  - Add recurring job (cron: "0 */2 * * *")
  - Implement job de-duplication

### Main Entry Point
- [x] Create `src/index.ts`:
  - Initialize Redis connection
  - Start BullMQ worker
  - Set up graceful shutdown
  - Add health check endpoint

## Phase 4.5: Unit Testing

### Test Setup
- [x] Install Jest testing framework:
  ```bash
  npm install -D jest @types/jest ts-jest @jest/globals
  ```
- [x] Configure Jest with `jest.config.js`
- [x] Create test setup file `tests/setup.ts`
- [x] Add test scripts to `package.json`:
  ```json
  "scripts": {
    "test": "jest",
    "test:watch": "jest --watch",
    "test:coverage": "jest --coverage"
  }
  ```

### Service Tests
- [x] Create `tests/services/database.test.ts`:
  - Test Supabase client initialization
  - Test `getActiveApartments()` method
  - Test `findNewUnits()` comparison logic
  - Test `updateApartments()` upsert functionality
  - Test `markUnavailable()` status updates
  - Test `logScrapeRun()` logging
  - Test `testConnection()` health check
  - Test error handling for all methods

- [x] Create `tests/services/scraper.test.ts`:
  - Test Playwright browser initialization
  - Test apartment scraping workflow
  - Test bedroom count extraction
  - Test rent parsing from strings
  - Test availability date parsing
  - Test floorplan filtering logic
  - Test error handling and cleanup
  - Mock external dependencies

- [x] Create `tests/services/notifications.test.ts`:
  - Test ntfy.sh notification service initialization
  - Test single apartment notification formatting
  - Test multiple apartments notification formatting
  - Test studio vs 1BR labeling
  - Test date formatting in messages
  - Test error notification sending
  - Test notification test functionality
  - Test summary notifications with statistics
  - Mock fetch API calls to ntfy.sh

### Test Results
- [x] All tests passing: **51 tests passed**
- [x] Full test coverage for core services
- [x] Proper mocking of external dependencies (fetch, Supabase, Playwright)
- [x] Error handling verification
- [x] Edge case testing included
- [x] Notification service updated with ntfy.sh integration tests

## Phase 5: Render.com Configuration

### Environment Variables
Environment variables are set during initial Render deployment (thanks to `sync: false` in render.yaml). For local development, use the `.env` file created from `.env.example`.

### Render Configuration
- [x] Create `render.yaml`:
  ```yaml
  services:
    - type: worker
      name: apt-crawler-worker
      env: node
      plan: starter
      buildCommand: npm install && npm run build
      startCommand: npm start
      envVars:
        - key: NODE_ENV
          value: production
        - key: SUPABASE_URL
          sync: false
        - key: SUPABASE_ANON_KEY
          sync: false
        - key: SUPABASE_SERVICE_ROLE_KEY
          sync: false
        - key: REDIS_URL
          fromService:
            name: apt-crawler-redis
            type: redis
            property: connectionString
        - key: NTFY_TOPIC
          sync: false
        - key: NTFY_SERVER
          sync: false

    - type: redis
      name: apt-crawler-redis
      plan: starter  # Use free trial tier
      maxmemoryPolicy: allkeys-lru
  ```

### Deployment Steps
- [x] Commit and push to GitHub:
  ```bash
  git add .
  git commit -m "Initial apartment crawler implementation"
  git push origin main
  ```

- [x] **Manual Deployment Process** (Alternative to Blueprint):
  - [x] Create Background Worker service manually
    - [x] Connect GitHub repository (`apt-crawler`)
    - [x] Set build command: `npm install && npm run build`
    - [x] Set start command: `npm start`
    - [x] Import environment variables from .env file or set manually:
      - [x] SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY
      - [x] NTFY_TOPIC, NTFY_SERVER
  - [x] Create Redis (Key Value) service separately
    - [x] Name: `apt-crawler-redis`, same region as worker
    - [x] Copy internal connection string to worker's `REDIS_URL` env var
  - [x] Deploy both services

### Redis Verification Steps ✅ COMPLETED
After deployment, verify Redis is properly configured:

- [x] **In Render Dashboard**:
  - [x] Confirm both services are running: worker and Redis services
  - [x] Click on Redis service to see connection details
  - [x] Verify Redis status shows "Live"

- [x] **Check Environment Variables**:
  - [x] Go to worker service → Environment tab
  - [x] Confirm `REDIS_URL` is properly set with Redis connection string
  - [x] URL format: `redis://red-xxxxx:6379`

- [x] **Test Redis Connection**:
  - [x] Check worker service logs for successful Redis connection
  - [x] Look for BullMQ connection messages in logs
  - [x] Worker shows: "Scrape worker started and connected to Redis"

## Phase 6: Job Scheduling ✅ COMPLETED

- [x] **Automatic Scheduling** (via BullMQ):
  - [x] Jobs scheduled automatically by the worker application
  - [x] Recurring job runs every hour: "0 */1 * * *"
  - [x] No manual cron job setup needed in Render dashboard
  - [x] Logs show: "Scheduled recurring scraping job"

- [x] **Manual Trigger Options**:
  - Worker service → Shell tab → Run: `npm run scrape:once`
  - Or create one-time job with command: `npm run scrape:once`

- [x] Add script to `package.json`:
  ```json
  "scripts": {
    "build": "tsc",
    "start": "node dist/index.js",
    "dev": "tsx watch src/index.ts",
    "scrape:once": "tsx src/jobs/runOnce.ts"
  }
  ```

### Command Line Options ✅ COMPLETED
- [x] **`--ignore-database` Flag**:
  - Force send notifications for ALL found units regardless of database status
  - Skips database connection and "new unit" checks
  - Useful for:
    - Testing notifications without database dependencies
    - Force-sending notifications after fixing issues
    - Demonstrations and debugging
  - Usage: `npm run scrape:once -- --ignore-database`
  - Example output: "🚫 Database checks disabled - will notify for all found units"

## Phase 7: Testing & Monitoring

### Local Testing
- [ ] Test scraper with single floorplan
- [ ] Test database operations
- [ ] Test ntfy.sh notifications
- [ ] Test full workflow locally

### Production Testing ✅ COMPLETED
- [x] Deploy to Render
- [x] Worker application started successfully
- [x] Redis connection established
- [x] Job scheduling active (every hour)
- [ ] Manually trigger scrape job to verify full workflow
- [ ] Verify database updates
- [ ] Confirm notification delivery
- [x] Check worker logs (showing successful startup)

### Monitoring Setup
- [ ] Set up Render alerts for worker failures
- [ ] Create Supabase query for recent scrapes:
  ```sql
  SELECT * FROM scraping_logs 
  ORDER BY started_at DESC 
  LIMIT 20;
  ```
- [ ] Monitor ntfy.sh topic for notification delivery
- [ ] Set up error notifications to admin

## Phase 8: Maintenance & Operations

### Regular Checks
- [ ] Weekly: Review scraping logs for errors
- [ ] Monthly: Verify Render billing
- [ ] Monthly: Check ntfy.sh topic subscription

### Troubleshooting Guide
- [ ] If scraper fails: Check if website structure changed
- [ ] If no notifications: Verify ntfy.sh topic and network connectivity
- [ ] If duplicate notifications: Check database unique constraints
- [ ] If missed apartments: Review scraper selectors

### Update Procedures
- [ ] To update selectors: Modify `scraper.ts` and redeploy
- [ ] To change schedule: Update cron job in Render dashboard
- [ ] To change notification topic: Update `NTFY_TOPIC` environment variable

## Cost Estimate (Updated)
- **Render.com Worker**: **FREE** (750 hours/month free tier - you'll use ~3 hours/month)
- **Render.com Redis**: **FREE** (trial tier) or $10/month for production persistence
- **Supabase**: **FREE** (free tier is plenty for this use case)
- **Ntfy.sh**: **FREE** (no limits, no registration required)
- **Total**: **$0-10/month** (completely free with trial tiers)

### Usage Breakdown
- Scraper runs every hour for ~30 seconds each time
- Monthly runtime: 24 runs/day × 30 days × 30 seconds = **~6 hours/month**
- Well within Render's 750 free hours/month limit

## Timeline
- Account setup: 30 minutes
- Database setup: 30 minutes
- Core implementation: 3-4 hours
- Testing & deployment: 1-2 hours
- **Total**: 5-7 hours