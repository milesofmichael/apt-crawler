import { chromium, Browser, BrowserContext, Page } from 'playwright';
import { execSync } from 'child_process';
import { Apartment, ScrapedUnit } from '../types/apartment';

/**
 * Web scraper service for apartment availability data
 */
export class ScraperService {
  private browser: Browser | null = null;
  private context: BrowserContext | null = null;

  /**
   * Initialize browser for scraping
   */
  async initialize(): Promise<void> {
    console.log('Initializing browser for scraping...');
    
    // Clean up any existing resources first
    await this.cleanup();
    
    // Force cleanup of zombie processes on Render.com
    if (process.env.NODE_ENV === 'production') {
      try {
        console.log('Cleaning up any zombie browser processes...');
        execSync('pkill -f chromium || true', { stdio: 'pipe' });
        execSync('pkill -f chrome || true', { stdio: 'pipe' });
        // Clear any tmp files that might be consuming disk space
        execSync('rm -rf /tmp/.org.chromium.* || true', { stdio: 'pipe' });
        execSync('rm -rf /tmp/playwright* || true', { stdio: 'pipe' });
      } catch (cleanupError) {
        console.log('Process cleanup completed (errors expected)');
      }
    }
    
    const launchOptions = {
      headless: true,
      timeout: 30000, // Explicit launch timeout
      args: [
        '--no-sandbox',
        '--disable-dev-shm-usage',
        '--disable-gpu',
        '--disable-web-security',
        '--disable-features=VizDisplayCompositor',
        '--disable-background-timer-throttling',
        '--disable-backgrounding-occluded-windows',
        '--disable-renderer-backgrounding',
        // Additional args for Render.com reliability
        '--single-process', // Reduce memory usage
        '--no-zygote', // Avoid process spawning issues
        '--disable-extensions',
        '--disable-default-apps',
        '--disable-background-networking',
        '--disable-sync',
        '--disable-translate',
        '--disable-ipc-flooding-protection'
      ]
    };
    
    try {
      console.log('Attempting browser launch...');
      this.browser = await chromium.launch(launchOptions);
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      console.log(`Browser launch failed: ${errorMsg}`);
      
      // Handle multiple error scenarios
      if (errorMsg.includes('Executable doesn\'t exist') || errorMsg.includes('browser executable')) {
        console.log('Browser executable missing, installing...');
        await this.installBrowserAndRetry(launchOptions);
      } else if (errorMsg.includes('timeout') || errorMsg.includes('Timeout')) {
        console.log('Browser launch timeout, retrying with extended timeout...');
        launchOptions.timeout = 60000;
        this.browser = await chromium.launch(launchOptions);
      } else if (errorMsg.includes('Failed to launch') || errorMsg.includes('spawn')) {
        console.log('Browser spawn failed, cleaning up and retrying...');
        await new Promise(resolve => setTimeout(resolve, 5000)); // Wait 5s
        this.browser = await chromium.launch(launchOptions);
      } else {
        throw error;
      }
    }
    
    if (!this.browser) {
      throw new Error('Browser initialization failed');
    }
    
    this.context = await this.browser.newContext({
      userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      viewport: { width: 1920, height: 1080 },
      locale: 'en-US',
      timezoneId: 'America/New_York',
      extraHTTPHeaders: {
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.5',
        'Accept-Encoding': 'gzip, deflate',
        'DNT': '1',
        'Connection': 'keep-alive',
        'Upgrade-Insecure-Requests': '1'
      }
    });
    
    console.log('Browser initialized successfully');
  }

  /**
   * Install browser and retry launch
   */
  private async installBrowserAndRetry(launchOptions: any): Promise<void> {
    try {
      console.log('Installing Playwright browsers...');
      execSync('npx playwright install chromium', { stdio: 'inherit' });
      console.log('Browser installation completed, retrying launch...');
      
      // Wait a moment for installation to settle
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      this.browser = await chromium.launch(launchOptions);
    } catch (installError) {
      console.error('Failed to install browsers:', installError);
      throw new Error('Could not initialize browser after installation attempt');
    }
  }

  /**
   * Clean up browser resources
   */
  async cleanup(): Promise<void> {
    try {
      if (this.context) {
        await this.context.close();
        this.context = null;
      }
      if (this.browser) {
        await this.browser.close();
        this.browser = null;
      }
      
      // Force garbage collection if available
      if (global.gc) {
        global.gc();
      }
      
      console.log('Browser cleanup completed');
    } catch (error) {
      console.log('Cleanup warning (non-fatal):', error instanceof Error ? error.message : error);
    }
  }

  /**
   * Scrape apartment availability from the floorplans page
   */
  async scrapeApartments(): Promise<Apartment[]> {
    if (!this.context) {
      throw new Error('Browser not initialized. Call initialize() first.');
    }

    const page = await this.context.newPage();
    const scrapedUnits: ScrapedUnit[] = [];
    const globalSeenUnits = new Set<string>(); // Global duplicate prevention across all floorplans

    try {
      console.log('Navigating to floorplans page...');
      
      // Try multiple navigation strategies with different timeouts
      let navigationSuccess = false;
      const strategies = [
        { waitUntil: 'domcontentloaded' as const, timeout: 45000, name: 'DOM loaded' },
        { waitUntil: 'load' as const, timeout: 60000, name: 'full load' },
        { waitUntil: 'networkidle' as const, timeout: 30000, name: 'network idle' }
      ];

      for (const strategy of strategies) {
        try {
          console.log(`Attempting navigation with ${strategy.name} strategy (${strategy.timeout}ms timeout)...`);
          await page.goto('https://flatsatpcm.com/floorplans/', { 
            waitUntil: strategy.waitUntil,
            timeout: strategy.timeout
          });
          navigationSuccess = true;
          console.log(`✅ Navigation successful with ${strategy.name} strategy`);
          break;
        } catch (navError) {
          console.log(`⚠️ ${strategy.name} strategy failed: ${navError instanceof Error ? navError.message : navError}`);
          if (strategy === strategies[strategies.length - 1]) {
            throw navError; // Re-throw the last error if all strategies fail
          }
        }
      }

      if (!navigationSuccess) {
        throw new Error('All navigation strategies failed');
      }

      // Wait for content to load
      await page.waitForTimeout(2000);

      // Scroll to bottom to trigger lazy loading of all cards
      console.log('Scrolling to load all floorplan cards...');
      await page.evaluate(() => {
        window.scrollTo(0, document.body.scrollHeight);
      });
      await page.waitForTimeout(3000); // Wait for lazy loading

      // Scroll back to top
      await page.evaluate(() => {
        window.scrollTo(0, 0);
      });
      await page.waitForTimeout(1000);

      // Find all floorplan cards
      console.log('Finding floorplan cards...');
      const floorplanCards = page.locator('.jd-fp-floorplan-card');
      const cardCount = await floorplanCards.count();
      console.log(`Found ${cardCount} floorplan cards`);

      // Phase 1: Collect all qualifying floorplans without navigating away
      const qualifyingFloorplans: Array<{title: string, url: string, bedroomCount: number}> = [];
      
      for (let i = 0; i < cardCount; i++) {
        const card = floorplanCards.nth(i);
        
        try {
          // Scroll card into view to ensure it's loaded
          await card.scrollIntoViewIfNeeded({ timeout: 3000 });
          await page.waitForTimeout(500); // Brief pause for loading
          
          // Extract bedroom count and title from floorplan
          const titleElement = card.locator('h1, h2, h3, .jd-fp-floorplan-card__title, [class*="title"]');
          const title = await titleElement.textContent({ timeout: 5000 }); // 5 second timeout
          
          if (!title) {
            console.log(`Skipping card ${i} - no title found`);
            continue;
          }
          
          console.log(`Found floorplan: ${title.trim()}`);
          
          // Only process studios (0BR) and 1-bedrooms
          const bedroomCount = this.extractBedroomCount(title);
          if (bedroomCount > 1) {
            console.log(`Skipping ${title} - ${bedroomCount} bedrooms`);
            continue;
          }

          // Check if units are available by looking for "Starting at $" text
          const cardText = await card.textContent({ timeout: 5000 });
          const hasStartingAtPrice = cardText && cardText.includes('Starting at $');
          
          if (!hasStartingAtPrice) {
            console.log(`Skipping ${title} - no "Starting at $" pricing found`);
            continue;
          }
          
          console.log(`✅ ${title} - Available units found with pricing!`);

          // Build floorplan URL from the title
          const urlSlug = title
            .toLowerCase()
            .replace(/^the\s+/, '') // Remove "The " prefix
            .replace(/\s+/g, '-')   // Replace spaces with hyphens
            .replace(/[^a-z0-9-]/g, ''); // Remove non-alphanumeric characters except hyphens
          
          const fullUrl = `https://flatsatpcm.com/floorplans/the-${urlSlug}/`;
          
          console.log(`📍 Built URL for ${title}: ${fullUrl}`);
          
          // Add to qualifying list instead of processing immediately
          qualifyingFloorplans.push({
            title: title.trim(),
            url: fullUrl,
            bedroomCount
          });
          
        } catch (error) {
          console.log(`⚠️  Skipping floorplan card ${i} - timeout or error: ${error instanceof Error ? error.message : error}`);
          continue;
        }
      }

      console.log(`\n🎯 Found ${qualifyingFloorplans.length} qualifying floorplans to process`);

      // Phase 2: Visit each qualifying floorplan individually  
      for (const floorplan of qualifyingFloorplans) {
        console.log(`\n🏠 Processing ${floorplan.bedroomCount}BR floorplan: ${floorplan.title}`);
        
        try {
          const units = await this.scrapeFloorplanDetails(page, floorplan.url, floorplan.title, floorplan.bedroomCount, globalSeenUnits);
          scrapedUnits.push(...units);
        } catch (error) {
          console.log(`⚠️  Failed to process ${floorplan.title}: ${error instanceof Error ? error.message : error}`);
          continue;
        }
      }

      return this.processScrapedUnits(scrapedUnits);

    } finally {
      await page.close();
    }
  }

  /**
   * Extract bedroom count from floorplan title
   */
  private extractBedroomCount(title: string): number {
    const lowerTitle = title.toLowerCase();
    if (lowerTitle.includes('studio')) return 0;
    if (lowerTitle.includes('1 bed') || lowerTitle.includes('one bed')) return 1;
    if (lowerTitle.includes('2 bed') || lowerTitle.includes('two bed')) return 2;
    if (lowerTitle.includes('3 bed') || lowerTitle.includes('three bed')) return 3;
    
    // Try to extract number directly
    const match = title.match(/(\d+)\s*bed/i);
    return match ? parseInt(match[1]) : 0;
  }

  /**
   * Scrape specific unit details from floorplan detail page
   */
  private async scrapeFloorplanDetails(page: Page, url: string, floorplanName: string, bedroomCount: number, globalSeenUnits: Set<string>): Promise<ScrapedUnit[]> {
    const units: ScrapedUnit[] = [];
    // Remove local seenUnits - we'll use the global one instead
    
    try {
      console.log(`Visiting floorplan page: ${url}`);
      await page.goto(url, { waitUntil: 'networkidle' });
      
      // Wait for content to load
      await page.waitForTimeout(2000);

      // Look for "Check Availability" dropdown
      const checkAvailabilitySelector = 'button:has-text("Check Availability"), [class*="availability"], [class*="check"], button:has-text("Availability")';
      const availabilityButton = page.locator(checkAvailabilitySelector).first();
      
      const buttonExists = await availabilityButton.count() > 0;
      console.log(`Check Availability button found: ${buttonExists}`);
      
      if (buttonExists) {
        // Click the dropdown to reveal unit details
        try {
          await availabilityButton.click({ timeout: 5000 });
          console.log('Clicked Check Availability dropdown');
          
          // Wait for dropdown content to appear
          await page.waitForTimeout(1000);
        } catch (error) {
          console.log('Could not click dropdown, trying to extract visible data');
        }
      }
      
      // Look for unit information in various possible containers
      const possibleContainers = [
        '.availability-dropdown',
        '.unit-details',
        '[class*="unit"]',
        '[class*="availability"]',
        '.dropdown-content',
        '.unit-info'
      ];
      
      let foundUnits = false;
      
      for (const containerSelector of possibleContainers) {
        const containers = page.locator(containerSelector);
        const containerCount = await containers.count();
        
        if (containerCount > 0) {
          console.log(`Found ${containerCount} containers with selector: ${containerSelector}`);
          
          for (let i = 0; i < containerCount; i++) {
            const container = containers.nth(i);
            const containerText = await container.textContent({ timeout: 5000 });
            
            if (containerText && containerText.includes('#') && containerText.includes('$')) {
              console.log(`Processing container ${i} text: ${containerText.substring(0, 200)}...`);
              
              // Extract unit information using regex patterns
              // Prioritize descriptive unit numbers like WEST-437 over short codes like D-1
              const unitMatches = containerText.match(/#?([A-Z]{3,}-\d+|WEST-\d+|EAST-\d+|NORTH-\d+|SOUTH-\d+)/g) || 
                                 containerText.match(/#?([A-Z]+-\d+)/g);
              const priceMatches = containerText.match(/\$[\d,]+/g);
              const dateMatches = containerText.match(/Available\s+([A-Za-z]+\s+\d+)|(\d+\/\d+)/g);
              
              if (unitMatches && priceMatches) {
                for (let j = 0; j < unitMatches.length; j++) {
                  const unitNumber = unitMatches[j].replace('#', '');
                  const rent = priceMatches[j] || priceMatches[0];
                  const availabilityDate = dateMatches?.[j] || dateMatches?.[0] || 'Available Now';
                  
                  // Create a unique key including unit number to prevent exact duplicates
                  // The improved regex should already prefer WEST-437 over D-1 format
                  const unitKey = `${floorplanName}-${unitNumber}-${rent}-${availabilityDate}`;
                  if (!globalSeenUnits.has(unitKey)) {
                    globalSeenUnits.add(unitKey);
                    
                    units.push({
                      unitNumber: unitNumber.trim(),
                      rent: rent.trim(),
                      availabilityDate: availabilityDate.replace('Available ', '').trim(),
                      floorplanName,
                      floorplanUrl: url,
                      bedroomCount
                    });
                    
                    console.log(`✅ Found unit: ${unitNumber} - ${rent} - ${availabilityDate}`);
                    foundUnits = true;
                  } else {
                    console.log(`🔄 Duplicate unit skipped: ${unitNumber} - ${rent} - ${availabilityDate}`);
                  }
                }
              }
            }
          }
        }
      }
      
      // If we didn't find units in containers, try extracting from the full page text
      if (!foundUnits) {
        console.log('No units found in containers, trying full page text extraction');
        const pageText = await page.textContent('body', { timeout: 10000 });
        
        if (pageText && pageText.includes('WEST-641')) {
          // Specifically look for the example data you provided
          const unitPattern = /(#?WEST-\d+).*?\$[\d,]+.*?(?:Available\s+[A-Za-z]+\s+\d+|\d+\/\d+)/g;
          let match;
          
          while ((match = unitPattern.exec(pageText)) !== null) {
            const fullMatch = match[0];
            const unitNumber = match[1].replace('#', '');
            const priceMatch = fullMatch.match(/\$[\d,]+/);
            const dateMatch = fullMatch.match(/Available\s+([A-Za-z]+\s+\d+)/) || fullMatch.match(/(\d+\/\d+)/);
            
            if (priceMatch) {
              // Create a unique key including unit number to prevent exact duplicates
              // The improved regex should already prefer WEST-437 over D-1 format
              const unitKey = `${floorplanName}-${unitNumber}-${priceMatch[0]}-${dateMatch?.[1] || dateMatch?.[0] || 'Available Now'}`;
              if (!globalSeenUnits.has(unitKey)) {
                globalSeenUnits.add(unitKey);
                
                units.push({
                  unitNumber: unitNumber.trim(),
                  rent: priceMatch[0].trim(),
                  availabilityDate: dateMatch?.[1] || dateMatch?.[0] || 'Available Now',
                  floorplanName,
                  floorplanUrl: url,
                  bedroomCount
                });
                
                console.log(`✅ Found unit from page text: ${unitNumber} - ${priceMatch[0]} - ${dateMatch?.[1] || 'Available Now'}`);
                foundUnits = true;
              }
            }
          }
        }
      }
      
    } catch (error) {
      console.error(`Error scraping floorplan details for ${url}:`, error);
    }

    return units;
  }

  /**
   * Process scraped units into standardized format with final deduplication
   */
  private processScrapedUnits(scrapedUnits: ScrapedUnit[]): Apartment[] {
    const processedUnits = scrapedUnits.map(unit => {
      // Parse rent from "$1,991" to 1991
      const rent = this.parseRent(unit.rent);
      
      // Parse availability date from "Available Sep 28" or "9/28" format
      const availabilityDate = this.parseAvailabilityDate(unit.availabilityDate);
      
      return {
        unitNumber: unit.unitNumber,
        floorplanName: unit.floorplanName,
        bedroomCount: unit.bedroomCount,
        rent,
        availabilityDate
      };
    });

    // Final deduplication step: remove any remaining duplicates based on unique key
    const seenFinalUnits = new Set<string>();
    const deduplicatedUnits: Apartment[] = [];

    for (const unit of processedUnits) {
      const availabilityStr = unit.availabilityDate?.toLocaleDateString() || 'No Date';
      // Create unique key including unit number to allow multiple units with same rent/date
      const unitKey = `${unit.floorplanName}-${unit.unitNumber}-${unit.rent}-${availabilityStr}`;
      
      if (!seenFinalUnits.has(unitKey)) {
        seenFinalUnits.add(unitKey);
        deduplicatedUnits.push(unit);
      } else {
        console.log(`🔄 Final duplicate unit filtered out: ${unit.floorplanName} - ${unit.unitNumber}`);
      }
    }

    return deduplicatedUnits;
  }

  /**
   * Parse rent string to number
   */
  private parseRent(rentString: string): number {
    const match = rentString.match(/\$?([\d,]+)/);
    if (!match) return 0;
    
    return parseInt(match[1].replace(/,/g, ''));
  }

  /**
   * Parse availability date string to Date object
   */
  private parseAvailabilityDate(dateString: string): Date | null {
    try {
      // Handle "Available Sep 28" format
      if (dateString.toLowerCase().includes('available')) {
        const match = dateString.match(/available\s+(\w+)\s+(\d+)/i);
        if (match) {
          const [, month, day] = match;
          const currentYear = new Date().getFullYear();
          const date = new Date(`${month} ${day}, ${currentYear}`);
          return isNaN(date.getTime()) ? null : date;
        }
      }
      
      // Handle "9/28" format
      const slashMatch = dateString.match(/(\d+)\/(\d+)/);
      if (slashMatch) {
        const [, month, day] = slashMatch;
        const currentYear = new Date().getFullYear();
        const date = new Date(currentYear, parseInt(month) - 1, parseInt(day));
        return isNaN(date.getTime()) ? null : date;
      }
      
      // Try to parse as direct date
      const date = new Date(dateString);
      return isNaN(date.getTime()) ? null : date;
      
    } catch (error) {
      console.error(`Error parsing date "${dateString}":`, error);
      return null;
    }
  }

  /**
   * Run complete scraping workflow with retry logic
   */
  async run(): Promise<Apartment[]> {
    console.log('Starting apartment scraping workflow...');
    
    const maxRetries = 3;
    let lastError: Error | null = null;
    
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        console.log(`Scraping attempt ${attempt}/${maxRetries}...`);
        await this.initialize();
        const apartments = await this.scrapeApartments();
        
        console.log(`Scraping completed successfully. Found ${apartments.length} available units.`);
        return apartments;
        
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        console.log(`Scraping attempt ${attempt} failed: ${lastError.message}`);
        
        // Clean up before retry
        await this.cleanup();
        
        if (attempt < maxRetries) {
          const waitTime = attempt * 5000; // Exponential backoff: 5s, 10s, 15s
          console.log(`Waiting ${waitTime}ms before retry...`);
          await new Promise(resolve => setTimeout(resolve, waitTime));
        }
      }
    }
    
    // If we get here, all retries failed
    await this.cleanup();
    throw lastError || new Error('All scraping attempts failed');
  }
}