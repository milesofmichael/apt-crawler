import { ScraperService } from '../../src/services/scraper';
import { Apartment } from '../../src/types/apartment';
import { chromium } from 'playwright';
import { execSync } from 'child_process';

// Mock Playwright
const mockPage = {
  goto: jest.fn(),
  locator: jest.fn(),
  close: jest.fn(),
  waitForTimeout: jest.fn(),
  textContent: jest.fn(),
  evaluate: jest.fn()
};

const mockLocator: any = {
  count: jest.fn(),
  nth: jest.fn(),
  locator: jest.fn(),
  textContent: jest.fn(),
  getAttribute: jest.fn(),
  first: jest.fn(),
  scrollIntoViewIfNeeded: jest.fn(),
  all: jest.fn(),
  click: jest.fn()
};

// Set up the first method to return itself after the object is defined
mockLocator.first.mockReturnValue(mockLocator);

const mockContext = {
  newPage: jest.fn(() => Promise.resolve(mockPage)),
  close: jest.fn()
};

const mockBrowser = {
  newContext: jest.fn(() => Promise.resolve(mockContext)),
  close: jest.fn()
};

// Mock child_process execSync
jest.mock('child_process', () => ({
  execSync: jest.fn()
}));

jest.mock('playwright', () => ({
  chromium: {
    launch: jest.fn(() => Promise.resolve(mockBrowser))
  }
}));

describe('ScraperService', () => {
  let scraperService: ScraperService;
  
  beforeEach(() => {
    jest.clearAllMocks();
    
    // Reset mock implementations
    mockPage.locator.mockReturnValue(mockLocator);
    mockPage.goto.mockResolvedValue(undefined);
    mockPage.waitForTimeout.mockResolvedValue(undefined);
    mockLocator.locator.mockReturnValue(mockLocator);
    mockLocator.nth.mockReturnValue(mockLocator);
    mockLocator.first.mockReturnValue(mockLocator);
    
    // Reset chromium.launch mock to default success
    (chromium.launch as jest.Mock).mockReset().mockResolvedValue(mockBrowser);
    (execSync as jest.Mock).mockReset();
    
    scraperService = new ScraperService();
  });

  describe('initialize', () => {
    it('should initialize browser successfully with enhanced production args', async () => {
      await scraperService.initialize();

      expect(chromium.launch).toHaveBeenCalledWith({
        headless: true,
        timeout: 30000,
        args: [
          '--no-sandbox',
          '--disable-dev-shm-usage',
          '--disable-gpu',
          '--disable-web-security',
          '--disable-features=VizDisplayCompositor',
          '--disable-background-timer-throttling',
          '--disable-backgrounding-occluded-windows',
          '--disable-renderer-backgrounding',
          '--single-process',
          '--no-zygote',
          '--disable-extensions',
          '--disable-default-apps',
          '--disable-background-networking',
          '--disable-sync',
          '--disable-translate',
          '--disable-ipc-flooding-protection'
        ]
      });
      expect(mockBrowser.newContext).toHaveBeenCalledWith({
        userAgent: expect.stringContaining('Mozilla/5.0'),
        viewport: { width: 1920, height: 1080 },
        locale: 'en-US',
        timezoneId: 'America/New_York',
        extraHTTPHeaders: expect.objectContaining({
          'Accept': expect.stringContaining('text/html'),
          'Accept-Language': 'en-US,en;q=0.5',
          'Connection': 'keep-alive'
        })
      });
    });

    it('should install browsers and retry if executable does not exist', async () => {
      // Mock first launch to fail with executable not found error
      const executableError = new Error("browserType.launch: Executable doesn't exist at /opt/render/.cache/ms-playwright/chromium_headless_shell-1181/chrome-linux/headless_shell");
      
      (chromium.launch as jest.Mock)
        .mockRejectedValueOnce(executableError)
        .mockResolvedValue(mockBrowser);

      await scraperService.initialize();

      // Should have attempted launch twice
      expect(chromium.launch).toHaveBeenCalledTimes(2);
      
      // Should have called execSync to install browsers
      expect(execSync).toHaveBeenCalledWith('npx playwright install chromium', { stdio: 'inherit' });
      
      // Should eventually succeed in creating context
      expect(mockBrowser.newContext).toHaveBeenCalledWith({
        userAgent: expect.stringContaining('Mozilla/5.0'),
        viewport: { width: 1920, height: 1080 },
        locale: 'en-US',
        timezoneId: 'America/New_York',
        extraHTTPHeaders: expect.objectContaining({
          'Accept': expect.stringContaining('text/html'),
          'Accept-Language': 'en-US,en;q=0.5',
          'Connection': 'keep-alive'
        })
      });
    });

    it('should fail if browser installation fails', async () => {
      const executableError = new Error("browserType.launch: Executable doesn't exist at /opt/render/.cache/ms-playwright/chromium_headless_shell-1181/chrome-linux/headless_shell");
      const installError = new Error('Network error during installation');

      (chromium.launch as jest.Mock).mockRejectedValue(executableError);
      (execSync as jest.Mock).mockImplementation(() => {
        throw installError;
      });

      await expect(scraperService.initialize()).rejects.toThrow('Could not initialize browser after installation attempt');
      
      expect(chromium.launch).toHaveBeenCalledTimes(1);
      expect(execSync).toHaveBeenCalledWith('npx playwright install chromium', { stdio: 'inherit' });
    });

    it('should fail if second browser launch fails after installation', async () => {
      const executableError = new Error("browserType.launch: Executable doesn't exist at /opt/render/.cache/ms-playwright/chromium_headless_shell-1181/chrome-linux/headless_shell");
      const secondLaunchError = new Error('Still cannot launch browser');

      (chromium.launch as jest.Mock)
        .mockRejectedValueOnce(executableError)
        .mockRejectedValueOnce(secondLaunchError);

      await expect(scraperService.initialize()).rejects.toThrow('Could not initialize browser after installation attempt');
      
      expect(chromium.launch).toHaveBeenCalledTimes(2);
      expect(execSync).toHaveBeenCalledWith('npx playwright install chromium', { stdio: 'inherit' });
    });

    it('should re-throw non-executable errors without attempting installation', async () => {
      const networkError = new Error('Network connection failed');
      
      (chromium.launch as jest.Mock).mockRejectedValue(networkError);

      await expect(scraperService.initialize()).rejects.toThrow('Network connection failed');
      
      expect(chromium.launch).toHaveBeenCalledTimes(1);
      expect(execSync).not.toHaveBeenCalled();
    });

    it('should handle error message variations for executable not found', async () => {
      // Test different error message formats that should trigger installation
      const variations = [
        "browserType.launch: Executable doesn't exist at /some/path",
        "Executable doesn't exist at /another/path",
        "Error: Executable doesn't exist"
      ];

      for (const errorMessage of variations) {
        jest.clearAllMocks();
        (execSync as jest.Mock).mockClear();
        
        const error = new Error(errorMessage);
        (chromium.launch as jest.Mock)
          .mockRejectedValueOnce(error)
          .mockResolvedValue(mockBrowser);

        const testScraper = new ScraperService();
        await testScraper.initialize();

        expect(execSync).toHaveBeenCalledWith('npx playwright install chromium', { stdio: 'inherit' });
        await testScraper.cleanup();
      }
    });

    it('should handle timeout errors during browser launch', async () => {
      const service = new ScraperService();
      (chromium.launch as jest.Mock)
        .mockRejectedValueOnce(new Error('Launch timeout exceeded'))
        .mockResolvedValueOnce(mockBrowser);

      await service.initialize();

      expect(chromium.launch).toHaveBeenCalledTimes(2);
      // Should retry with extended timeout
      expect(chromium.launch).toHaveBeenLastCalledWith(
        expect.objectContaining({
          timeout: 60000
        })
      );
    });

    it('should handle spawn errors during browser launch', async () => {
      const service = new ScraperService();
      (chromium.launch as jest.Mock)
        .mockRejectedValueOnce(new Error('Failed to launch browser process'))
        .mockResolvedValueOnce(mockBrowser);

      await service.initialize();

      expect(chromium.launch).toHaveBeenCalledTimes(2);
    });

    it('should perform cleanup of zombie processes in production', async () => {
      const originalEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'production';
      
      const service = new ScraperService();
      await service.initialize();

      // Should call process cleanup commands
      expect(execSync).toHaveBeenCalledWith('pkill -f chromium || true', { stdio: 'pipe' });
      expect(execSync).toHaveBeenCalledWith('pkill -f chrome || true', { stdio: 'pipe' });
      expect(execSync).toHaveBeenCalledWith('rm -rf /tmp/.org.chromium.* || true', { stdio: 'pipe' });
      expect(execSync).toHaveBeenCalledWith('rm -rf /tmp/playwright* || true', { stdio: 'pipe' });
      
      process.env.NODE_ENV = originalEnv;
    });

    it('should skip zombie process cleanup in non-production', async () => {
      const originalEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'development';
      
      const service = new ScraperService();
      await service.initialize();

      // Should not call process cleanup commands
      expect(execSync).not.toHaveBeenCalledWith('pkill -f chromium || true', { stdio: 'pipe' });
      
      process.env.NODE_ENV = originalEnv;
    });

    it('should handle cleanup errors gracefully', async () => {
      const originalEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'production';
      
      // Mock execSync to throw error during cleanup
      (execSync as jest.Mock).mockImplementationOnce(() => {
        throw new Error('Process cleanup failed');
      });
      
      const service = new ScraperService();
      
      // Should not throw error even if cleanup fails
      await expect(service.initialize()).resolves.not.toThrow();
      
      process.env.NODE_ENV = originalEnv;
    });
  });

  describe('navigation strategies', () => {
    beforeEach(async () => {
      await scraperService.initialize();
    });

    afterEach(async () => {
      await scraperService.cleanup();
    });

    it('should succeed with first navigation strategy (DOM loaded)', async () => {
      // Mock successful DOM loaded navigation
      mockPage.goto.mockResolvedValue(undefined);
      mockLocator.count.mockResolvedValue(0); // No cards to avoid complex setup

      const result = await scraperService.scrapeApartments();

      expect(mockPage.goto).toHaveBeenCalledWith('https://flatsatpcm.com/floorplans/', {
        waitUntil: 'domcontentloaded',
        timeout: 45000
      });
      expect(result).toEqual([]);
    });

    it('should fall back to second strategy when first fails', async () => {
      const domError = new Error('page.goto: Timeout 45000ms exceeded (domcontentloaded)');
      
      // First call fails, second succeeds
      mockPage.goto
        .mockRejectedValueOnce(domError)
        .mockResolvedValue(undefined);
      mockLocator.count.mockResolvedValue(0);

      const result = await scraperService.scrapeApartments();

      expect(mockPage.goto).toHaveBeenCalledTimes(2);
      expect(mockPage.goto).toHaveBeenNthCalledWith(1, 'https://flatsatpcm.com/floorplans/', {
        waitUntil: 'domcontentloaded',
        timeout: 45000
      });
      expect(mockPage.goto).toHaveBeenNthCalledWith(2, 'https://flatsatpcm.com/floorplans/', {
        waitUntil: 'load',
        timeout: 60000
      });
      expect(result).toEqual([]);
    });

    it('should try all three strategies before failing', async () => {
      const domError = new Error('page.goto: Timeout 45000ms exceeded (domcontentloaded)');
      const loadError = new Error('page.goto: Timeout 60000ms exceeded (load)');
      const networkError = new Error('page.goto: Timeout 30000ms exceeded (networkidle)');
      
      mockPage.goto
        .mockRejectedValueOnce(domError)
        .mockRejectedValueOnce(loadError)
        .mockRejectedValueOnce(networkError);

      await expect(scraperService.scrapeApartments()).rejects.toThrow('page.goto: Timeout 30000ms exceeded (networkidle)');

      expect(mockPage.goto).toHaveBeenCalledTimes(3);
      expect(mockPage.goto).toHaveBeenNthCalledWith(1, 'https://flatsatpcm.com/floorplans/', {
        waitUntil: 'domcontentloaded',
        timeout: 45000
      });
      expect(mockPage.goto).toHaveBeenNthCalledWith(2, 'https://flatsatpcm.com/floorplans/', {
        waitUntil: 'load',
        timeout: 60000
      });
      expect(mockPage.goto).toHaveBeenNthCalledWith(3, 'https://flatsatpcm.com/floorplans/', {
        waitUntil: 'networkidle',
        timeout: 30000
      });
    });

    it('should succeed with network idle strategy after first two fail', async () => {
      const domError = new Error('page.goto: Timeout 45000ms exceeded (domcontentloaded)');
      const loadError = new Error('page.goto: Timeout 60000ms exceeded (load)');
      
      mockPage.goto
        .mockRejectedValueOnce(domError)
        .mockRejectedValueOnce(loadError)
        .mockResolvedValue(undefined); // Third attempt succeeds
      mockLocator.count.mockResolvedValue(0);

      const result = await scraperService.scrapeApartments();

      expect(mockPage.goto).toHaveBeenCalledTimes(3);
      expect(mockPage.goto).toHaveBeenNthCalledWith(3, 'https://flatsatpcm.com/floorplans/', {
        waitUntil: 'networkidle',
        timeout: 30000
      });
      expect(result).toEqual([]);
    });
  });

  describe('retry logic', () => {
    it('should succeed on first attempt', async () => {
      // Mock successful scraping
      mockLocator.count.mockResolvedValue(0);
      
      const result = await scraperService.run();

      expect(result).toEqual([]);
      expect(chromium.launch).toHaveBeenCalledTimes(1);
    });

    it('should retry after initialization failure', async () => {
      const browserError = new Error('Browser launch failed');
      
      // First attempt fails during initialization, second succeeds
      (chromium.launch as jest.Mock)
        .mockRejectedValueOnce(browserError)
        .mockResolvedValue(mockBrowser);
      mockLocator.count.mockResolvedValue(0);

      // Mock setTimeout to avoid actual delays in tests
      const originalSetTimeout = global.setTimeout;
      global.setTimeout = jest.fn((callback) => {
        callback();
        return 123 as any;
      }) as any;

      const result = await scraperService.run();

      expect(result).toEqual([]);
      expect(chromium.launch).toHaveBeenCalledTimes(2);
      
      // Restore setTimeout
      global.setTimeout = originalSetTimeout;
    });

    it('should retry after navigation failure', async () => {
      const navError = new Error('page.goto: Timeout 30000ms exceeded');
      
      // First attempt fails during navigation, second succeeds
      mockPage.goto
        .mockRejectedValueOnce(navError)
        .mockRejectedValueOnce(navError)
        .mockRejectedValueOnce(navError) // All strategies fail on first attempt
        .mockResolvedValue(undefined); // Second attempt succeeds
      mockLocator.count.mockResolvedValue(0);

      // Mock setTimeout to avoid actual delays
      const originalSetTimeout = global.setTimeout;
      global.setTimeout = jest.fn((callback) => {
        callback();
        return 123 as any;
      }) as any;

      const result = await scraperService.run();

      expect(result).toEqual([]);
      expect(mockPage.goto).toHaveBeenCalledTimes(4); // 3 failed + 1 success
      
      global.setTimeout = originalSetTimeout;
    });

    it('should fail after 3 attempts', async () => {
      const persistentError = new Error('Persistent network failure');
      
      // All attempts fail
      mockPage.goto.mockRejectedValue(persistentError);

      // Mock setTimeout to avoid actual delays
      const originalSetTimeout = global.setTimeout;
      global.setTimeout = jest.fn((callback) => {
        callback();
        return 123 as any;
      }) as any;

      await expect(scraperService.run()).rejects.toThrow('Persistent network failure');

      expect(chromium.launch).toHaveBeenCalledTimes(3);
      expect(mockPage.goto).toHaveBeenCalledTimes(9); // 3 attempts × 3 strategies each
      
      global.setTimeout = originalSetTimeout;
    });

    it('should use exponential backoff between retries', async () => {
      const error = new Error('Network failure');
      mockPage.goto.mockRejectedValue(error);

      // Mock setTimeout to capture delay times
      const setTimeoutSpy = jest.fn((callback) => {
        callback();
        return 123 as any;
      });
      const originalSetTimeout = global.setTimeout;
      global.setTimeout = setTimeoutSpy as any;

      await expect(scraperService.run()).rejects.toThrow('Network failure');

      // Should have been called with 5000ms and 10000ms delays
      expect(setTimeoutSpy).toHaveBeenCalledTimes(2);
      expect(setTimeoutSpy).toHaveBeenNthCalledWith(1, expect.any(Function), 5000);
      expect(setTimeoutSpy).toHaveBeenNthCalledWith(2, expect.any(Function), 10000);
      
      global.setTimeout = originalSetTimeout;
    });

    it('should clean up browser resources between retries', async () => {
      const error = new Error('Scraping failure');
      mockPage.goto.mockRejectedValue(error);

      // Mock setTimeout to avoid delays
      const originalSetTimeout = global.setTimeout;
      global.setTimeout = jest.fn((callback) => {
        callback();
        return 123 as any;
      }) as any;

      await expect(scraperService.run()).rejects.toThrow('Scraping failure');

      // Should have called cleanup multiple times (once per retry + final cleanup)
      expect(mockContext.close).toHaveBeenCalledTimes(3); // 3 retries (final cleanup handled by run method)
      expect(mockBrowser.close).toHaveBeenCalledTimes(3);
      
      global.setTimeout = originalSetTimeout;
    });
  });

  describe('cleanup', () => {
    it('should cleanup browser resources', async () => {
      await scraperService.initialize();
      await scraperService.cleanup();

      expect(mockContext.close).toHaveBeenCalled();
      expect(mockBrowser.close).toHaveBeenCalled();
    });

    it('should handle cleanup when browser not initialized', async () => {
      await expect(scraperService.cleanup()).resolves.not.toThrow();
    });

    it('should handle cleanup errors gracefully', async () => {
      await scraperService.initialize();
      
      // Mock context.close to throw error
      mockContext.close.mockRejectedValueOnce(new Error('Context cleanup failed'));
      
      // Should not throw error even if cleanup fails
      await expect(scraperService.cleanup()).resolves.not.toThrow();
    });

    it('should call garbage collection when available', async () => {
      await scraperService.initialize();
      
      // Mock global.gc
      const mockGc = jest.fn();
      (global as any).gc = mockGc;
      
      await scraperService.cleanup();
      
      expect(mockGc).toHaveBeenCalled();
      
      // Clean up
      delete (global as any).gc;
    });
  });

  describe('scrapeApartments', () => {
    beforeEach(async () => {
      await scraperService.initialize();
    });

    afterEach(async () => {
      await scraperService.cleanup();
    });

    it('should throw error if browser not initialized', async () => {
      const uninitializedScraper = new ScraperService();
      
      await expect(uninitializedScraper.scrapeApartments())
        .rejects.toThrow('Browser not initialized. Call initialize() first.');
    });

    it('should scrape apartments successfully', async () => {
      // Mock floorplan cards on main page
      mockLocator.count.mockResolvedValue(2);
      
      // Mock card 1 - 1BR available
      const mockCard1 = { ...mockLocator };
      mockCard1.locator.mockImplementation((selector: string) => {
        if (selector === '.jd-fp-card-header h3') {
          return { textContent: jest.fn().mockResolvedValue('1 Bedroom Deluxe') };
        }
        if (selector === '.jd-fp-card-footer .jd-fp-card-available') {
          return { textContent: jest.fn().mockResolvedValue('3 Available') };
        }
        if (selector === 'a') {
          return { 
            first: jest.fn().mockReturnValue({
              getAttribute: jest.fn().mockResolvedValue('/floorplans/deluxe-1br/')
            })
          };
        }
        return mockLocator;
      });

      // Mock card 2 - Studio available
      const mockCard2 = { ...mockLocator };
      mockCard2.locator.mockImplementation((selector: string) => {
        if (selector === '.jd-fp-card-header h3') {
          return { textContent: jest.fn().mockResolvedValue('Studio Apartment') };
        }
        if (selector === '.jd-fp-card-footer .jd-fp-card-available') {
          return { textContent: jest.fn().mockResolvedValue('2 Available') };
        }
        if (selector === 'a') {
          return { 
            first: jest.fn().mockReturnValue({
              getAttribute: jest.fn().mockResolvedValue('/floorplans/studio/')
            })
          };
        }
        return mockLocator;
      });

      mockLocator.nth.mockImplementation((index: number) => {
        return index === 0 ? mockCard1 : mockCard2;
      });

      // Mock detail page scraping
      mockPage.goto.mockResolvedValue(undefined);
      
      // Mock unit cards on detail page
      const mockUnitCard = { ...mockLocator };
      mockUnitCard.locator.mockImplementation((selector: string) => {
        if (selector === '.jd-fp-card-info__title--large') {
          return { textContent: jest.fn().mockResolvedValue('WEST-641') };
        }
        if (selector === '.jd-fp-card-info__text--brand') {
          return { textContent: jest.fn().mockResolvedValue('Available Sep 28') };
        }
        if (selector === '.jd-fp-strong-text') {
          return { textContent: jest.fn().mockResolvedValue('$1,991') };
        }
        return mockLocator;
      });

      // First call returns floorplan cards, subsequent calls return unit cards
      let callCount = 0;
      mockPage.locator.mockImplementation((selector: string) => {
        callCount++;
        if (selector === '.jd-fp-card') {
          return mockLocator; // Return main floorplan cards
        }
        if (selector === '.jd-fp-card-info') {
          // Return unit cards with count 1
          return {
            ...mockLocator,
            count: jest.fn().mockResolvedValue(1),
            nth: jest.fn().mockReturnValue(mockUnitCard)
          };
        }
        return mockLocator;
      });

      const result = await scraperService.scrapeApartments();

      expect(mockPage.goto).toHaveBeenCalledWith('https://flatsatpcm.com/floorplans/', { 
        waitUntil: 'domcontentloaded',
        timeout: 45000
      });
      expect(result).toBeInstanceOf(Array);
      expect(mockPage.close).toHaveBeenCalled();
    });

    it('should skip floorplans with more than 1 bedroom', async () => {
      mockLocator.count.mockResolvedValue(1);
      
      const mockCard = { ...mockLocator };
      mockCard.locator.mockImplementation((selector: string) => {
        if (selector === '.jd-fp-card-header h3') {
          return { textContent: jest.fn().mockResolvedValue('2 Bedroom Luxury') };
        }
        return mockLocator;
      });
      
      mockLocator.nth.mockReturnValue(mockCard);

      const result = await scraperService.scrapeApartments();

      expect(result).toHaveLength(0);
    });

    it('should skip floorplans with no available units', async () => {
      mockLocator.count.mockResolvedValue(1);
      
      const mockCard = { ...mockLocator };
      mockCard.locator.mockImplementation((selector: string) => {
        if (selector === '.jd-fp-card-header h3') {
          return { textContent: jest.fn().mockResolvedValue('1 Bedroom') };
        }
        if (selector === '.jd-fp-card-footer .jd-fp-card-available') {
          return { textContent: jest.fn().mockResolvedValue('Waitlist Only') };
        }
        return mockLocator;
      });
      
      mockLocator.nth.mockReturnValue(mockCard);

      const result = await scraperService.scrapeApartments();

      expect(result).toHaveLength(0);
    });
  });

  describe('run', () => {
    it('should run complete scraping workflow', async () => {
      // Mock successful scraping
      mockLocator.count.mockResolvedValue(0); // No cards to avoid complex mocking
      
      const result = await scraperService.run();

      expect(result).toBeInstanceOf(Array);
      expect(result).toHaveLength(0);
    });

    it('should cleanup even if scraping fails', async () => {
      // Mock error during scraping
      mockPage.goto.mockRejectedValue(new Error('Network error'));
      mockLocator.count.mockResolvedValue(1);
      mockLocator.nth.mockReturnValue(mockLocator);

      await expect(scraperService.run()).rejects.toThrow();
      
      // Verify cleanup was called
      expect(mockContext.close).toHaveBeenCalled();
      expect(mockBrowser.close).toHaveBeenCalled();
    });
  });

  describe('timeout handling', () => {
    beforeEach(async () => {
      await scraperService.initialize();
    });

    afterEach(async () => {
      await scraperService.cleanup();
    });

    it('should handle timeout when extracting card title', async () => {
      // Mock card with timeout on title extraction
      const mockCard = { ...mockLocator };
      const mockTitleLocator = { ...mockLocator };
      
      mockTitleLocator.textContent.mockRejectedValue(new Error('locator.textContent: Timeout 5000ms exceeded'));
      mockCard.locator.mockReturnValue(mockTitleLocator);
      mockCard.textContent.mockResolvedValue('Some card text');
      mockCard.scrollIntoViewIfNeeded.mockResolvedValue(undefined);
      
      mockLocator.count.mockResolvedValue(1);
      mockLocator.nth.mockReturnValue(mockCard);

      const result = await scraperService.scrapeApartments();

      expect(result).toHaveLength(0);
      expect(mockTitleLocator.textContent).toHaveBeenCalledWith({ timeout: 5000 });
    });

    it('should handle timeout when extracting card text content', async () => {
      // Mock card with timeout on text content extraction
      const mockCard = { ...mockLocator };
      const mockTitleLocator = { ...mockLocator };
      
      mockTitleLocator.textContent.mockResolvedValue('Studio Apartment');
      mockCard.locator.mockReturnValue(mockTitleLocator);
      mockCard.textContent.mockRejectedValue(new Error('locator.textContent: Timeout 5000ms exceeded'));
      mockCard.scrollIntoViewIfNeeded.mockResolvedValue(undefined);
      
      mockLocator.count.mockResolvedValue(1);
      mockLocator.nth.mockReturnValue(mockCard);

      const result = await scraperService.scrapeApartments();

      expect(result).toHaveLength(0);
      expect(mockCard.textContent).toHaveBeenCalledWith({ timeout: 5000 });
    });

    it('should handle errors when counting availability buttons', async () => {
      // Mock the private method to test button count error handling  
      const service = scraperService as any;
      const mockButtonLocator = { ...mockLocator };
      
      mockButtonLocator.count.mockRejectedValue(new Error('Element not found'));
      mockPage.locator.mockReturnValue(mockButtonLocator);
      mockPage.goto.mockResolvedValue(undefined);
      mockPage.waitForTimeout.mockResolvedValue(undefined);

      const result = await service.scrapeFloorplanDetails(
        mockPage, 
        'https://example.com/floorplan', 
        'Test Floorplan', 
        1,
        new Set<string>()
      );

      expect(result).toHaveLength(0);
      expect(mockButtonLocator.count).toHaveBeenCalled();
    });

    it('should handle errors when counting containers', async () => {
      // Mock the private method to test container count error handling
      const service = scraperService as any;
      const mockButtonLocator = { ...mockLocator };
      const mockContainerLocator = { ...mockLocator };
      
      // Mock button exists but container count fails
      mockButtonLocator.count.mockResolvedValue(0);
      mockContainerLocator.count.mockRejectedValue(new Error('Element not accessible'));
      
      mockPage.goto.mockResolvedValue(undefined);
      mockPage.waitForTimeout.mockResolvedValue(undefined);
      mockPage.locator.mockImplementation((selector: string) => {
        if (selector.includes('availability')) return mockButtonLocator;
        return mockContainerLocator;
      });

      const result = await service.scrapeFloorplanDetails(
        mockPage, 
        'https://example.com/floorplan', 
        'Test Floorplan', 
        1,
        new Set<string>()
      );

      expect(result).toHaveLength(0);
      expect(mockContainerLocator.count).toHaveBeenCalled();
    });

    it('should handle timeout when extracting full page text', async () => {
      // Mock the private method to test full page text timeout
      const service = scraperService as any;
      const mockButtonLocator = { ...mockLocator };
      const mockContainerLocator = { ...mockLocator };
      
      // Mock no button, no containers, page text times out
      mockButtonLocator.count.mockResolvedValue(0);
      mockContainerLocator.count.mockResolvedValue(0);
      mockPage.goto.mockResolvedValue(undefined);
      mockPage.waitForTimeout.mockResolvedValue(undefined);
      mockPage.textContent.mockRejectedValue(new Error('page.textContent: Timeout 10000ms exceeded'));
      
      mockPage.locator.mockImplementation((selector: string) => {
        if (selector.includes('availability')) return mockButtonLocator;
        return mockContainerLocator;
      });

      const result = await service.scrapeFloorplanDetails(
        mockPage, 
        'https://example.com/floorplan', 
        'Test Floorplan', 
        1,
        new Set<string>()
      );

      expect(result).toHaveLength(0);
      expect(mockPage.textContent).toHaveBeenCalledWith('body', { timeout: 10000 });
    });

    it('should continue processing other cards when one times out', async () => {
      // Mock multiple cards where first times out, second succeeds
      const mockTimeoutCard = { ...mockLocator };
      const mockSuccessCard = { ...mockLocator };
      
      const mockTimeoutTitle = { ...mockLocator };
      const mockSuccessTitle = { ...mockLocator };
      
      mockTimeoutTitle.textContent.mockRejectedValue(new Error('Timeout'));
      mockSuccessTitle.textContent.mockResolvedValue('Studio - Available');
      
      mockTimeoutCard.locator.mockReturnValue(mockTimeoutTitle);
      mockTimeoutCard.scrollIntoViewIfNeeded.mockResolvedValue(undefined);
      mockSuccessCard.locator.mockReturnValue(mockSuccessTitle);
      mockSuccessCard.textContent.mockResolvedValue('Starting at $1500');
      mockSuccessCard.scrollIntoViewIfNeeded.mockResolvedValue(undefined);
      
      mockLocator.count.mockResolvedValue(2);
      mockLocator.nth.mockImplementation((index: number) => {
        return index === 0 ? mockTimeoutCard : mockSuccessCard;
      });

      const result = await scraperService.scrapeApartments();

      // Should process second card successfully despite first timing out
      expect(result).toHaveLength(0); // No units since we didn't mock full floorplan details
      expect(mockTimeoutTitle.textContent).toHaveBeenCalledWith({ timeout: 5000 });
      expect(mockSuccessTitle.textContent).toHaveBeenCalledWith({ timeout: 5000 });
    });
  });

  describe('two-phase scraping', () => {
    beforeEach(async () => {
      await scraperService.initialize();
    });

    afterEach(async () => {
      await scraperService.cleanup();
    });

    it('should collect qualifying floorplans first, then process them separately', async () => {
      // Create separate mock objects to avoid interference
      const mockCard1 = {
        ...mockLocator,
        locator: jest.fn(),
        textContent: jest.fn().mockResolvedValue('Starting at $1500'),
        scrollIntoViewIfNeeded: jest.fn().mockResolvedValue(undefined)
      };
      
      const mockCard2 = {
        ...mockLocator,
        locator: jest.fn(),
        textContent: jest.fn().mockResolvedValue('Starting at $2000'),
        scrollIntoViewIfNeeded: jest.fn().mockResolvedValue(undefined)
      };
      
      const mockTitle1 = {
        textContent: jest.fn().mockResolvedValue('The Dellwood')
      };
      
      const mockTitle2 = {
        textContent: jest.fn().mockResolvedValue('The Gateway')
      };
      
      mockCard1.locator.mockImplementation((selector: string) => {
        if (selector.includes('h1, h2, h3') || selector.includes('title')) return mockTitle1;
        return mockLocator;
      });
      
      mockCard2.locator.mockImplementation((selector: string) => {
        if (selector.includes('h1, h2, h3') || selector.includes('title')) return mockTitle2;
        return mockLocator;
      });
      
      mockLocator.count.mockResolvedValue(2);
      mockLocator.nth.mockImplementation((index: number) => {
        return index === 0 ? mockCard1 : mockCard2;
      });

      // Mock the scrapeFloorplanDetails method to return empty results
      const scraperServiceSpy = jest.spyOn(scraperService as any, 'scrapeFloorplanDetails')
        .mockResolvedValue([]);

      const result = await scraperService.scrapeApartments();

      // Should have called scrapeFloorplanDetails for both qualifying floorplans
      expect(scraperServiceSpy).toHaveBeenCalledTimes(2);
      expect(scraperServiceSpy).toHaveBeenCalledWith(
        mockPage, 
        'https://flatsatpcm.com/floorplans/the-dellwood/', 
        'The Dellwood', 
        0,
        expect.any(Set)
      );
      expect(scraperServiceSpy).toHaveBeenCalledWith(
        mockPage, 
        'https://flatsatpcm.com/floorplans/the-gateway/', 
        'The Gateway', 
        0,
        expect.any(Set)
      );

      expect(result).toHaveLength(0);
      
      scraperServiceSpy.mockRestore();
    });

    it('should handle errors in individual floorplan processing without affecting others', async () => {
      // Mock two qualifying floorplans
      const mockCard1 = { ...mockLocator };
      const mockCard2 = { ...mockLocator };
      
      const mockTitle1 = { ...mockLocator };
      const mockTitle2 = { ...mockLocator };
      
      mockTitle1.textContent.mockResolvedValue('The Dellwood');
      mockTitle2.textContent.mockResolvedValue('The Gateway');
      
      mockCard1.locator.mockImplementation((selector: string) => {
        if (selector.includes('h1, h2, h3') || selector.includes('title')) return mockTitle1;
        return mockLocator;
      });
      mockCard1.textContent.mockResolvedValue('Starting at $1500');
      mockCard1.scrollIntoViewIfNeeded.mockResolvedValue(undefined);
      
      mockCard2.locator.mockImplementation((selector: string) => {
        if (selector.includes('h1, h2, h3') || selector.includes('title')) return mockTitle2;
        return mockLocator;
      });
      mockCard2.textContent.mockResolvedValue('Starting at $2000');
      mockCard2.scrollIntoViewIfNeeded.mockResolvedValue(undefined);
      
      mockLocator.count.mockResolvedValue(2);
      mockLocator.nth.mockImplementation((index: number) => {
        return index === 0 ? mockCard1 : mockCard2;
      });

      // Mock scrapeFloorplanDetails to fail for first floorplan, succeed for second
      const scraperServiceSpy = jest.spyOn(scraperService as any, 'scrapeFloorplanDetails')
        .mockImplementation((page, url, title, bedroomCount, globalSeenUnits) => {
          if (title === 'The Dellwood') {
            throw new Error('Network error');
          }
          return Promise.resolve([]);
        });

      const result = await scraperService.scrapeApartments();

      // Should have attempted both floorplans
      expect(scraperServiceSpy).toHaveBeenCalledTimes(2);
      expect(result).toHaveLength(0);
      
      scraperServiceSpy.mockRestore();
    });

    it('should properly identify and collect qualifying floorplans based on pricing text', async () => {
      // Create separate mock objects
      const mockCard1 = {
        ...mockLocator,
        locator: jest.fn(),
        textContent: jest.fn().mockResolvedValue('Waitlist Only'),
        scrollIntoViewIfNeeded: jest.fn().mockResolvedValue(undefined)
      };
      
      const mockCard2 = {
        ...mockLocator,
        locator: jest.fn(),
        textContent: jest.fn().mockResolvedValue('Starting at $1500'),
        scrollIntoViewIfNeeded: jest.fn().mockResolvedValue(undefined)
      };
      
      const mockCard3 = {
        ...mockLocator,
        locator: jest.fn(),
        textContent: jest.fn().mockResolvedValue('Starting at $2000'),
        scrollIntoViewIfNeeded: jest.fn().mockResolvedValue(undefined)
      };
      
      const mockTitle1 = {
        textContent: jest.fn().mockResolvedValue('The Expensive')
      };
      
      const mockTitle2 = {
        textContent: jest.fn().mockResolvedValue('The Available')
      };
      
      const mockTitle3 = {
        textContent: jest.fn().mockResolvedValue('The Two Bedroom')
      };
      
      mockCard1.locator.mockImplementation((selector: string) => {
        if (selector.includes('h1, h2, h3') || selector.includes('title')) return mockTitle1;
        return mockLocator;
      });
      
      mockCard2.locator.mockImplementation((selector: string) => {
        if (selector.includes('h1, h2, h3') || selector.includes('title')) return mockTitle2;
        return mockLocator;
      });
      
      mockCard3.locator.mockImplementation((selector: string) => {
        if (selector.includes('h1, h2, h3') || selector.includes('title')) return mockTitle3;
        return mockLocator;
      });
      
      mockLocator.count.mockResolvedValue(3);
      mockLocator.nth.mockImplementation((index: number) => {
        if (index === 0) return mockCard1;
        if (index === 1) return mockCard2;
        return mockCard3;
      });

      // Mock the scrapeFloorplanDetails method
      const scraperServiceSpy = jest.spyOn(scraperService as any, 'scrapeFloorplanDetails')
        .mockResolvedValue([]);

      const result = await scraperService.scrapeApartments();

      // Should only process "The Available" (has pricing and is studio/1BR)
      expect(scraperServiceSpy).toHaveBeenCalledTimes(1);
      expect(scraperServiceSpy).toHaveBeenCalledWith(
        mockPage, 
        'https://flatsatpcm.com/floorplans/the-available/', 
        'The Available', 
        0,
        expect.any(Set)
      );
      
      scraperServiceSpy.mockRestore();
    });
  });

  describe('private method testing', () => {
    describe('extractBedroomCount', () => {
      it('should extract bedroom count correctly', () => {
        const service = scraperService as any;
        
        expect(service.extractBedroomCount('Studio Apartment')).toBe(0);
        expect(service.extractBedroomCount('1 Bedroom Deluxe')).toBe(1);
        expect(service.extractBedroomCount('One Bedroom')).toBe(1);
        expect(service.extractBedroomCount('2 Bed 2 Bath')).toBe(2);
        expect(service.extractBedroomCount('3 bedroom luxury')).toBe(3);
        expect(service.extractBedroomCount('Unknown Layout')).toBe(0);
      });
    });

    describe('parseRent', () => {
      it('should parse rent correctly', () => {
        const service = scraperService as any;
        
        expect(service.parseRent('$1,991')).toBe(1991);
        expect(service.parseRent('$2,500')).toBe(2500);
        expect(service.parseRent('1750')).toBe(1750);
        expect(service.parseRent('$995')).toBe(995);
        expect(service.parseRent('Invalid')).toBe(0);
      });
    });

    describe('parseAvailabilityDate', () => {
      it('should parse "Available Sep 28" format', () => {
        const service = scraperService as any;
        
        const result = service.parseAvailabilityDate('Available Sep 28');
        expect(result).toBeInstanceOf(Date);
        expect(result.getMonth()).toBe(8); // September is month 8 (0-indexed)
        expect(result.getDate()).toBe(28);
      });

      it('should parse "9/28" format', () => {
        const service = scraperService as any;
        
        const result = service.parseAvailabilityDate('9/28');
        expect(result).toBeInstanceOf(Date);
        expect(result.getMonth()).toBe(8); // September is month 8 (0-indexed)
        expect(result.getDate()).toBe(28);
      });

      it('should handle invalid date strings', () => {
        const service = scraperService as any;
        
        expect(service.parseAvailabilityDate('Invalid Date')).toBeNull();
        expect(service.parseAvailabilityDate('')).toBeNull();
      });

      it('should handle direct date strings', () => {
        const service = scraperService as any;
        
        const result = service.parseAvailabilityDate('2024-09-28');
        expect(result).toBeInstanceOf(Date);
        expect(result.getFullYear()).toBe(2024);
        expect(result.getMonth()).toBe(8);
        // Date might be off by timezone, so check that it's close
        expect([27, 28]).toContain(result.getDate());
      });
    });

    describe('processScrapedUnits', () => {
      it('should process scraped units correctly', () => {
        const service = scraperService as any;
        
        const scrapedUnits = [
          {
            unitNumber: 'WEST-641',
            rent: '$1,991',
            availabilityDate: 'Available Sep 28',
            floorplanName: 'The Dellwood',
            floorplanUrl: 'https://example.com/dellwood',
            bedroomCount: 1
          }
        ];

        const result = service.processScrapedUnits(scrapedUnits);

        expect(result).toHaveLength(1);
        expect(result[0]).toMatchObject({
          unitNumber: 'WEST-641',
          rent: 1991,
          floorplanName: 'The Dellwood',
          bedroomCount: 1
        });
        expect(result[0].availabilityDate).toBeInstanceOf(Date);
      });
    });

    describe('deduplication in scrapeFloorplanDetails', () => {
      it('should deduplicate identical units found multiple times', async () => {
        await scraperService.initialize();
        
        // Mock page with duplicate unit data
        const mockPageText = `
          #WEST-641 Starting at $1,993 Available Sep 28
          #WEST-641 Starting at $1,993 Available Sep 28
          #WEST-641 Starting at $1,993 Available Sep 28
        `;
        
        mockPage.goto.mockResolvedValue(undefined);
        mockPage.waitForTimeout.mockResolvedValue(undefined);
        
        // Mock the locator chain for finding containers
        const mockButtonLocator = {
          count: jest.fn().mockResolvedValue(0),
          first: jest.fn().mockReturnValue({
            count: jest.fn().mockResolvedValue(0)
          })
        };
        
        const mockContainerLocator = {
          count: jest.fn().mockResolvedValue(1),
          nth: jest.fn().mockReturnValue({
            textContent: jest.fn().mockResolvedValue(mockPageText)
          })
        };
        
        mockPage.locator.mockImplementation((selector: string) => {
          if (selector.includes('availability') || selector.includes('Availability')) return mockButtonLocator;
          if (selector.includes('[class*="unit"]') || selector.includes('.unit-details')) return mockContainerLocator;
          return mockContainerLocator;
        });
        
        // Call the private method to test deduplication
        const service = scraperService as any;
        const result = await service.scrapeFloorplanDetails(
          mockPage, 
          'https://example.com/test', 
          'Test Floorplan', 
          1,
          new Set<string>()
        );
        
        // Should only return one unit despite finding it 3 times
        expect(result).toHaveLength(1);
        expect(result[0]).toEqual({
          unitNumber: 'WEST-641',
          rent: '$1,993',
          availabilityDate: 'Sep 28',
          floorplanName: 'Test Floorplan',
          floorplanUrl: 'https://example.com/test',
          bedroomCount: 1
        });
      });

      it('should not deduplicate different units with same number but different details', async () => {
        await scraperService.initialize();
        
        // Mock page with same unit number but different rent/dates
        const mockPageText = `
          #WEST-641 Starting at $1,993 Available Sep 28
          #WEST-641 Starting at $2,100 Available Oct 15
        `;
        
        mockPage.goto.mockResolvedValue(undefined);
        mockPage.waitForTimeout.mockResolvedValue(undefined);
        
        // Mock the locator chain
        const mockButtonLocator = {
          count: jest.fn().mockResolvedValue(0),
          first: jest.fn().mockReturnValue({
            count: jest.fn().mockResolvedValue(0)
          })
        };
        
        const mockContainerLocator = {
          count: jest.fn().mockResolvedValue(1),
          nth: jest.fn().mockReturnValue({
            textContent: jest.fn().mockResolvedValue(mockPageText)
          })
        };
        
        mockPage.locator.mockImplementation((selector: string) => {
          if (selector.includes('availability') || selector.includes('Availability')) return mockButtonLocator;
          if (selector.includes('[class*="unit"]') || selector.includes('.unit-details')) return mockContainerLocator;
          return mockContainerLocator;
        });
        
        const service = scraperService as any;
        const result = await service.scrapeFloorplanDetails(
          mockPage, 
          'https://example.com/test', 
          'Test Floorplan', 
          1,
          new Set<string>()
        );
        
        // Should return both units since they have different rent/dates
        expect(result).toHaveLength(2);
        expect(result[0].rent).toBe('$1,993');
        expect(result[1].rent).toBe('$2,100');
      });
    });
  });
});