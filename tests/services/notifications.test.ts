import { NotificationService } from '../../src/services/notifications';
import { Apartment } from '../../src/types/apartment';

// Mock fetch globally
const mockFetch = jest.fn();
global.fetch = mockFetch;

describe('NotificationService', () => {
  let notificationService: NotificationService;
  
  beforeEach(() => {
    jest.clearAllMocks();
    notificationService = new NotificationService();
  });

  describe('constructor', () => {
    it('should throw error if NTFY_TOPIC environment variable is missing', () => {
      const originalTopic = process.env.NTFY_TOPIC;
      
      process.env.NTFY_TOPIC = '';
      
      expect(() => new NotificationService()).toThrow('Missing required NTFY_TOPIC environment variable');
      
      // Restore environment variable
      process.env.NTFY_TOPIC = originalTopic;
    });

    it('should use default ntfy server if not specified', () => {
      const originalServer = process.env.NTFY_SERVER;
      delete process.env.NTFY_SERVER;
      
      const service = new NotificationService();
      
      // Should not throw and should use default server
      expect(service).toBeDefined();
      
      // Restore environment variable
      process.env.NTFY_SERVER = originalServer;
    });
  });

  describe('sendNewApartmentNotification', () => {
    const mockApartment: Apartment = {
      unitNumber: 'WEST-641',
      floorplanName: 'The Dellwood',
      bedroomCount: 1,
      rent: 1991,
      availabilityDate: new Date('2024-09-28')
    };

    it('should send notification for single apartment', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200
      });

      await notificationService.sendNewApartmentNotification([mockApartment]);

      expect(mockFetch).toHaveBeenCalledWith(
        'https://ntfy.sh/test-topic',
        expect.objectContaining({
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: expect.stringContaining('New 1BR Available!')
        })
      );

      const callBody = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(callBody.title).toBe('New 1BR Available!');
      expect(callBody.message).toContain('WEST-641: $1,991/mo');
      expect(callBody.message).toMatch(/Available: 9\/(27|28)/);
      expect(callBody.message).toContain('Floorplan: The Dellwood');
      expect(callBody.tags).toEqual(['house', 'apartment']);
      expect(callBody.priority).toBe(4);
      expect(callBody.actions).toEqual([{
        action: 'view',
        label: 'View Floorplan',
        url: 'https://flatsatpcm.com/floorplans/the-dellwood/'
      }]);
    });

    it('should send notification for studio apartment', async () => {
      const studioApartment: Apartment = {
        ...mockApartment,
        bedroomCount: 0,
        unitNumber: 'STUDIO-101'
      };

      mockFetch.mockResolvedValue({
        ok: true,
        status: 200
      });

      await notificationService.sendNewApartmentNotification([studioApartment]);

      const callBody = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(callBody.title).toBe('New Studio Available!');
      expect(callBody.message).toContain('STUDIO-101');
    });

    it('should send notification for multiple apartments', async () => {
      const apartments: Apartment[] = [
        mockApartment,
        {
          ...mockApartment,
          unitNumber: 'EAST-502',
          bedroomCount: 0,
          rent: 1750,
          availabilityDate: new Date('2024-10-01')
        }
      ];

      mockFetch.mockResolvedValue({
        ok: true,
        status: 200
      });

      await notificationService.sendNewApartmentNotification(apartments);

      const callBody = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(callBody.title).toBe('🏠 2 New Apartments Available!');
      expect(callBody.message).toContain('1BR WEST-641: $1,991');
      expect(callBody.message).toContain('Studio EAST-502: $1,750');
      expect(callBody.message).toContain('View all floorplans at flatsatpcm.com');
      expect(callBody.actions).toEqual([{
        action: 'view',
        label: 'View All',
        url: 'https://flatsatpcm.com/floorplans/'
      }]);
    });

    it('should handle apartment with no availability date', async () => {
      const apartmentNoDate: Apartment = {
        ...mockApartment,
        availabilityDate: null
      };

      mockFetch.mockResolvedValue({
        ok: true,
        status: 200
      });

      await notificationService.sendNewApartmentNotification([apartmentNoDate]);

      const callBody = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(callBody.message).toContain('Available: Date TBD');
    });

    it('should do nothing when no apartments provided', async () => {
      const consoleSpy = jest.spyOn(console, 'log').mockImplementation();
      
      await notificationService.sendNewApartmentNotification([]);

      expect(consoleSpy).toHaveBeenCalledWith('No new apartments to notify about');
      expect(mockFetch).not.toHaveBeenCalled();
      
      consoleSpy.mockRestore();
    });

    it('should throw error on notification sending failure', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error'
      });

      await expect(notificationService.sendNewApartmentNotification([mockApartment]))
        .rejects.toThrow('Notification sending failed: Error: ntfy request failed: 500 Internal Server Error');
    });

    it('should format rent with proper thousands separator', async () => {
      const expensiveApartment: Apartment = {
        ...mockApartment,
        rent: 2500
      };

      mockFetch.mockResolvedValue({
        ok: true,
        status: 200
      });

      await notificationService.sendNewApartmentNotification([expensiveApartment]);

      const callBody = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(callBody.message).toContain('$2,500/mo');
    });
  });

  describe('sendErrorNotification', () => {
    it('should send error notification successfully', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200
      });

      await notificationService.sendErrorNotification('Database connection failed', 'scraping job');

      expect(mockFetch).toHaveBeenCalledWith(
        'https://ntfy.sh/test-topic',
        expect.objectContaining({
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          }
        })
      );

      const callBody = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(callBody.title).toBe('🚨 Apartment Crawler Error');
      expect(callBody.message).toContain('Context: scraping job');
      expect(callBody.message).toContain('Error: Database connection failed');
      expect(callBody.tags).toEqual(['warning', 'error']);
      expect(callBody.priority).toBe(5);
    });

    it('should send error notification without context', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200
      });

      await notificationService.sendErrorNotification('Generic error');

      const callBody = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(callBody.title).toBe('🚨 Apartment Crawler Error');
      expect(callBody.message).toContain('Error: Generic error');
      expect(callBody.message).not.toContain('Context:');
    });

    it('should not throw error if notification sending fails', async () => {
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation();
      mockFetch.mockResolvedValue({
        ok: false,
        status: 500
      });

      await expect(notificationService.sendErrorNotification('Test error'))
        .resolves.not.toThrow();

      expect(consoleSpy).toHaveBeenCalledWith('Failed to send error notification:', expect.any(Error));
      
      consoleSpy.mockRestore();
    });
  });

  describe('testNotification', () => {
    it('should send test notification successfully', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200
      });

      const result = await notificationService.testNotification();

      expect(result).toBe(true);
      expect(mockFetch).toHaveBeenCalledWith(
        'https://ntfy.sh/test-topic',
        expect.objectContaining({
          method: 'POST'
        })
      );

      const callBody = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(callBody.title).toBe('🧪 Test Notification');
      expect(callBody.message).toBe('Apartment Crawler notification system is working!');
      expect(callBody.tags).toEqual(['test']);
      expect(callBody.priority).toBe(3);
    });

    it('should return false on test notification failure', async () => {
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation();
      mockFetch.mockResolvedValue({
        ok: false,
        status: 500
      });

      const result = await notificationService.testNotification();

      expect(result).toBe(false);
      expect(consoleSpy).toHaveBeenCalledWith('Test notification failed:', expect.any(Error));
      
      consoleSpy.mockRestore();
    });
  });

  describe('sendSummaryNotification', () => {
    it('should send summary notification with stats', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200
      });

      const stats = {
        totalUnits: 5,
        newUnits: 2,
        studios: 1,
        oneBedrooms: 4
      };

      await notificationService.sendSummaryNotification(stats);

      const callBody = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(callBody.title).toBe('📊 Scraping Summary');
      expect(callBody.message).toContain('• 5 total units found');
      expect(callBody.message).toContain('• 2 new units');
      expect(callBody.message).toContain('• 1 studios, 4 1-bedrooms');
      expect(callBody.message).toContain('New units notification sent!');
      expect(callBody.tags).toEqual(['chart_with_upwards_trend']);
      expect(callBody.priority).toBe(2);
    });

    it('should handle case when no new units found', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200
      });

      const stats = {
        totalUnits: 3,
        newUnits: 0,
        studios: 0,
        oneBedrooms: 3
      };

      await notificationService.sendSummaryNotification(stats);

      const callBody = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(callBody.message).toContain('No new units found');
    });

    it('should not throw error if summary notification fails', async () => {
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation();
      mockFetch.mockRejectedValue(new Error('Network error'));

      const stats = { totalUnits: 0, newUnits: 0, studios: 0, oneBedrooms: 0 };

      await expect(notificationService.sendSummaryNotification(stats))
        .resolves.not.toThrow();

      expect(consoleSpy).toHaveBeenCalledWith('Failed to send summary notification:', expect.any(Error));
      
      consoleSpy.mockRestore();
    });
  });

  describe('private methods', () => {
    describe('formatDate', () => {
      it('should format date correctly', () => {
        // Access private method through type assertion
        const service = notificationService as any;
        
        const date = new Date('2024-09-28T12:00:00Z'); // Use specific time to avoid timezone issues
        const formatted = service.formatDate(date);
        
        // Check that format is M/D pattern, account for timezone differences
        expect(formatted).toMatch(/^9\/(27|28)$/);
      });

      it('should handle single digit dates', () => {
        const service = notificationService as any;
        
        const date = new Date('2024-01-05T12:00:00Z'); // Use specific time to avoid timezone issues
        const formatted = service.formatDate(date);
        
        // Check that format is M/D pattern, account for timezone differences  
        expect(formatted).toMatch(/^1\/(4|5)$/);
      });
    });
  });
});