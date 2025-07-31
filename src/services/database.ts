import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { Apartment, ApartmentRecord, ScrapeLog } from '../types/apartment';

/**
 * Database service for managing apartment data in Supabase
 */
export class DatabaseService {
  private supabase: SupabaseClient;

  constructor() {
    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !supabaseServiceKey) {
      throw new Error('Missing required Supabase environment variables');
    }

    this.supabase = createClient(supabaseUrl, supabaseServiceKey);
    console.log('Database service initialized with Supabase');
  }

  /**
   * Get all currently available apartments from database
   */
  async getActiveApartments(): Promise<ApartmentRecord[]> {
    const { data, error } = await this.supabase
      .from('apartments')
      .select('*');

    if (error) {
      throw new Error(`Failed to fetch active apartments: ${error.message}`);
    }

    return data || [];
  }

  /**
   * Find units that are new (not in database) or newly available
   */
  async findNewUnits(scrapedUnits: Apartment[]): Promise<Apartment[]> {
    const existingUnits = await this.getActiveApartments();
    const existingUnitNumbers = new Set(existingUnits.map(unit => unit.unit_number));

    return scrapedUnits.filter(unit => !existingUnitNumbers.has(unit.unitNumber));
  }

  /**
   * Update apartments table with scraped data using upsert
   */
  async updateApartments(apartments: Apartment[]): Promise<void> {
    const records: Omit<ApartmentRecord, 'id' | 'created_at' | 'updated_at'>[] = apartments.map(apt => ({
      unit_number: apt.unitNumber,
      floorplan_name: apt.floorplanName,
      bedroom_count: apt.bedroomCount,
      rent: apt.rent,
      availability_date: apt.availabilityDate?.toISOString().split('T')[0] || null,
      last_seen: new Date().toISOString(),
      first_seen: new Date().toISOString()
    }));

    const { error } = await this.supabase
      .from('apartments')
      .upsert(records, {
        onConflict: 'unit_number',
        ignoreDuplicates: false
      });

    if (error) {
      throw new Error(`Failed to update apartments: ${error.message}`);
    }

    console.log(`Updated ${records.length} apartment records`);
  }

  /**
   * Remove units that were not found in latest scrape (they're no longer available)
   */
  async removeUnavailableUnits(currentUnitNumbers: string[]): Promise<void> {
    if (currentUnitNumbers.length === 0) {
      console.log('No current units to keep - removing all records');
      const { error } = await this.supabase
        .from('apartments')
        .delete()
        .neq('id', 0); // Delete all records
      
      if (error) {
        throw new Error(`Failed to remove unavailable units: ${error.message}`);
      }
      return;
    }

    const { error } = await this.supabase
      .from('apartments')
      .delete()
      .not('unit_number', 'in', `(${currentUnitNumbers.map(num => `"${num}"`).join(',')})`);

    if (error) {
      throw new Error(`Failed to remove unavailable units: ${error.message}`);
    }

    console.log('Removed units no longer available');
  }

  /**
   * Log scraping session results
   */
  async logScrapeRun(log: Omit<ScrapeLog, 'id' | 'created_at'>): Promise<void> {
    const { error } = await this.supabase
      .from('scraping_logs')
      .insert(log);

    if (error) {
      throw new Error(`Failed to log scrape run: ${error.message}`);
    }

    console.log(`Logged scrape run: ${log.status} - ${log.units_found} units found, ${log.new_units} new`);
  }

  /**
   * Test database connection
   */
  async testConnection(): Promise<boolean> {
    try {
      const { error } = await this.supabase
        .from('apartments')
        .select('id')
        .limit(1);

      if (error) {
        console.error('Database connection test failed:', error.message);
        return false;
      }

      console.log('Database connection test successful');
      return true;
    } catch (error) {
      console.error('Database connection test failed:', error);
      return false;
    }
  }
}