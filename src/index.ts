import dotenv from 'dotenv';
import { ScrapeWorker } from './workers/scrapeWorker';
import { ScrapeJobScheduler } from './jobs/scrapeJob';

// Load environment variables
dotenv.config();

/**
 * Main application entry point
 * Starts the BullMQ worker and job scheduler for apartment scraping
 */
class ApartmentCrawlerApp {
  private worker: ScrapeWorker;
  private scheduler: ScrapeJobScheduler;
  private isShuttingDown = false;

  constructor() {
    this.worker = new ScrapeWorker();
    this.scheduler = new ScrapeJobScheduler();
    
    this.setupGracefulShutdown();
  }

  /**
   * Start the application
   */
  async start(): Promise<void> {
    console.log('🏠 Starting Apartment Crawler Application...');
    console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);

    try {
      // Start scheduler first
      await this.scheduler.start();
      
      // Start worker
      await this.worker.start();
      
      // Add an immediate job to test the system
      if (process.env.NODE_ENV !== 'production') {
        console.log('Adding test scraping job...');
        await this.scheduler.addScrapeJob('startup-test');
      }

      console.log('✅ Apartment Crawler Application started successfully');
      console.log('Worker is ready to process scraping jobs every 2 hours');
      
      // Keep the process alive
      this.keepAlive();
      
    } catch (error) {
      console.error('❌ Failed to start application:', error);
      await this.shutdown();
      process.exit(1);
    }
  }

  /**
   * Set up graceful shutdown handlers
   */
  private setupGracefulShutdown(): void {
    const signals = ['SIGINT', 'SIGTERM', 'SIGQUIT'];
    
    signals.forEach(signal => {
      process.on(signal, async () => {
        if (this.isShuttingDown) {
          console.log(`Received ${signal} again, forcing exit...`);
          process.exit(1);
        }
        
        console.log(`\nReceived ${signal}, starting graceful shutdown...`);
        this.isShuttingDown = true;
        await this.shutdown();
      });
    });

    // Handle uncaught exceptions
    process.on('uncaughtException', async (error) => {
      console.error('Uncaught Exception:', error);
      await this.shutdown();
      process.exit(1);
    });

    // Handle unhandled promise rejections
    process.on('unhandledRejection', async (reason, promise) => {
      console.error('Unhandled Rejection at:', promise, 'reason:', reason);
      await this.shutdown();
      process.exit(1);
    });
  }

  /**
   * Keep the application alive
   */
  private keepAlive(): void {
    // Log health status every 30 minutes
    const healthCheckInterval = setInterval(async () => {
      if (this.isShuttingDown) {
        clearInterval(healthCheckInterval);
        return;
      }

      try {
        const [workerHealthy, schedulerHealthy] = await Promise.all([
          this.worker.healthCheck(),
          this.scheduler.healthCheck()
        ]);

        if (workerHealthy && schedulerHealthy) {
          console.log('💚 Health check passed - Application running normally');
          
          // Log queue stats
          const stats = await this.scheduler.getQueueStats();
          console.log(`Queue stats - Waiting: ${stats.waiting}, Active: ${stats.active}, Completed: ${stats.completed}, Failed: ${stats.failed}`);
        } else {
          console.warn('⚠️  Health check warning - Some components unhealthy');
          console.log(`Worker healthy: ${workerHealthy}, Scheduler healthy: ${schedulerHealthy}`);
        }
      } catch (error) {
        console.error('❌ Health check failed:', error);
      }
    }, 30 * 60 * 1000); // 30 minutes

    // Clean up old jobs daily
    const cleanupInterval = setInterval(async () => {
      if (this.isShuttingDown) {
        clearInterval(cleanupInterval);
        return;
      }

      try {
        await this.scheduler.cleanOldJobs();
      } catch (error) {
        console.error('Failed to clean old jobs:', error);
      }
    }, 24 * 60 * 60 * 1000); // 24 hours
  }

  /**
   * Shutdown the application gracefully
   */
  async shutdown(): Promise<void> {
    console.log('🔄 Shutting down Apartment Crawler Application...');
    
    try {
      await Promise.all([
        this.worker.shutdown(),
        this.scheduler.shutdown()
      ]);
      
      console.log('✅ Application shutdown complete');
    } catch (error) {
      console.error('❌ Error during shutdown:', error);
    }
  }

  /**
   * Get application status
   */
  async getStatus(): Promise<{
    worker: boolean;
    scheduler: boolean;
    queueStats: any;
    recentJobs: any[];
  }> {
    const [workerHealthy, schedulerHealthy, queueStats, recentJobs] = await Promise.all([
      this.worker.healthCheck(),
      this.scheduler.healthCheck(),
      this.scheduler.getQueueStats(),
      this.scheduler.getRecentJobs(5)
    ]);

    return {
      worker: workerHealthy,
      scheduler: schedulerHealthy,
      queueStats,
      recentJobs
    };
  }
}

// Start the application if this file is run directly
if (require.main === module) {
  const app = new ApartmentCrawlerApp();
  app.start().catch((error) => {
    console.error('Failed to start application:', error);
    process.exit(1);
  });
}

export { ApartmentCrawlerApp };