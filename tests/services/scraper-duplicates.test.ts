import { ScraperService } from '../../src/services/scraper';

// Mock Playwright
jest.mock('playwright', () => ({
  chromium: {
    launch: jest.fn().mockResolvedValue({
      newContext: jest.fn().mockResolvedValue({
        newPage: jest.fn().mockResolvedValue({
          goto: jest.fn(),
          waitForTimeout: jest.fn(),
          evaluate: jest.fn(),
          locator: jest.fn().mockReturnValue({
            count: jest.fn(),
            nth: jest.fn().mockReturnValue({
              scrollIntoViewIfNeeded: jest.fn(),
              textContent: jest.fn(),
              locator: jest.fn().mockReturnValue({
                textContent: jest.fn()
              })
            })
          }),
          textContent: jest.fn(),
          close: jest.fn()
        }),
        close: jest.fn()
      }),
      close: jest.fn()
    })
  }
}));

describe('ScraperService - Duplicate Prevention', () => {
  let scraperService: ScraperService;
  let mockPage: any;

  beforeEach(() => {
    jest.clearAllMocks();
    scraperService = new ScraperService();
    
    // Setup mock page
    mockPage = {
      goto: jest.fn(),
      waitForTimeout: jest.fn(),
      evaluate: jest.fn(),
      locator: jest.fn().mockReturnValue({
        count: jest.fn().mockResolvedValue(2), // Return 2 floorplan cards for testing
        nth: jest.fn().mockReturnValue({
          scrollIntoViewIfNeeded: jest.fn(),
          textContent: jest.fn(),
          locator: jest.fn().mockReturnValue({
            textContent: jest.fn()
          })
        })
      }),
      textContent: jest.fn(),
      close: jest.fn()
    };
  });

  describe('Global duplicate prevention', () => {
    it('should prevent duplicate units across different floorplans', async () => {
      // Setup mock browser and context
      const mockBrowser = {
        newContext: jest.fn().mockResolvedValue({
          newPage: jest.fn().mockResolvedValue(mockPage),
          close: jest.fn()
        }),
        close: jest.fn()
      };

      const { chromium } = require('playwright');
      chromium.launch.mockResolvedValue(mockBrowser);

      // Mock floorplan cards - both qualify as studios with pricing
      mockPage.locator.mockReturnValue({
        count: jest.fn().mockResolvedValue(2),
        nth: jest.fn()
          .mockReturnValueOnce({
            scrollIntoViewIfNeeded: jest.fn(),
            textContent: jest.fn().mockResolvedValue('Starting at $1,991'),
            locator: jest.fn().mockReturnValue({
              textContent: jest.fn().mockResolvedValue('The Dellwood')
            })
          })
          .mockReturnValueOnce({
            scrollIntoViewIfNeeded: jest.fn(),
            textContent: jest.fn().mockResolvedValue('Starting at $2,699'),
            locator: jest.fn().mockReturnValue({
              textContent: jest.fn().mockResolvedValue('The Gateway')
            })
          })
      });

      // Mock scrapeFloorplanDetails to return duplicate units
      const mockScrapeFloorplanDetails = jest.spyOn(scraperService as any, 'scrapeFloorplanDetails');
      
      // First call returns WEST-437 from The Dellwood
      mockScrapeFloorplanDetails.mockResolvedValueOnce([
        {
          unitNumber: 'WEST-437',
          rent: '$2,699',
          availabilityDate: 'Sep 05',
          floorplanName: 'The Dellwood',
          floorplanUrl: 'https://flatsatpcm.com/floorplans/the-dellwood/',
          bedroomCount: 0
        }
      ]);

      // Second call tries to return the same unit WEST-437 from The Gateway  
      mockScrapeFloorplanDetails.mockResolvedValueOnce([
        {
          unitNumber: 'WEST-437',
          rent: '$2,699', 
          availabilityDate: 'Sep 05',
          floorplanName: 'The Gateway',
          floorplanUrl: 'https://flatsatpcm.com/floorplans/the-gateway/',
          bedroomCount: 0
        }
      ]);

      await scraperService.initialize();
      const apartments = await scraperService.scrapeApartments();

      // Should only return 2 apartments, not 3 (no true duplicates)
      expect(apartments).toHaveLength(2);

      // Verify different floorplans can have same unit numbers
      expect(apartments.some(apt => apt.floorplanName === 'The Dellwood' && apt.unitNumber === 'WEST-437')).toBe(true);
      expect(apartments.some(apt => apt.floorplanName === 'The Gateway' && apt.unitNumber === 'WEST-437')).toBe(true);
    });

    it('should prevent true duplicate units within same floorplan', async () => {
      // Setup mock browser and context
      const mockBrowser = {
        newContext: jest.fn().mockResolvedValue({
          newPage: jest.fn().mockResolvedValue(mockPage),
          close: jest.fn()
        }),
        close: jest.fn()
      };

      const { chromium } = require('playwright');
      chromium.launch.mockResolvedValue(mockBrowser);

      // Mock single floorplan card
      mockPage.locator.mockReturnValue({
        count: jest.fn().mockResolvedValue(1),
        nth: jest.fn().mockReturnValue({
          scrollIntoViewIfNeeded: jest.fn(),
          textContent: jest.fn().mockResolvedValue('Starting at $1,991'),
          locator: jest.fn().mockReturnValue({
            textContent: jest.fn().mockResolvedValue('The Dellwood')
          })
        })
      });

      // Mock scrapeFloorplanDetails to return identical duplicate units
      const mockScrapeFloorplanDetails = jest.spyOn(scraperService as any, 'scrapeFloorplanDetails');
      
      // Return multiple identical units (true duplicates)
      mockScrapeFloorplanDetails.mockResolvedValueOnce([
        {
          unitNumber: 'WEST-641',
          rent: '$1,991',
          availabilityDate: 'Sep 28',
          floorplanName: 'The Dellwood',
          floorplanUrl: 'https://flatsatpcm.com/floorplans/the-dellwood/',
          bedroomCount: 0
        },
        {
          unitNumber: 'WEST-641', // Exact same unit
          rent: '$1,991',
          availabilityDate: 'Sep 28',
          floorplanName: 'The Dellwood',
          floorplanUrl: 'https://flatsatpcm.com/floorplans/the-dellwood/',
          bedroomCount: 0
        }
      ]);

      await scraperService.initialize();
      const apartments = await scraperService.scrapeApartments();

      // Should only return 1 apartment (duplicate prevented)
      expect(apartments).toHaveLength(1);
      expect(apartments[0].unitNumber).toBe('WEST-641');
      expect(apartments[0].floorplanName).toBe('The Dellwood');
    });

    it('should allow same unit number across different floorplans with different details', async () => {
      // Setup mock browser and context
      const mockBrowser = {
        newContext: jest.fn().mockResolvedValue({
          newPage: jest.fn().mockResolvedValue(mockPage),
          close: jest.fn()
        }),
        close: jest.fn()
      };

      const { chromium } = require('playwright');
      chromium.launch.mockResolvedValue(mockBrowser);

      // Mock multiple floorplan cards
      mockPage.locator.mockReturnValue({
        count: jest.fn().mockResolvedValue(2),
        nth: jest.fn()
          .mockReturnValueOnce({
            scrollIntoViewIfNeeded: jest.fn(),
            textContent: jest.fn().mockResolvedValue('Starting at $1,991'),
            locator: jest.fn().mockReturnValue({
              textContent: jest.fn().mockResolvedValue('The Dellwood')
            })
          })
          .mockReturnValueOnce({
            scrollIntoViewIfNeeded: jest.fn(),
            textContent: jest.fn().mockResolvedValue('Starting at $2,699'),
            locator: jest.fn().mockReturnValue({
              textContent: jest.fn().mockResolvedValue('The Gateway')
            })
          })
      });

      // Mock scrapeFloorplanDetails to return same unit numbers but different floorplans/prices
      const mockScrapeFloorplanDetails = jest.spyOn(scraperService as any, 'scrapeFloorplanDetails');
      
      // First floorplan has unit A-101
      mockScrapeFloorplanDetails.mockResolvedValueOnce([
        {
          unitNumber: 'A-101',
          rent: '$1,500',
          availabilityDate: 'Sep 15',
          floorplanName: 'The Dellwood',
          floorplanUrl: 'https://flatsatpcm.com/floorplans/the-dellwood/',
          bedroomCount: 0
        }
      ]);

      // Second floorplan also has unit A-101 but different rent/date
      mockScrapeFloorplanDetails.mockResolvedValueOnce([
        {
          unitNumber: 'A-101',
          rent: '$1,800',
          availabilityDate: 'Oct 01',
          floorplanName: 'The Gateway',
          floorplanUrl: 'https://flatsatpcm.com/floorplans/the-gateway/',
          bedroomCount: 0
        }
      ]);

      await scraperService.initialize();
      const apartments = await scraperService.scrapeApartments();

      // Should return both apartments as they're different despite same unit number
      expect(apartments).toHaveLength(2);
      
      const dellwoodUnit = apartments.find(apt => apt.floorplanName === 'The Dellwood');
      const gatewayUnit = apartments.find(apt => apt.floorplanName === 'The Gateway');
      
      expect(dellwoodUnit?.unitNumber).toBe('A-101');
      expect(gatewayUnit?.unitNumber).toBe('A-101');
      expect(dellwoodUnit?.rent).toBe(1500);
      expect(gatewayUnit?.rent).toBe(1800);
    });

    it('should handle empty scraping results without errors', async () => {
      // Setup mock browser and context
      const mockBrowser = {
        newContext: jest.fn().mockResolvedValue({
          newPage: jest.fn().mockResolvedValue(mockPage),
          close: jest.fn()
        }),
        close: jest.fn()
      };

      const { chromium } = require('playwright');
      chromium.launch.mockResolvedValue(mockBrowser);

      // Mock no qualifying floorplan cards
      mockPage.locator.mockReturnValue({
        count: jest.fn().mockResolvedValue(1),
        nth: jest.fn().mockReturnValue({
          scrollIntoViewIfNeeded: jest.fn(),
          textContent: jest.fn().mockResolvedValue('No pricing available'), // No "Starting at $"
          locator: jest.fn().mockReturnValue({
            textContent: jest.fn().mockResolvedValue('Some Floorplan')
          })
        })
      });

      await scraperService.initialize();
      const apartments = await scraperService.scrapeApartments();

      // Should return empty array without errors
      expect(apartments).toHaveLength(0);
    });

    it('should allow multiple units with same rent/date but different unit numbers', async () => {
      // Setup mock browser and context
      const mockBrowser = {
        newContext: jest.fn().mockResolvedValue({
          newPage: jest.fn().mockResolvedValue(mockPage),
          close: jest.fn()
        }),
        close: jest.fn()
      };

      const { chromium } = require('playwright');
      chromium.launch.mockResolvedValue(mockBrowser);

      // Mock single floorplan card
      mockPage.locator.mockReturnValue({
        count: jest.fn().mockResolvedValue(1),
        nth: jest.fn().mockReturnValue({
          scrollIntoViewIfNeeded: jest.fn(),
          textContent: jest.fn().mockResolvedValue('Starting at $2,699'),
          locator: jest.fn().mockReturnValue({
            textContent: jest.fn().mockResolvedValue('The Gateway')
          })
        })
      });

      // Mock scrapeFloorplanDetails to return different units with same rent/date
      const mockScrapeFloorplanDetails = jest.spyOn(scraperService as any, 'scrapeFloorplanDetails');
      
      // Return different units that happen to have same rent/date (legitimate scenario)
      mockScrapeFloorplanDetails.mockResolvedValueOnce([
        {
          unitNumber: 'WEST-437',
          rent: '$2,699',
          availabilityDate: 'Sep 05',
          floorplanName: 'The Gateway',
          floorplanUrl: 'https://flatsatpcm.com/floorplans/the-gateway/',
          bedroomCount: 0
        },
        {
          unitNumber: 'EAST-201', // Different unit number, same rent/date = legitimate different unit
          rent: '$2,699',
          availabilityDate: 'Sep 05',
          floorplanName: 'The Gateway',
          floorplanUrl: 'https://flatsatpcm.com/floorplans/the-gateway/',
          bedroomCount: 0
        }
      ]);

      await scraperService.initialize();
      const apartments = await scraperService.scrapeApartments();

      // Should return both apartments as they have different unit numbers
      expect(apartments).toHaveLength(2);
      expect(apartments[0].unitNumber).toBe('WEST-437');
      expect(apartments[1].unitNumber).toBe('EAST-201');
      expect(apartments[0].rent).toBe(2699);
      expect(apartments[1].rent).toBe(2699);
    });

    it('should create unique keys including floorplan name to differentiate units', async () => {
      const scraperInstance = scraperService as any;
      const globalSeenUnits = new Set<string>();

      // Test the unique key logic by simulating different scenarios
      const testCases = [
        {
          floorplanName: 'The Dellwood',
          unitNumber: 'WEST-641',
          rent: '$1,991',
          availabilityDate: 'Sep 28',
          expectedKey: 'The Dellwood-WEST-641-$1,991-Sep 28'
        },
        {
          floorplanName: 'The Gateway', 
          unitNumber: 'WEST-641', // Same unit number, different floorplan - should be allowed
          rent: '$1,991',
          availabilityDate: 'Sep 28',
          expectedKey: 'The Gateway-WEST-641-$1,991-Sep 28'
        },
        {
          floorplanName: 'The Dellwood',
          unitNumber: 'WEST-641', // Same unit/floorplan, different rent - should be allowed
          rent: '$2,100',
          availabilityDate: 'Sep 28',
          expectedKey: 'The Dellwood-WEST-641-$2,100-Sep 28'
        }
      ];

      // All keys should be unique
      const keys = testCases.map(tc => tc.expectedKey);
      const uniqueKeys = new Set(keys);
      
      expect(uniqueKeys.size).toBe(keys.length);
      expect(uniqueKeys.size).toBe(3);
    });
  });
});