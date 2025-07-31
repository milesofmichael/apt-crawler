import { Worker, Job } from 'bullmq';
import IORedis from 'ioredis';
import { ScraperService } from '../services/scraper';
import { DatabaseService } from '../services/database';
import { NotificationService } from '../services/notifications';

/**
 * BullMQ worker for processing apartment scraping jobs
 */
export class ScrapeWorker {
  private worker: Worker;
  private redis: IORedis;
  private scraperService: ScraperService;
  private databaseService: DatabaseService;
  private notificationService: NotificationService;

  constructor() {
    const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';
    
    // Initialize Redis connection
    this.redis = new IORedis(redisUrl, {
      maxRetriesPerRequest: null, // Required for BullMQ blocking operations
      lazyConnect: true
    });

    // Initialize services
    this.scraperService = new ScraperService();
    this.databaseService = new DatabaseService();
    this.notificationService = new NotificationService();

    // Create BullMQ worker
    this.worker = new Worker('apartment-scraping', this.processJob.bind(this), {
      connection: this.redis,
      concurrency: 1,
      maxStalledCount: 3,              // Retry stalled jobs up to 3 times
      stalledInterval: 30 * 1000,      // Check for stalled jobs every 30 seconds  
      lockDuration: 10 * 60 * 1000,    // Lock duration: 10 minutes (job timeout)
    });

    this.setupEventHandlers();
    console.log('Scrape worker initialized');
  }

  /**
   * Process a scraping job
   */
  private async processJob(job: Job): Promise<void> {
    const startTime = new Date().toISOString();
    console.log(`Starting scraping job ${job.id} at ${startTime}`);

    try {
      // Update job progress
      await job.updateProgress(10);

      // Run scraper
      console.log('Running apartment scraper...');
      const scrapedApartments = await this.scraperService.run();
      console.log(`Scraper found ${scrapedApartments.length} available units`);

      await job.updateProgress(40);

      // Find new units
      console.log('Checking for new units...');
      const newUnits = await this.databaseService.findNewUnits(scrapedApartments);
      console.log(`Found ${newUnits.length} new units`);

      await job.updateProgress(60);

      // Send notifications for new units
      if (newUnits.length > 0) {
        console.log('Sending notifications for new units...');
        await this.notificationService.sendNewApartmentNotification(newUnits);
      }

      await job.updateProgress(80);

      // Update database
      console.log('Updating database...');
      await this.databaseService.updateApartments(scrapedApartments);
      
      // Mark units no longer available as unavailable
      const currentUnitNumbers = scrapedApartments.map(apt => apt.unitNumber);
      await this.databaseService.removeUnavailableUnits(currentUnitNumbers);

      await job.updateProgress(95);

      // Log scraping session
      const completedTime = new Date().toISOString();
      await this.databaseService.logScrapeRun({
        started_at: startTime,
        completed_at: completedTime,
        units_found: scrapedApartments.length,
        new_units: newUnits.length,
        status: 'completed'
      });

      await job.updateProgress(100);
      console.log(`Scraping job ${job.id} completed successfully`);

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      console.error(`Scraping job ${job.id} failed:`, errorMessage);

      // Log failed scraping session
      try {
        await this.databaseService.logScrapeRun({
          started_at: startTime,
          completed_at: new Date().toISOString(),
          units_found: 0,
          new_units: 0,
          errors: errorMessage,
          status: 'failed'
        });

        // Send error notification
        await this.notificationService.sendErrorNotification(
          errorMessage,
          `scraping job ${job.id}`
        );
      } catch (logError) {
        console.error('Failed to log error or send notification:', logError);
      }

      throw error; // Re-throw to mark job as failed
    }
  }

  /**
   * Set up event handlers for the worker
   */
  private setupEventHandlers(): void {
    this.worker.on('completed', (job) => {
      console.log(`Job ${job.id} completed successfully`);
    });

    this.worker.on('failed', (job, err) => {
      console.error(`Job ${job?.id} failed:`, err.message);
    });

    this.worker.on('error', (err) => {
      console.error('Worker error:', err);
    });

    this.worker.on('stalled', (jobId) => {
      console.warn(`Job ${jobId} stalled`);
    });

    // Handle graceful shutdown
    process.on('SIGINT', this.shutdown.bind(this));
    process.on('SIGTERM', this.shutdown.bind(this));
  }

  /**
   * Start the worker
   */
  async start(): Promise<void> {
    console.log('Starting scrape worker...');
    // Worker automatically starts processing when created
    // Just wait for Redis connection
    await this.redis.ping();
    console.log('Scrape worker started and connected to Redis');
  }

  /**
   * Gracefully shutdown the worker
   */
  async shutdown(): Promise<void> {
    console.log('Shutting down scrape worker...');
    
    try {
      await this.worker.close();
      await this.redis.disconnect();
      console.log('Scrape worker shutdown complete');
    } catch (error) {
      console.error('Error during worker shutdown:', error);
    }
    
    process.exit(0);
  }

  /**
   * Check worker health
   */
  async healthCheck(): Promise<boolean> {
    try {
      await this.redis.ping();
      return !this.worker.closing;
    } catch (error) {
      console.error('Worker health check failed:', error);
      return false;
    }
  }
}