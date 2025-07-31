"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const scraper_1 = require("../../src/services/scraper");
// Mock Playwright
const mockPage = {
    goto: jest.fn(),
    locator: jest.fn(),
    close: jest.fn()
};
const mockLocator = {
    count: jest.fn(),
    nth: jest.fn(),
    locator: jest.fn(),
    textContent: jest.fn(),
    getAttribute: jest.fn(),
    first: jest.fn()
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
    let scraperService;
    beforeEach(() => {
        jest.clearAllMocks();
        // Reset mock implementations
        mockPage.locator.mockReturnValue(mockLocator);
        mockLocator.locator.mockReturnValue(mockLocator);
        mockLocator.nth.mockReturnValue(mockLocator);
        mockLocator.first.mockReturnValue(mockLocator);
        scraperService = new scraper_1.ScraperService();
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
            const uninitializedScraper = new scraper_1.ScraperService();
            await expect(uninitializedScraper.scrapeApartments())
                .rejects.toThrow('Browser not initialized. Call initialize() first.');
        });
        it('should scrape apartments successfully', async () => {
            // Mock floorplan cards on main page
            mockLocator.count.mockResolvedValue(2);
            // Mock card 1 - 1BR available
            const mockCard1 = { ...mockLocator };
            mockCard1.locator.mockImplementation((selector) => {
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
            mockCard2.locator.mockImplementation((selector) => {
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
            mockLocator.nth.mockImplementation((index) => {
                return index === 0 ? mockCard1 : mockCard2;
            });
            // Mock detail page scraping
            mockPage.goto.mockResolvedValue(undefined);
            // Mock unit cards on detail page
            const mockUnitCard = { ...mockLocator };
            mockUnitCard.locator.mockImplementation((selector) => {
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
            mockPage.locator.mockImplementation((selector) => {
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
            mockCard.locator.mockImplementation((selector) => {
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
            mockCard.locator.mockImplementation((selector) => {
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
    describe('private method testing', () => {
        describe('extractBedroomCount', () => {
            it('should extract bedroom count correctly', () => {
                const service = scraperService;
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
                const service = scraperService;
                expect(service.parseRent('$1,991')).toBe(1991);
                expect(service.parseRent('$2,500')).toBe(2500);
                expect(service.parseRent('1750')).toBe(1750);
                expect(service.parseRent('$995')).toBe(995);
                expect(service.parseRent('Invalid')).toBe(0);
            });
        });
        describe('parseAvailabilityDate', () => {
            it('should parse "Available Sep 28" format', () => {
                const service = scraperService;
                const result = service.parseAvailabilityDate('Available Sep 28');
                expect(result).toBeInstanceOf(Date);
                expect(result.getMonth()).toBe(8); // September is month 8 (0-indexed)
                expect(result.getDate()).toBe(28);
            });
            it('should parse "9/28" format', () => {
                const service = scraperService;
                const result = service.parseAvailabilityDate('9/28');
                expect(result).toBeInstanceOf(Date);
                expect(result.getMonth()).toBe(8); // September is month 8 (0-indexed)
                expect(result.getDate()).toBe(28);
            });
            it('should handle invalid date strings', () => {
                const service = scraperService;
                expect(service.parseAvailabilityDate('Invalid Date')).toBeNull();
                expect(service.parseAvailabilityDate('')).toBeNull();
            });
            it('should handle direct date strings', () => {
                const service = scraperService;
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
                const service = scraperService;
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
    });
});
