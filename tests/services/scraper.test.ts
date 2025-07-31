import { ScraperService } from '../../src/services/scraper';
import { Apartment } from '../../src/types/apartment';

// Mock Playwright
const mockPage = {
  goto: jest.fn(),
  locator: jest.fn(),
  close: jest.fn(),
  waitForTimeout: jest.fn(),
  textContent: jest.fn(),
  evaluate: jest.fn()
};

const mockLocator = {
  count: jest.fn(),
  nth: jest.fn(),
  locator: jest.fn(),
  textContent: jest.fn(),
  getAttribute: jest.fn(),
  first: jest.fn(),
  scrollIntoViewIfNeeded: jest.fn()
};

const mockContext = {
  newPage: jest.fn(() => Promise.resolve(mockPage)),
  close: jest.fn()
};

const mockBrowser = {
  newContext: jest.fn(() => Promise.resolve(mockContext)),
  close: jest.fn()
};

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
    mockLocator.locator.mockReturnValue(mockLocator);
    mockLocator.nth.mockReturnValue(mockLocator);
    mockLocator.first.mockReturnValue(mockLocator);
    
    scraperService = new ScraperService();
  });

  describe('initialize', () => {
    it('should initialize browser successfully', async () => {
      await scraperService.initialize();

      expect(mockBrowser.newContext).toHaveBeenCalledWith({
        userAgent: expect.stringContaining('Mozilla/5.0')
      });
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

      expect(mockPage.goto).toHaveBeenCalledWith('https://flatsatpcm.com/floorplans/', { waitUntil: 'networkidle' });
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

      const result = await service.scrapeFloorplanDetails(
        mockPage, 
        'https://example.com/floorplan', 
        'Test Floorplan', 
        1
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
      
      mockPage.locator.mockImplementation((selector: string) => {
        if (selector.includes('availability')) return mockButtonLocator;
        return mockContainerLocator;
      });

      const result = await service.scrapeFloorplanDetails(
        mockPage, 
        'https://example.com/floorplan', 
        'Test Floorplan', 
        1
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
      mockPage.textContent.mockRejectedValue(new Error('page.textContent: Timeout 10000ms exceeded'));
      
      mockPage.locator.mockImplementation((selector: string) => {
        if (selector.includes('availability')) return mockButtonLocator;
        return mockContainerLocator;
      });

      const result = await service.scrapeFloorplanDetails(
        mockPage, 
        'https://example.com/floorplan', 
        'Test Floorplan', 
        1
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
      mockSuccessCard.locator.mockReturnValue(mockSuccessTitle);
      mockSuccessCard.textContent.mockResolvedValue('Starting at $1500');
      
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
      // Mock multiple cards with different scenarios
      const mockCard1 = { ...mockLocator };
      const mockCard2 = { ...mockLocator };
      
      const mockTitle1 = { ...mockLocator };
      const mockTitle2 = { ...mockLocator };
      
      mockTitle1.textContent.mockResolvedValue('The Dellwood');
      mockTitle2.textContent.mockResolvedValue('The Gateway');
      
      mockCard1.locator.mockReturnValue(mockTitle1);
      mockCard1.textContent.mockResolvedValue('Starting at $1500');
      mockCard1.scrollIntoViewIfNeeded.mockResolvedValue(undefined);
      
      mockCard2.locator.mockReturnValue(mockTitle2);
      mockCard2.textContent.mockResolvedValue('Starting at $2000');
      mockCard2.scrollIntoViewIfNeeded.mockResolvedValue(undefined);
      
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
        0
      );
      expect(scraperServiceSpy).toHaveBeenCalledWith(
        mockPage, 
        'https://flatsatpcm.com/floorplans/the-gateway/', 
        'The Gateway', 
        0
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
      
      mockCard1.locator.mockReturnValue(mockTitle1);
      mockCard1.textContent.mockResolvedValue('Starting at $1500');
      mockCard1.scrollIntoViewIfNeeded.mockResolvedValue(undefined);
      
      mockCard2.locator.mockReturnValue(mockTitle2);
      mockCard2.textContent.mockResolvedValue('Starting at $2000');
      mockCard2.scrollIntoViewIfNeeded.mockResolvedValue(undefined);
      
      mockLocator.count.mockResolvedValue(2);
      mockLocator.nth.mockImplementation((index: number) => {
        return index === 0 ? mockCard1 : mockCard2;
      });

      // Mock scrapeFloorplanDetails to fail for first floorplan, succeed for second
      const scraperServiceSpy = jest.spyOn(scraperService as any, 'scrapeFloorplanDetails')
        .mockImplementation((page, url, title) => {
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
      // Mock cards with different pricing scenarios
      const mockCard1 = { ...mockLocator }; // No pricing
      const mockCard2 = { ...mockLocator }; // Has "Starting at $"
      const mockCard3 = { ...mockLocator }; // Wrong bedroom count
      
      const mockTitle1 = { ...mockLocator };
      const mockTitle2 = { ...mockLocator };
      const mockTitle3 = { ...mockLocator };
      
      mockTitle1.textContent.mockResolvedValue('The Expensive');
      mockTitle2.textContent.mockResolvedValue('The Available');
      mockTitle3.textContent.mockResolvedValue('The Two Bedroom');
      
      mockCard1.locator.mockReturnValue(mockTitle1);
      mockCard1.textContent.mockResolvedValue('Waitlist Only');
      mockCard1.scrollIntoViewIfNeeded.mockResolvedValue(undefined);
      
      mockCard2.locator.mockReturnValue(mockTitle2);
      mockCard2.textContent.mockResolvedValue('Starting at $1500');
      mockCard2.scrollIntoViewIfNeeded.mockResolvedValue(undefined);
      
      mockCard3.locator.mockReturnValue(mockTitle3);
      mockCard3.textContent.mockResolvedValue('Starting at $2000');
      mockCard3.scrollIntoViewIfNeeded.mockResolvedValue(undefined);
      
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
        0
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
          floorplanUrl: 'https://example.com/dellwood',
          bedroomCount: 1,
          isAvailable: true
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
        const mockContainerLocator = {
          count: jest.fn().mockResolvedValue(1),
          all: jest.fn().mockResolvedValue([{
            textContent: jest.fn().mockResolvedValue(mockPageText)
          }])
        };
        
        mockPage.locator.mockReturnValue(mockContainerLocator);
        
        // Call the private method to test deduplication
        const service = scraperService as any;
        const result = await service.scrapeFloorplanDetails(
          mockPage, 
          'https://example.com/test', 
          'Test Floorplan', 
          1
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
        const mockContainerLocator = {
          count: jest.fn().mockResolvedValue(1),
          all: jest.fn().mockResolvedValue([{
            textContent: jest.fn().mockResolvedValue(mockPageText)
          }])
        };
        
        mockPage.locator.mockReturnValue(mockContainerLocator);
        
        const service = scraperService as any;
        const result = await service.scrapeFloorplanDetails(
          mockPage, 
          'https://example.com/test', 
          'Test Floorplan', 
          1
        );
        
        // Should return both units since they have different rent/dates
        expect(result).toHaveLength(2);
        expect(result[0].rent).toBe('$1,993');
        expect(result[1].rent).toBe('$2,100');
      });
    });
  });
});