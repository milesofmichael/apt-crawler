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
- [ ] Create new GitHub repository named `apt-crawler`
- [ ] Initialize with README.md
- [ ] Clone repository locally
- [ ] Set up branch protection rules (optional)

### GitHub Secrets Configuration
Navigate to your GitHub repo → Settings → Secrets and variables → Actions, then add:
- [ ] `SUPABASE_URL` - Your Supabase project URL
- [ ] `SUPABASE_ANON_KEY` - Your Supabase anonymous key  
- [ ] `SUPABASE_SERVICE_ROLE_KEY` - Your Supabase service role key
- [ ] `TWILIO_ACCOUNT_SID` - Your Twilio Account SID
- [ ] `TWILIO_AUTH_TOKEN` - Your Twilio Auth Token
- [ ] `TWILIO_PHONE_NUMBER` - Your Twilio phone number (e.g., +1234567890)
- [ ] `MY_PHONE_NUMBER` - Your personal phone number (+15615452977)

### Render.com Setup
- [ ] Create Render.com account (free tier available)
- [ ] Connect GitHub account to Render
- [ ] Create Redis instance for BullMQ (free trial tier)
- [ ] Note Redis connection URL for GitHub secrets
- [ ] **Note**: Payment method only required if you exceed free tier limits

### Supabase Setup
- [ ] Create Supabase project
- [ ] Go to Settings → API to get:
  - [ ] Project URL (for `SUPABASE_URL`)
  - [ ] Anon key (for `SUPABASE_ANON_KEY`)
  - [ ] Service role key (for `SUPABASE_SERVICE_ROLE_KEY`)
- [ ] Enable Row Level Security (RLS) on tables

### Twilio Setup
- [ ] Verify Twilio account has SMS credits
- [ ] Go to Console → Account Info to get:
  - [ ] Account SID (for `TWILIO_ACCOUNT_SID`)
  - [ ] Auth Token (for `TWILIO_AUTH_TOKEN`)
- [ ] Go to Phone Numbers to get your Twilio number (for `TWILIO_PHONE_NUMBER`)

## Phase 2: Project Initialization

- [ ] Initialize Node.js project:
  ```bash
  mkdir apt-crawler && cd apt-crawler
  npm init -y
  npm install typescript @types/node tsx
  npx tsc --init
  ```

- [ ] Install dependencies:
  ```bash
  npm install playwright @supabase/supabase-js bullmq ioredis twilio dotenv
  npm install -D @types/bullmq nodemon
  ```

- [ ] Create project structure:
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

- [ ] Copy `.env.example` to `.env` for local development:
  ```bash
  cp .env.example .env
  ```
- [ ] Fill in your local `.env` file with actual values (for development only)

- [ ] Configure TypeScript (`tsconfig.json`):
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

- [ ] Connect to Supabase SQL Editor
- [ ] Create apartments table:
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

- [ ] Create scraping logs table:
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
- [ ] Create `src/types/apartment.ts`:
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
- [ ] Create `src/services/scraper.ts`:
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
- [ ] Create `src/services/database.ts`:
  - Initialize Supabase client
  - Implement `getActiveApartments()` - fetch all available units
  - Implement `findNewUnits()` - compare scraped vs existing
  - Implement `updateApartments()` - upsert all scraped units
  - Implement `markUnavailable()` - mark missing units as unavailable
  - Implement `logScrapeRun()` - log scraping results

### Notification Service
- [ ] Create `src/services/notifications.ts`:
  - Initialize Twilio client
  - Implement `sendNewApartmentSMS()`:
    ```
    New 1BR available!
    WEST-641: $1,991/mo
    Available: 9/28
    View: https://flatsatpcm.com/floorplans/the-dellwood/
    ```
  - Batch multiple units into single SMS if needed
  - Handle Twilio errors gracefully

### BullMQ Worker
- [ ] Create `src/workers/scrapeWorker.ts`:
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
- [ ] Create `src/jobs/scrapeJob.ts`:
  - Set up BullMQ queue
  - Add recurring job (cron: "0 */2 * * *")
  - Implement job de-duplication

### Main Entry Point
- [ ] Create `src/index.ts`:
  - Initialize Redis connection
  - Start BullMQ worker
  - Set up graceful shutdown
  - Add health check endpoint

## Phase 5: Render.com Configuration

### Environment Variables
All environment variables are managed through GitHub Secrets for production deployment. For local development, use the `.env` file created from `.env.example`.

### Render Configuration
- [ ] Create `render.yaml`:
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
          fromRepo: true
        - key: SUPABASE_ANON_KEY
          fromRepo: true
        - key: SUPABASE_SERVICE_ROLE_KEY
          fromRepo: true
        - key: REDIS_URL
          fromService:
            name: apt-crawler-redis
            type: redis
            property: connectionString
        - key: TWILIO_ACCOUNT_SID
          fromRepo: true
        - key: TWILIO_AUTH_TOKEN
          fromRepo: true
        - key: TWILIO_PHONE_NUMBER
          fromRepo: true
        - key: MY_PHONE_NUMBER
          fromRepo: true

    - type: redis
      name: apt-crawler-redis
      plan: starter  # Use free trial tier
      maxmemoryPolicy: allkeys-lru
  ```

### Deployment Steps
- [ ] Commit and push to GitHub:
  ```bash
  git add .
  git commit -m "Initial apartment crawler implementation"
  git push origin main
  ```

- [ ] In Render Dashboard:
  - [ ] Click "New +" → "Blueprint"
  - [ ] Select your GitHub repository (`apt-crawler`)
  - [ ] Render will auto-detect `render.yaml`
  - [ ] Render automatically uses GitHub Secrets as environment variables
  - [ ] Click "Apply" to deploy

- [ ] After Redis deployment completes:
  - [ ] Copy Redis connection URL from Render dashboard
  - [ ] Add `REDIS_URL` to your GitHub Secrets
  - [ ] Redeploy the worker service

## Phase 6: Cron Job Setup

- [ ] In Render Dashboard:
  - [ ] Go to your worker service
  - [ ] Navigate to "Jobs" tab
  - [ ] Create new cron job:
    - Name: "scrape-apartments"
    - Schedule: "0 */2 * * *" (every 2 hours)
    - Command: `npm run scrape:once`
- [ ] Add script to `package.json`:
  ```json
  "scripts": {
    "build": "tsc",
    "start": "node dist/index.js",
    "dev": "tsx watch src/index.ts",
    "scrape:once": "tsx src/jobs/runOnce.ts"
  }
  ```

## Phase 7: Testing & Monitoring

### Local Testing
- [ ] Test scraper with single floorplan
- [ ] Test database operations
- [ ] Test SMS sending (use test number first)
- [ ] Test full workflow locally

### Production Testing
- [ ] Deploy to Render
- [ ] Manually trigger cron job
- [ ] Verify database updates
- [ ] Confirm SMS delivery
- [ ] Check worker logs

### Monitoring Setup
- [ ] Set up Render alerts for worker failures
- [ ] Create Supabase query for recent scrapes:
  ```sql
  SELECT * FROM scraping_logs 
  ORDER BY started_at DESC 
  LIMIT 20;
  ```
- [ ] Monitor Twilio usage dashboard
- [ ] Set up error notifications to admin

## Phase 8: Maintenance & Operations

### Regular Checks
- [ ] Weekly: Review scraping logs for errors
- [ ] Monthly: Check Twilio balance
- [ ] Monthly: Verify Render billing

### Troubleshooting Guide
- [ ] If scraper fails: Check if website structure changed
- [ ] If no SMS: Verify Twilio credentials and balance
- [ ] If duplicate SMS: Check database unique constraints
- [ ] If missed apartments: Review scraper selectors

### Update Procedures
- [ ] To update selectors: Modify `scraper.ts` and redeploy
- [ ] To change schedule: Update cron job in Render dashboard
- [ ] To add phone numbers: Update environment variables

## Cost Estimate (Updated)
- **Render.com Worker**: **FREE** (750 hours/month free tier - you'll use ~3 hours/month)
- **Render.com Redis**: **FREE** (trial tier) or $10/month for production persistence
- **Supabase**: **FREE** (free tier is plenty for this use case)
- **Twilio**: ~$0.0079 per SMS (only when apartments found)
- **Total**: **$0-10/month** + minimal SMS costs

### Usage Breakdown
- Scraper runs every 2 hours for ~30 seconds each time
- Monthly runtime: 12 runs/day × 30 days × 30 seconds = **~3 hours/month**
- Well within Render's 750 free hours/month limit

## Timeline
- Account setup: 30 minutes
- Database setup: 30 minutes
- Core implementation: 3-4 hours
- Testing & deployment: 1-2 hours
- **Total**: 5-7 hours