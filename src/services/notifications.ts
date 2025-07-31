import { Apartment } from '../types/apartment';

/**
 * Push notification service using ntfy.sh
 */
export class NotificationService {
  private ntfyTopic: string;
  private ntfyServer: string;

  constructor() {
    const ntfyTopic = process.env.NTFY_TOPIC;
    const ntfyServer = process.env.NTFY_SERVER || 'https://ntfy.sh';

    if (!ntfyTopic) {
      throw new Error('Missing required NTFY_TOPIC environment variable');
    }

    this.ntfyTopic = ntfyTopic;
    this.ntfyServer = ntfyServer;
    
    console.log(`Notification service initialized with ntfy topic: ${ntfyTopic}`);
  }

  /**
   * Send push notification for new apartment availability
   */
  async sendNewApartmentNotification(apartments: Apartment[]): Promise<void> {
    if (apartments.length === 0) {
      console.log('No new apartments to notify about');
      return;
    }

    try {
      const { title, message } = apartments.length === 1 
        ? this.formatSingleApartmentNotification(apartments[0])
        : this.formatMultipleApartmentsNotification(apartments);

      console.log('Sending ntfy notification:', { title, message });

      const response = await fetch(`${this.ntfyServer}/${this.ntfyTopic}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          topic: this.ntfyTopic,
          title: title,
          message: message,
          tags: ['house', 'apartment'],
          priority: 4, // High priority
          actions: apartments.length === 1 ? [
            {
              action: 'view',
              label: 'View Floorplan',
              url: 'https://flatsatpcm.com/floorplans/'
            }
          ] : [
            {
              action: 'view', 
              label: 'View All',
              url: 'https://flatsatpcm.com/floorplans/'
            }
          ]
        })
      });

      if (!response.ok) {
        throw new Error(`ntfy request failed: ${response.status} ${response.statusText}`);
      }

      console.log('Notification sent successfully');

    } catch (error) {
      console.error('Failed to send ntfy notification:', error);
      throw new Error(`Notification sending failed: ${error}`);
    }
  }

  /**
   * Format notification for a single apartment
   */
  private formatSingleApartmentNotification(apartment: Apartment): { title: string; message: string } {
    const dateStr = apartment.availabilityDate 
      ? this.formatDateForMessage(apartment.availabilityDate)
      : 'Date TBD';

    const title = 'New Unit Available';
    const message = `${apartment.floorplanName} - #${apartment.unitNumber} - $${apartment.rent.toLocaleString()} - Available ${dateStr}`;

    return { title, message };
  }

  /**
   * Format notification for multiple apartments
   */
  private formatMultipleApartmentsNotification(apartments: Apartment[]): { title: string; message: string } {
    const title = `${apartments.length} New Units Available`;
    
    if (apartments.length <= 3) {
      // For 3 or fewer units, show each one on a separate line
      const unitLines = apartments.map(apt => {
        const dateStr = apt.availabilityDate 
          ? this.formatDateForMessage(apt.availabilityDate)
          : 'TBD';
        
        return `${apt.floorplanName} - #${apt.unitNumber} - $${apt.rent.toLocaleString()} - Available ${dateStr}`;
      }).join(' | ');

      return { title, message: unitLines };
    } else {
      // For more than 3 units, show a summary
      const studios = apartments.filter(apt => apt.bedroomCount === 0).length;
      const oneBedrooms = apartments.filter(apt => apt.bedroomCount === 1).length;
      const unitSummary = [
        studios > 0 ? `${studios} studio${studios > 1 ? 's' : ''}` : '',
        oneBedrooms > 0 ? `${oneBedrooms} 1BR${oneBedrooms > 1 ? 's' : ''}` : ''
      ].filter(Boolean).join(', ');

      const message = `${unitSummary} - View all at flatsatpcm.com/floorplans`;
      return { title, message };
    }
  }

  /**
   * Format date for notification display (MM/DD format)
   */
  private formatDate(date: Date): string {
    const month = date.getMonth() + 1;
    const day = date.getDate();
    return `${month}/${day}`;
  }

  /**
   * Format date for message display (MMM DD format)
   */
  private formatDateForMessage(date: Date): string {
    const month = date.toLocaleDateString('en-US', { month: 'short' });
    const day = date.getDate().toString().padStart(2, '0');
    return `${month} ${day}`;
  }

  /**
   * Send error notification to admin
   */
  async sendErrorNotification(error: string, context?: string): Promise<void> {
    try {
      const title = '🚨 Apartment Crawler Error';
      const message = `${context ? `Context: ${context}\n` : ''}Error: ${error}`;

      const response = await fetch(`${this.ntfyServer}/${this.ntfyTopic}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          topic: this.ntfyTopic,
          title: title,
          message: message,
          tags: ['warning', 'error'],
          priority: 5 // Max priority for errors
        })
      });

      if (!response.ok) {
        throw new Error(`ntfy error notification failed: ${response.status}`);
      }

      console.log('Error notification sent successfully');

    } catch (ntfyError) {
      console.error('Failed to send error notification:', ntfyError);
      // Don't throw here to avoid cascading failures
    }
  }

  /**
   * Test notification functionality
   */
  async testNotification(): Promise<boolean> {
    try {
      const title = '🧪 Test Notification';
      const message = 'Apartment Crawler notification system is working!';
      
      const response = await fetch(`${this.ntfyServer}/${this.ntfyTopic}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          topic: this.ntfyTopic,
          title: title,
          message: message,
          tags: ['test'],
          priority: 3
        })
      });

      if (!response.ok) {
        throw new Error(`Test notification failed: ${response.status}`);
      }

      console.log('Test notification sent successfully');
      return true;

    } catch (error) {
      console.error('Test notification failed:', error);
      return false;
    }
  }

  /**
   * Send summary notification with statistics
   */
  async sendSummaryNotification(stats: {
    totalUnits: number;
    newUnits: number;
    studios: number;
    oneBedrooms: number;
  }): Promise<void> {
    try {
      const title = '📊 Scraping Summary';
      const message = `Scan complete:
• ${stats.totalUnits} total units found
• ${stats.newUnits} new units
• ${stats.studios} studios, ${stats.oneBedrooms} 1-bedrooms

${stats.newUnits > 0 ? 'New units notification sent!' : 'No new units found'}`;

      await fetch(`${this.ntfyServer}/${this.ntfyTopic}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          topic: this.ntfyTopic,
          title: title,
          message: message,
          tags: ['chart_with_upwards_trend'],
          priority: 2 // Low priority for summaries
        })
      });

      console.log('Summary notification sent');

    } catch (error) {
      console.error('Failed to send summary notification:', error);
      // Don't throw - summaries are optional
    }
  }
}