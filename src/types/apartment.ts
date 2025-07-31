/**
 * Represents an apartment unit stored in the database
 */
export interface Apartment {
  unitNumber: string;
  floorplanName: string;
  bedroomCount: number;
  rent: number;
  availabilityDate: Date | null;
}

/**
 * Raw data structure from web scraping before processing
 */
export interface ScrapedUnit {
  unitNumber: string;
  rent: string;
  availabilityDate: string;
  floorplanName: string;
  bedroomCount: number;
}

/**
 * Database record structure matching Supabase table
 */
export interface ApartmentRecord {
  id?: number;
  unit_number: string;
  floorplan_name: string;
  bedroom_count: number;
  rent: number;
  availability_date: string | null;
  last_seen: string;
  first_seen: string;
  created_at?: string;
  updated_at?: string;
}

/**
 * Scraping session log record
 */
export interface ScrapeLog {
  id?: string;
  started_at: string;
  completed_at?: string;
  units_found: number;
  new_units: number;
  errors?: string;
  status: 'running' | 'completed' | 'failed';
  created_at?: string;
}