import { Queue } from 'bullmq';
import IORedis from 'ioredis';

/**
 * Job scheduler for apartment scraping tasks
 */
export class ScrapeJobScheduler {
  private queue: Queue;
  private redis: IORedis;

  constructor() {
    const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';
    
    // Initialize Redis connection
    this.redis = new IORedis(redisUrl, {
      maxRetriesPerRequest: null, // Required for BullMQ blocking operations
      lazyConnect: true
    });

    // Initialize BullMQ queue
    this.queue = new Queue('apartment-scraping', {
      connection: this.redis,
      defaultJobOptions: {
        removeOnComplete: 50,
        removeOnFail: 20,
        attempts: 3,
        backoff: {
          type: 'exponential',
          delay: 60000, // Start with 1 minute delay
        },
        delay: 0
      }
    });

    console.log('Scrape job scheduler initialized');
  }

  /**
   * Add a one-time scraping job
   */
  async addScrapeJob(jobId?: string): Promise<void> {
    const job = await this.queue.add(
      'scrape-apartments',
      {},
      {
        jobId: jobId || `scrape-${Date.now()}`,
        delay: 0,
        attempts: 2,
        backoff: {
          type: 'exponential',
          delay: 30000, // 30 seconds
        },
        removeOnComplete: 5,
        removeOnFail: 3
      }
    );

    console.log(`Added scraping job ${job.id}`);
  }

  /**
   * Schedule recurring scraping jobs (every 2 hours)
   */
  async scheduleRecurringJobs(): Promise<void> {
    // Remove any existing recurring jobs first
    await this.removeRecurringJobs();

    // Add recurring job - every 2 hours
    const job = await this.queue.add(
      'scrape-apartments',
      {},
      {
        repeat: {
          pattern: '0 */2 * * *', // Every 2 hours at minute 0
          tz: 'America/New_York' // Adjust timezone as needed
        },
        jobId: 'recurring-scrape',
        attempts: 2,
        backoff: {
          type: 'exponential',
          delay: 30000, // 30 seconds
        }
      }
    );

    console.log(`Scheduled recurring scraping job: ${job.id}`);
  }

  /**
   * Remove recurring scraping jobs
   */
  async removeRecurringJobs(): Promise<void> {
    const repeatableJobs = await this.queue.getRepeatableJobs();
    
    for (const job of repeatableJobs) {
      if (job.name === 'scrape-apartments') {
        await this.queue.removeRepeatableByKey(job.key);
        console.log(`Removed recurring job: ${job.key}`);
      }
    }
  }

  /**
   * Get queue statistics
   */
  async getQueueStats(): Promise<{
    waiting: number;
    active: number;
    completed: number;
    failed: number;
    delayed: number;
  }> {
    const [waiting, active, completed, failed, delayed] = await Promise.all([
      this.queue.getWaiting(),
      this.queue.getActive(),
      this.queue.getCompleted(),
      this.queue.getFailed(),
      this.queue.getDelayed()
    ]);

    return {
      waiting: waiting.length,
      active: active.length,
      completed: completed.length,
      failed: failed.length,
      delayed: delayed.length
    };
  }

  /**
   * Get recent job history
   */
  async getRecentJobs(limit: number = 10): Promise<Array<{
    id: string;
    name: string;
    status: string;
    timestamp: Date;
    progress?: number;
    error?: string;
  }>> {
    const [completed, failed, active] = await Promise.all([
      this.queue.getCompleted(0, limit),
      this.queue.getFailed(0, limit),
      this.queue.getActive()
    ]);

    const jobs = [
      ...completed.map(job => ({
        id: job.id!,
        name: job.name,
        status: 'completed',
        timestamp: new Date(job.finishedOn!),
        progress: 100
      })),
      ...failed.map(job => ({
        id: job.id!,
        name: job.name,
        status: 'failed',
        timestamp: new Date(job.failedReason ? job.processedOn! : job.timestamp),
        error: job.failedReason
      })),
      ...active.map(job => ({
        id: job.id!,
        name: job.name,
        status: 'active',
        timestamp: new Date(job.processedOn!),
        progress: job.progress
      }))
    ];

    // Sort by timestamp descending
    return jobs
      .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime())
      .slice(0, limit);
  }

  /**
   * Clean up old jobs
   */
  async cleanOldJobs(): Promise<void> {
    const oneWeekAgo = Date.now() - (7 * 24 * 60 * 60 * 1000);
    
    await Promise.all([
      this.queue.clean(oneWeekAgo, 100, 'completed'),
      this.queue.clean(oneWeekAgo, 50, 'failed')
    ]);

    console.log('Cleaned up old jobs');
  }

  /**
   * Start the scheduler
   */
  async start(): Promise<void> {
    console.log('Starting job scheduler...');
    
    // Test Redis connection
    await this.redis.ping();
    
    // Schedule recurring jobs
    await this.scheduleRecurringJobs();
    
    console.log('Job scheduler started');
  }

  /**
   * Shutdown the scheduler
   */
  async shutdown(): Promise<void> {
    console.log('Shutting down job scheduler...');
    
    try {
      await this.queue.close();
      await this.redis.disconnect();
      console.log('Job scheduler shutdown complete');
    } catch (error) {
      console.error('Error during scheduler shutdown:', error);
    }
  }

  /**
   * Health check for the scheduler
   */
  async healthCheck(): Promise<boolean> {
    try {
      await this.redis.ping();
      return true;
    } catch (error) {
      console.error('Scheduler health check failed:', error);
      return false;
    }
  }
}