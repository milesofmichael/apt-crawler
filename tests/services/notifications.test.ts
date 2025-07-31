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
          body: expect.stringContaining('New Unit Available')
        })
      );

      const callBody = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(callBody.title).toBe('New Unit Available');
      expect(callBody.message).toContain('The Dellwood - #WEST-641 - $1,991 - Available Sep');
      expect(callBody.message).toMatch(/Sep (27|28)/);
      expect(callBody.tags).toEqual(['house', 'apartment']);
      expect(callBody.priority).toBe(4);
      expect(callBody.actions).toEqual([{
        action: 'view',
        label: 'View Floorplan',
        url: 'https://flatsatpcm.com/floorplans/'
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
      expect(callBody.title).toBe('New Unit Available');
      expect(callBody.message).toContain('The Dellwood - #STUDIO-101');
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
      expect(callBody.title).toBe('2 New Units Available');
      expect(callBody.message).toContain('The Dellwood - #WEST-641 - $1,991');
      expect(callBody.message).toContain('The Dellwood - #EAST-502 - $1,750');
      expect(callBody.message).toContain(' | ');
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
      expect(callBody.message).toContain('Available Date TBD');
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
      expect(callBody.message).toContain('$2,500');
    });

    it('should format multiple apartments with pipe separator when 3 or fewer', async () => {
      const apartments: Apartment[] = [
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
        },
        {
          unitNumber: 'NORTH-300',
          floorplanName: 'The Tower',
          bedroomCount: 1,
          rent: 2100,
          availabilityDate: new Date('2024-09-15')
        }
      ];

      mockFetch.mockResolvedValue({
        ok: true,
        status: 200
      });

      await notificationService.sendNewApartmentNotification(apartments);

      const callBody = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(callBody.title).toBe('3 New Units Available');
      expect(callBody.message).toContain('The Dellwood - #WEST-641 - $1,991');
      expect(callBody.message).toContain('The Gateway - #EAST-502 - $1,750');
      expect(callBody.message).toContain('The Tower - #NORTH-300 - $2,100');
      expect(callBody.message).toContain(' | ');
      // Should not contain newlines
      expect(callBody.message).not.toContain('\n');
    });

    it('should format many apartments as summary when more than 3', async () => {
      const apartments: Apartment[] = [
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
        },
        {
          unitNumber: 'NORTH-300',
          floorplanName: 'The Tower',
          bedroomCount: 1,
          rent: 2100,
          availabilityDate: new Date('2024-09-15')
        },
        {
          unitNumber: 'SOUTH-200',
          floorplanName: 'The Loft',
          bedroomCount: 0,
          rent: 1650,
          availabilityDate: new Date('2024-09-20')
        },
        {
          unitNumber: 'CENTER-400',
          floorplanName: 'The Plaza',
          bedroomCount: 1,
          rent: 2200,
          availabilityDate: new Date('2024-10-05')
        }
      ];

      mockFetch.mockResolvedValue({
        ok: true,
        status: 200
      });

      await notificationService.sendNewApartmentNotification(apartments);

      const callBody = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(callBody.title).toBe('5 New Units Available');
      expect(callBody.message).toContain('2 studios, 3 1BRs');
      expect(callBody.message).toContain('flatsatpcm.com/floorplans');
      // Should not contain newlines
      expect(callBody.message).not.toContain('\n');
    });

    it('should handle only studios in summary format', async () => {
      const apartments: Apartment[] = [
        {
          unitNumber: 'STUDIO-1',
          floorplanName: 'Studio A',
          bedroomCount: 0,
          rent: 1500,
          availabilityDate: new Date('2024-09-28')
        },
        {
          unitNumber: 'STUDIO-2',
          floorplanName: 'Studio B',
          bedroomCount: 0,
          rent: 1600,
          availabilityDate: new Date('2024-09-29')
        },
        {
          unitNumber: 'STUDIO-3',
          floorplanName: 'Studio C',
          bedroomCount: 0,
          rent: 1700,
          availabilityDate: new Date('2024-09-30')
        },
        {
          unitNumber: 'STUDIO-4',
          floorplanName: 'Studio D',
          bedroomCount: 0,
          rent: 1800,
          availabilityDate: new Date('2024-10-01')
        }
      ];

      mockFetch.mockResolvedValue({
        ok: true,
        status: 200
      });

      await notificationService.sendNewApartmentNotification(apartments);

      const callBody = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(callBody.title).toBe('4 New Units Available');
      expect(callBody.message).toContain('4 studios');
      expect(callBody.message).not.toContain('1BR');
    });

    it('should handle only 1-bedrooms in summary format', async () => {
      const apartments: Apartment[] = [
        {
          unitNumber: 'BR1-1',
          floorplanName: '1BR A',
          bedroomCount: 1,
          rent: 2000,
          availabilityDate: new Date('2024-09-28')
        },
        {
          unitNumber: 'BR1-2',
          floorplanName: '1BR B',
          bedroomCount: 1,
          rent: 2100,
          availabilityDate: new Date('2024-09-29')
        },
        {
          unitNumber: 'BR1-3',
          floorplanName: '1BR C',
          bedroomCount: 1,
          rent: 2200,
          availabilityDate: new Date('2024-09-30')
        },
        {
          unitNumber: 'BR1-4',
          floorplanName: '1BR D',
          bedroomCount: 1,
          rent: 2300,
          availabilityDate: new Date('2024-10-01')
        },
        {
          unitNumber: 'BR1-5',
          floorplanName: '1BR E',
          bedroomCount: 1,
          rent: 2400,
          availabilityDate: new Date('2024-10-02')
        }
      ];

      mockFetch.mockResolvedValue({
        ok: true,
        status: 200
      });

      await notificationService.sendNewApartmentNotification(apartments);

      const callBody = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(callBody.title).toBe('5 New Units Available');
      expect(callBody.message).toContain('5 1BRs');
      expect(callBody.message).not.toContain('studio');
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

    describe('formatDateForMessage', () => {
      it('should format date correctly for messages', () => {
        const service = notificationService as any;
        
        const date = new Date('2024-09-28T12:00:00Z');
        const formatted = service.formatDateForMessage(date);
        
        // Check that format is "MMM DD" pattern, account for timezone differences
        expect(formatted).toMatch(/^Sep (27|28)$/);
      });

      it('should handle single digit dates with padding', () => {
        const service = notificationService as any;
        
        const date = new Date('2024-01-05T12:00:00Z');
        const formatted = service.formatDateForMessage(date);
        
        // Check that format is "MMM DD" pattern with padding, account for timezone differences  
        expect(formatted).toMatch(/^Jan (04|05)$/);
      });

      it('should handle different months correctly', () => {
        const service = notificationService as any;
        
        const date = new Date('2024-12-15T12:00:00Z');
        const formatted = service.formatDateForMessage(date);
        
        expect(formatted).toMatch(/^Dec (14|15)$/);
      });
    });
  });
});