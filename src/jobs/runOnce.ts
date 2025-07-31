import dotenv from 'dotenv';
import { ScraperService } from '../services/scraper';
import { DatabaseService } from '../services/database';
import { NotificationService } from '../services/notifications';

// Load environment variables
dotenv.config();

/**
 * Run apartment scraping once (for manual testing or cron jobs)
 */
async function runOnce(): Promise<void> {
  console.log('Starting one-time apartment scraping...');
  const startTime = new Date().toISOString();

  let scraperService: ScraperService | null = null;
  let databaseService: DatabaseService | null = null;
  let notificationService: NotificationService | null = null;

  try {
    // Initialize services
    scraperService = new ScraperService();
    databaseService = new DatabaseService();
    notificationService = new NotificationService();

    // Test database connection
    console.log('Testing database connection...');
    const dbHealthy = await databaseService.testConnection();
    if (!dbHealthy) {
      throw new Error('Database connection failed');
    }

    // Run scraper
    console.log('Running apartment scraper...');
    const scrapedApartments = await scraperService.run();
    console.log(`Scraper found ${scrapedApartments.length} available units`);

    if (scrapedApartments.length === 0) {
      console.log('No apartments found - this might indicate a scraping issue');
    }

    // Find new units
    console.log('Checking for new units...');
    const newUnits = await databaseService.findNewUnits(scrapedApartments);
    console.log(`Found ${newUnits.length} new units`);

    // Send notifications for new units
    if (newUnits.length > 0) {
      console.log('Sending notifications for new units...');
      await notificationService.sendNewApartmentNotification(newUnits);
      console.log('Notifications sent successfully');
    } else {
      console.log('No new units found - no notifications sent');
    }

    // Update database
    console.log('Updating database...');
    if (scrapedApartments.length > 0) {
      await databaseService.updateApartments(scrapedApartments);
      
      // Mark units no longer available as unavailable
      const currentUnitNumbers = scrapedApartments.map(apt => apt.unitNumber);
      await databaseService.removeUnavailableUnits(currentUnitNumbers);
    }

    // Log scraping session
    const completedTime = new Date().toISOString();
    await databaseService.logScrapeRun({
      started_at: startTime,
      completed_at: completedTime,
      units_found: scrapedApartments.length,
      new_units: newUnits.length,
      status: 'completed'
    });

    console.log('✅ One-time scraping completed successfully');
    
    // Print summary
    console.log('\n=== SCRAPING SUMMARY ===');
    console.log(`Total units found: ${scrapedApartments.length}`);
    console.log(`New units: ${newUnits.length}`);
    if (newUnits.length > 0) {
      console.log('\nNew units details:');
      newUnits.forEach(unit => {
        const bedroomLabel = unit.bedroomCount === 0 ? 'Studio' : `${unit.bedroomCount}BR`;
        const dateStr = unit.availabilityDate 
          ? unit.availabilityDate.toLocaleDateString()
          : 'TBD';
        console.log(`  - ${bedroomLabel} ${unit.unitNumber}: $${unit.rent}/mo (Available: ${dateStr})`);
      });
    }
    console.log('========================\n');

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('❌ One-time scraping failed:', errorMessage);

    try {
      // Log failed scraping session
      if (databaseService) {
        await databaseService.logScrapeRun({
          started_at: startTime,
          completed_at: new Date().toISOString(),
          units_found: 0,
          new_units: 0,
          errors: errorMessage,
          status: 'failed'
        });
      }

      // Send error notification
      if (notificationService) {
        await notificationService.sendErrorNotification(
          errorMessage,
          'one-time scraping job'
        );
      }
    } catch (logError) {
      console.error('Failed to log error or send notification:', logError);
    }

    process.exit(1);
  }
}

// Run if this file is executed directly (check if we're running this file directly)
const isMainModule = process.argv[1] && process.argv[1].includes('runOnce.ts');
if (isMainModule) {
  runOnce()
    .then(() => {
      console.log('Script completed');
      process.exit(0);
    })
    .catch((error) => {
      console.error('Script failed:', error);
      process.exit(1);
    });
}

export { runOnce };