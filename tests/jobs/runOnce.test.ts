import { runOnce } from '../../src/jobs/runOnce';
import { ScraperService } from '../../src/services/scraper';
import { DatabaseService } from '../../src/services/database';
import { NotificationService } from '../../src/services/notifications';
import { Apartment } from '../../src/types/apartment';

// Mock all services
jest.mock('../../src/services/scraper');
jest.mock('../../src/services/database');
jest.mock('../../src/services/notifications');

const MockedScraperService = ScraperService as jest.MockedClass<typeof ScraperService>;
const MockedDatabaseService = DatabaseService as jest.MockedClass<typeof DatabaseService>;
const MockedNotificationService = NotificationService as jest.MockedClass<typeof NotificationService>;

describe('runOnce', () => {
  let mockScraperService: jest.Mocked<ScraperService>;
  let mockDatabaseService: jest.Mocked<DatabaseService>;
  let mockNotificationService: jest.Mocked<NotificationService>;

  const mockApartments: Apartment[] = [
    {
      unitNumber: 'WEST-641',
      floorplanName: 'The Dellwood',
      bedroomCount: 1,
      rent: 1991,
      availabilityDate: new Date('2024-09-28')
    },
    {
      unitNumber: 'EAST-502', 
      floorplanName: 'The Gateway',
      bedroomCount: 0,
      rent: 1750,
      availabilityDate: new Date('2024-10-01')
    }
  ];

  beforeEach(() => {
    jest.clearAllMocks();
    
    // Setup mocks
    mockScraperService = {
      run: jest.fn()
    } as any;
    
    mockDatabaseService = {
      testConnection: jest.fn(),
      findNewUnits: jest.fn(),
      updateApartments: jest.fn(),
      removeUnavailableUnits: jest.fn(),
      logScrapeRun: jest.fn()
    } as any;
    
    mockNotificationService = {
      sendNewApartmentNotification: jest.fn(),
      sendErrorNotification: jest.fn()
    } as any;

    MockedScraperService.mockImplementation(() => mockScraperService);
    MockedDatabaseService.mockImplementation(() => mockDatabaseService);
    MockedNotificationService.mockImplementation(() => mockNotificationService);

    // Default successful behavior
    mockScraperService.run.mockResolvedValue(mockApartments);
    mockDatabaseService.testConnection.mockResolvedValue(true);
    mockDatabaseService.findNewUnits.mockResolvedValue([mockApartments[0]]); // Only first apartment is new
    mockDatabaseService.updateApartments.mockResolvedValue(undefined);
    mockDatabaseService.removeUnavailableUnits.mockResolvedValue(undefined);
    mockDatabaseService.logScrapeRun.mockResolvedValue(undefined);
    mockNotificationService.sendNewApartmentNotification.mockResolvedValue(undefined);
  });

  describe('normal operation (database enabled)', () => {
    it('should run complete workflow with database checks', async () => {
      await runOnce(false);

      expect(MockedScraperService).toHaveBeenCalledTimes(1);
      expect(MockedDatabaseService).toHaveBeenCalledTimes(1);
      expect(MockedNotificationService).toHaveBeenCalledTimes(1);
      
      expect(mockScraperService.run).toHaveBeenCalledTimes(1);
      expect(mockDatabaseService.testConnection).toHaveBeenCalledTimes(1);
      expect(mockDatabaseService.findNewUnits).toHaveBeenCalledWith(mockApartments);
      expect(mockNotificationService.sendNewApartmentNotification).toHaveBeenCalledWith([mockApartments[0]]);
      expect(mockDatabaseService.updateApartments).toHaveBeenCalledWith(mockApartments);
      expect(mockDatabaseService.removeUnavailableUnits).toHaveBeenCalled();
      expect(mockDatabaseService.logScrapeRun).toHaveBeenCalled();
    });

    it('should not send notifications when no new units found', async () => {
      mockDatabaseService.findNewUnits.mockResolvedValue([]);

      await runOnce(false);

      expect(mockNotificationService.sendNewApartmentNotification).not.toHaveBeenCalled();
      expect(mockDatabaseService.updateApartments).toHaveBeenCalledWith(mockApartments);
    });

    it('should handle database connection failure', async () => {
      mockDatabaseService.testConnection.mockResolvedValue(false);

      await expect(runOnce(false)).rejects.toThrow('Database connection failed');
      
      expect(mockScraperService.run).not.toHaveBeenCalled();
      expect(mockNotificationService.sendNewApartmentNotification).not.toHaveBeenCalled();
    });
  });

  describe('ignore database mode', () => {
    it('should skip database initialization and checks when ignoreDatabase is true', async () => {
      await runOnce(true);

      expect(MockedScraperService).toHaveBeenCalledTimes(1);
      expect(MockedDatabaseService).not.toHaveBeenCalled(); // Database service should not be created
      expect(MockedNotificationService).toHaveBeenCalledTimes(1);
      
      expect(mockScraperService.run).toHaveBeenCalledTimes(1);
      expect(mockNotificationService.sendNewApartmentNotification).toHaveBeenCalledWith(mockApartments); // All apartments sent
    });

    it('should send notifications for all found units when ignoring database', async () => {
      await runOnce(true);

      // Should send notifications for ALL apartments, not just new ones
      expect(mockNotificationService.sendNewApartmentNotification).toHaveBeenCalledWith(mockApartments);
      
      // Database methods should not be called
      expect(mockDatabaseService.testConnection).not.toHaveBeenCalled();
      expect(mockDatabaseService.findNewUnits).not.toHaveBeenCalled();
      expect(mockDatabaseService.updateApartments).not.toHaveBeenCalled();
      expect(mockDatabaseService.removeUnavailableUnits).not.toHaveBeenCalled();
      expect(mockDatabaseService.logScrapeRun).not.toHaveBeenCalled();
    });

    it('should not send notifications when no units found even with ignore database', async () => {
      mockScraperService.run.mockResolvedValue([]);

      await runOnce(true);

      expect(mockNotificationService.sendNewApartmentNotification).not.toHaveBeenCalled();
    });

    it('should handle scraper errors in ignore database mode', async () => {
      const error = new Error('Scraper failed');
      mockScraperService.run.mockRejectedValue(error);

      await expect(runOnce(true)).rejects.toThrow('Scraper failed');
      
      expect(mockNotificationService.sendErrorNotification).toHaveBeenCalledWith(
        'Scraper failed',
        'one-time scraping job'
      );
    });

    it('should work even when database service creation would fail', async () => {
      // This simulates a scenario where database connection is unavailable
      // but we still want to scrape and notify
      MockedDatabaseService.mockImplementation(() => {
        throw new Error('Database unavailable');
      });

      await runOnce(true);

      expect(mockScraperService.run).toHaveBeenCalledTimes(1);
      expect(mockNotificationService.sendNewApartmentNotification).toHaveBeenCalledWith(mockApartments);
    });
  });

  describe('error handling', () => {
    it('should send error notification when scraping fails', async () => {
      const error = new Error('Scraping network error');
      mockScraperService.run.mockRejectedValue(error);

      await expect(runOnce(false)).rejects.toThrow();
      
      expect(mockNotificationService.sendErrorNotification).toHaveBeenCalledWith(
        'Scraping network error',
        'one-time scraping job'
      );
    });

    it('should try to log error to database when available', async () => {
      const error = new Error('Test error');
      mockScraperService.run.mockRejectedValue(error);

      await expect(runOnce(false)).rejects.toThrow();

      expect(mockDatabaseService.logScrapeRun).toHaveBeenCalledWith({
        started_at: expect.any(String),
        completed_at: expect.any(String),
        units_found: 0,
        new_units: 0,
        errors: 'Test error',
        status: 'failed'
      });
    });

    it('should not try to log error to database in ignore database mode', async () => {
      const error = new Error('Test error');
      mockScraperService.run.mockRejectedValue(error);

      await expect(runOnce(true)).rejects.toThrow();

      expect(mockDatabaseService.logScrapeRun).not.toHaveBeenCalled();
    });
  });

  describe('edge cases', () => {
    it('should handle when scraper returns empty results', async () => {
      mockScraperService.run.mockResolvedValue([]);
      mockDatabaseService.findNewUnits.mockResolvedValue([]); // Also return empty for new units

      await runOnce(false);

      expect(mockDatabaseService.findNewUnits).toHaveBeenCalledWith([]);
      expect(mockNotificationService.sendNewApartmentNotification).not.toHaveBeenCalled();
      expect(mockDatabaseService.updateApartments).not.toHaveBeenCalled();
    });

    it('should handle when scraper returns empty results in ignore database mode', async () => {
      mockScraperService.run.mockResolvedValue([]);

      await runOnce(true);

      expect(mockNotificationService.sendNewApartmentNotification).not.toHaveBeenCalled();
    });
  });
});