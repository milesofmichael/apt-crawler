import { DatabaseService } from '../../src/services/database';
import { Apartment, ApartmentRecord } from '../../src/types/apartment';

// Mock Supabase client
const mockSupabaseClient: any = {
  from: jest.fn().mockReturnThis(),
  select: jest.fn().mockReturnThis(),
  eq: jest.fn().mockReturnThis(),
  upsert: jest.fn().mockReturnThis(),
  update: jest.fn().mockReturnThis(),
  delete: jest.fn().mockReturnThis(),
  not: jest.fn().mockReturnThis(),
  neq: jest.fn().mockReturnThis(),
  insert: jest.fn().mockReturnThis(),
  limit: jest.fn().mockReturnThis()
};

// Mock the createClient function
jest.mock('@supabase/supabase-js', () => ({
  createClient: jest.fn(() => mockSupabaseClient)
}));

describe('DatabaseService', () => {
  let databaseService: DatabaseService;
  
  beforeEach(() => {
    jest.clearAllMocks();
    databaseService = new DatabaseService();
  });

  describe('constructor', () => {
    it('should throw error if environment variables are missing', () => {
      const originalUrl = process.env.SUPABASE_URL;
      const originalKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
      
      process.env.SUPABASE_URL = '';
      process.env.SUPABASE_SERVICE_ROLE_KEY = '';
      
      expect(() => new DatabaseService()).toThrow('Missing required Supabase environment variables');
      
      // Restore environment variables
      process.env.SUPABASE_URL = originalUrl;
      process.env.SUPABASE_SERVICE_ROLE_KEY = originalKey;
    });
  });

  describe('getActiveApartments', () => {
    it('should return active apartments', async () => {
      const mockData: ApartmentRecord[] = [
        {
          id: 1,
          unit_number: 'WEST-641',
          floorplan_name: 'The Dellwood',
          bedroom_count: 1,
          rent: 1991,
          availability_date: '2024-09-28',
          last_seen: '2024-01-01T00:00:00Z',
          first_seen: '2024-01-01T00:00:00Z'
        }
      ];

      mockSupabaseClient.select.mockResolvedValue({ data: mockData, error: null });

      const result = await databaseService.getActiveApartments();

      expect(mockSupabaseClient.from).toHaveBeenCalledWith('apartments');
      expect(mockSupabaseClient.select).toHaveBeenCalledWith('*');
      expect(result).toEqual(mockData);
    });

    it('should throw error on database failure', async () => {
      mockSupabaseClient.select.mockResolvedValue({ data: null, error: { message: 'Database error' } });

      await expect(databaseService.getActiveApartments()).rejects.toThrow('Failed to fetch active apartments: Database error');
    });
  });

  describe('findNewUnits', () => {
    it('should identify new units not in database', async () => {
      const existingUnits: ApartmentRecord[] = [
        {
          id: 1,
          unit_number: 'WEST-641',
          floorplan_name: 'The Dellwood',
          bedroom_count: 1,
          rent: 1991,
          availability_date: '2024-09-28',
          last_seen: '2024-01-01T00:00:00Z',
          first_seen: '2024-01-01T00:00:00Z'
        }
      ];

      const scrapedUnits: Apartment[] = [
        {
          unitNumber: 'WEST-641', // Existing unit
          floorplanName: 'The Dellwood',
          bedroomCount: 1,
          rent: 1991,
          availabilityDate: new Date('2024-09-28'),
        },
        {
          unitNumber: 'EAST-502', // New unit
          floorplanName: 'The Ashwood',
          bedroomCount: 0,
          rent: 1750,
          availabilityDate: new Date('2024-10-01'),
        }
      ];

      mockSupabaseClient.select.mockResolvedValue({ data: existingUnits, error: null });

      const result = await databaseService.findNewUnits(scrapedUnits);

      expect(result).toHaveLength(1);
      expect(result[0].unitNumber).toBe('EAST-502');
    });

    it('should return empty array when no new units found', async () => {
      const existingUnits: ApartmentRecord[] = [
        {
          id: 1,
          unit_number: 'WEST-641',
          floorplan_name: 'The Dellwood',
          bedroom_count: 1,
          rent: 1991,
          availability_date: '2024-09-28',
          last_seen: '2024-01-01T00:00:00Z',
          first_seen: '2024-01-01T00:00:00Z'
        }
      ];

      const scrapedUnits: Apartment[] = [
        {
          unitNumber: 'WEST-641',
          floorplanName: 'The Dellwood',
          bedroomCount: 1,
          rent: 1991,
          availabilityDate: new Date('2024-09-28'),
        }
      ];

      mockSupabaseClient.select.mockResolvedValue({ data: existingUnits, error: null });

      const result = await databaseService.findNewUnits(scrapedUnits);

      expect(result).toHaveLength(0);
    });
  });

  describe('updateApartments', () => {
    it('should upsert apartment records successfully', async () => {
      const apartments: Apartment[] = [
        {
          unitNumber: 'WEST-641',
          floorplanName: 'The Dellwood',
          bedroomCount: 1,
          rent: 1991,
          availabilityDate: new Date('2024-09-28'),
        }
      ];

      mockSupabaseClient.upsert.mockResolvedValue({ error: null });

      await databaseService.updateApartments(apartments);

      expect(mockSupabaseClient.from).toHaveBeenCalledWith('apartments');
      expect(mockSupabaseClient.upsert).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({
            unit_number: 'WEST-641',
            floorplan_name: 'The Dellwood',
            bedroom_count: 1,
            rent: 1991,
            availability_date: '2024-09-28'
          })
        ]),
        {
          onConflict: 'unit_number',
          ignoreDuplicates: false
        }
      );
    });

    it('should handle null availability date', async () => {
      const apartments: Apartment[] = [
        {
          unitNumber: 'WEST-641',
          floorplanName: 'The Dellwood',
          bedroomCount: 1,
          rent: 1991,
          availabilityDate: null,
        }
      ];

      mockSupabaseClient.upsert.mockResolvedValue({ error: null });

      await databaseService.updateApartments(apartments);

      expect(mockSupabaseClient.upsert).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({
            availability_date: null
          })
        ]),
        expect.any(Object)
      );
    });

    it('should throw error on database failure', async () => {
      const apartments: Apartment[] = [];
      mockSupabaseClient.upsert.mockResolvedValue({ error: { message: 'Upsert failed' } });

      await expect(databaseService.updateApartments(apartments)).rejects.toThrow('Failed to update apartments: Upsert failed');
    });

    it('should handle duplicate units via upsert', async () => {
      const apartments: Apartment[] = [
        {
          unitNumber: 'WEST-641',
          floorplanName: 'The Dellwood',
          bedroomCount: 1,
          rent: 1991,
          availabilityDate: new Date('2024-09-28'),
        },
        {
          unitNumber: 'WEST-641', // Same unit number - should be handled by upsert
          floorplanName: 'The Dellwood',
          bedroomCount: 1,
          rent: 2000, // Different rent - latest should win
          availabilityDate: new Date('2024-09-30'),
        }
      ];

      mockSupabaseClient.upsert.mockResolvedValue({ error: null });

      await databaseService.updateApartments(apartments);

      expect(mockSupabaseClient.upsert).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({
            unit_number: 'WEST-641',
            rent: 1991
          }),
          expect.objectContaining({
            unit_number: 'WEST-641', 
            rent: 2000
          })
        ]),
        expect.objectContaining({
          onConflict: 'unit_number',
          ignoreDuplicates: false
        })
      );
    });
  });

  describe('removeUnavailableUnits', () => {
    it('should remove units not in current list', async () => {
      const currentUnitNumbers = ['WEST-641', 'EAST-502'];
      mockSupabaseClient.not.mockResolvedValue({ error: null });

      await databaseService.removeUnavailableUnits(currentUnitNumbers);

      expect(mockSupabaseClient.from).toHaveBeenCalledWith('apartments');
      expect(mockSupabaseClient.delete).toHaveBeenCalled();
      expect(mockSupabaseClient.not).toHaveBeenCalledWith('unit_number', 'in', '("WEST-641","EAST-502")');
    });

    it('should handle empty unit numbers array', async () => {
      const consoleSpy = jest.spyOn(console, 'log').mockImplementation();
      mockSupabaseClient.neq.mockResolvedValue({ error: null });
      
      await databaseService.removeUnavailableUnits([]);

      expect(consoleSpy).toHaveBeenCalledWith('No current units to keep - removing all records');
      expect(mockSupabaseClient.delete).toHaveBeenCalled();
      expect(mockSupabaseClient.neq).toHaveBeenCalledWith('id', 0);
      
      consoleSpy.mockRestore();
    });

    it('should throw error on database failure', async () => {
      mockSupabaseClient.not.mockResolvedValue({ error: { message: 'Delete failed' } });

      await expect(databaseService.removeUnavailableUnits(['WEST-641'])).rejects.toThrow('Failed to remove unavailable units: Delete failed');
    });
  });

  describe('logScrapeRun', () => {
    it('should log scrape run successfully', async () => {
      const log = {
        started_at: '2024-01-01T00:00:00Z',
        completed_at: '2024-01-01T00:05:00Z',
        units_found: 5,
        new_units: 2,
        status: 'completed' as const
      };

      mockSupabaseClient.insert.mockResolvedValue({ error: null });

      await databaseService.logScrapeRun(log);

      expect(mockSupabaseClient.from).toHaveBeenCalledWith('scraping_logs');
      expect(mockSupabaseClient.insert).toHaveBeenCalledWith(log);
    });

    it('should throw error on logging failure', async () => {
      const log = {
        started_at: '2024-01-01T00:00:00Z',
        units_found: 0,
        new_units: 0,
        status: 'failed' as const
      };

      mockSupabaseClient.insert.mockResolvedValue({ error: { message: 'Insert failed' } });

      await expect(databaseService.logScrapeRun(log)).rejects.toThrow('Failed to log scrape run: Insert failed');
    });
  });

  describe('testConnection', () => {
    it('should return true on successful connection', async () => {
      mockSupabaseClient.limit.mockResolvedValue({ error: null });

      const result = await databaseService.testConnection();

      expect(result).toBe(true);
      expect(mockSupabaseClient.from).toHaveBeenCalledWith('apartments');
      expect(mockSupabaseClient.select).toHaveBeenCalledWith('id');
      expect(mockSupabaseClient.limit).toHaveBeenCalledWith(1);
    });

    it('should return false on connection failure', async () => {
      mockSupabaseClient.limit.mockResolvedValue({ error: { message: 'Connection failed' } });

      const result = await databaseService.testConnection();

      expect(result).toBe(false);
    });

    it('should return false on exception', async () => {
      mockSupabaseClient.limit.mockRejectedValue(new Error('Network error'));

      const result = await databaseService.testConnection();

      expect(result).toBe(false);
    });
  });
});