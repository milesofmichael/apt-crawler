"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const notifications_1 = require("../../src/services/notifications");
// Mock Twilio client
const mockTwilioClient = {
    messages: {
        create: jest.fn()
    }
};
// Mock the twilio function
jest.mock('twilio', () => {
    return jest.fn(() => mockTwilioClient);
});
describe('NotificationService', () => {
    let notificationService;
    beforeEach(() => {
        jest.clearAllMocks();
        notificationService = new notifications_1.NotificationService();
    });
    describe('constructor', () => {
        it('should throw error if environment variables are missing', () => {
            const originalSid = process.env.TWILIO_ACCOUNT_SID;
            const originalToken = process.env.TWILIO_AUTH_TOKEN;
            const originalFromNumber = process.env.TWILIO_PHONE_NUMBER;
            const originalToNumber = process.env.MY_PHONE_NUMBER;
            process.env.TWILIO_ACCOUNT_SID = '';
            process.env.TWILIO_AUTH_TOKEN = '';
            process.env.TWILIO_PHONE_NUMBER = '';
            process.env.MY_PHONE_NUMBER = '';
            expect(() => new notifications_1.NotificationService()).toThrow('Missing required Twilio environment variables');
            // Restore environment variables
            process.env.TWILIO_ACCOUNT_SID = originalSid;
            process.env.TWILIO_AUTH_TOKEN = originalToken;
            process.env.TWILIO_PHONE_NUMBER = originalFromNumber;
            process.env.MY_PHONE_NUMBER = originalToNumber;
        });
    });
    describe('sendNewApartmentSMS', () => {
        const mockApartment = {
            unitNumber: 'WEST-641',
            floorplanName: 'The Dellwood',
            floorplanUrl: 'https://flatsatpcm.com/floorplans/the-dellwood/',
            bedroomCount: 1,
            rent: 1991,
            availabilityDate: new Date('2024-09-28'),
            isAvailable: true
        };
        it('should send SMS for single apartment', async () => {
            mockTwilioClient.messages.create.mockResolvedValue({ sid: 'test-sid-123' });
            await notificationService.sendNewApartmentSMS([mockApartment]);
            expect(mockTwilioClient.messages.create).toHaveBeenCalledWith({
                body: expect.stringContaining('New 1BR available!'),
                from: process.env.TWILIO_PHONE_NUMBER,
                to: process.env.MY_PHONE_NUMBER
            });
            const callArgs = mockTwilioClient.messages.create.mock.calls[0][0];
            expect(callArgs.body).toContain('WEST-641: $1,991/mo');
            expect(callArgs.body).toMatch(/Available: 9\/(27|28)/); // Date might vary by timezone
            expect(callArgs.body).toContain('https://flatsatpcm.com/floorplans/the-dellwood/');
        });
        it('should send SMS for studio apartment', async () => {
            const studioApartment = {
                ...mockApartment,
                bedroomCount: 0,
                unitNumber: 'STUDIO-101'
            };
            mockTwilioClient.messages.create.mockResolvedValue({ sid: 'test-sid-456' });
            await notificationService.sendNewApartmentSMS([studioApartment]);
            const callArgs = mockTwilioClient.messages.create.mock.calls[0][0];
            expect(callArgs.body).toContain('New Studio available!');
            expect(callArgs.body).toContain('STUDIO-101');
            expect(callArgs.body).toMatch(/Available: 9\/(27|28)/);
        });
        it('should send SMS for multiple apartments', async () => {
            const apartments = [
                mockApartment,
                {
                    ...mockApartment,
                    unitNumber: 'EAST-502',
                    bedroomCount: 0,
                    rent: 1750,
                    availabilityDate: new Date('2024-10-01')
                }
            ];
            mockTwilioClient.messages.create.mockResolvedValue({ sid: 'test-sid-789' });
            await notificationService.sendNewApartmentSMS(apartments);
            const callArgs = mockTwilioClient.messages.create.mock.calls[0][0];
            expect(callArgs.body).toContain('🏠 2 new apartments available!');
            expect(callArgs.body).toContain('1BR WEST-641: $1,991');
            expect(callArgs.body).toContain('Studio EAST-502: $1,750');
            expect(callArgs.body).toContain('View all: https://flatsatpcm.com/floorplans/');
        });
        it('should handle apartment with no availability date', async () => {
            const apartmentNoDate = {
                ...mockApartment,
                availabilityDate: null
            };
            mockTwilioClient.messages.create.mockResolvedValue({ sid: 'test-sid-999' });
            await notificationService.sendNewApartmentSMS([apartmentNoDate]);
            const callArgs = mockTwilioClient.messages.create.mock.calls[0][0];
            expect(callArgs.body).toContain('Available: Date TBD');
        });
        it('should do nothing when no apartments provided', async () => {
            const consoleSpy = jest.spyOn(console, 'log').mockImplementation();
            await notificationService.sendNewApartmentSMS([]);
            expect(consoleSpy).toHaveBeenCalledWith('No new apartments to notify about');
            expect(mockTwilioClient.messages.create).not.toHaveBeenCalled();
            consoleSpy.mockRestore();
        });
        it('should throw error on SMS sending failure', async () => {
            mockTwilioClient.messages.create.mockRejectedValue(new Error('SMS failed'));
            await expect(notificationService.sendNewApartmentSMS([mockApartment]))
                .rejects.toThrow('SMS sending failed: Error: SMS failed');
        });
        it('should format rent with proper thousands separator', async () => {
            const expensiveApartment = {
                ...mockApartment,
                rent: 2500
            };
            mockTwilioClient.messages.create.mockResolvedValue({ sid: 'test-sid-format' });
            await notificationService.sendNewApartmentSMS([expensiveApartment]);
            const callArgs = mockTwilioClient.messages.create.mock.calls[0][0];
            expect(callArgs.body).toMatch(/Available: 9\/(27|28)/);
            expect(callArgs.body).toContain('$2,500/mo');
        });
    });
    describe('sendErrorNotification', () => {
        it('should send error notification successfully', async () => {
            mockTwilioClient.messages.create.mockResolvedValue({ sid: 'error-sid-123' });
            await notificationService.sendErrorNotification('Database connection failed', 'scraping job');
            expect(mockTwilioClient.messages.create).toHaveBeenCalledWith({
                body: expect.stringContaining('🚨 Apartment Crawler Error'),
                from: process.env.TWILIO_PHONE_NUMBER,
                to: process.env.MY_PHONE_NUMBER
            });
            const callArgs = mockTwilioClient.messages.create.mock.calls[0][0];
            expect(callArgs.body).toContain('Context: scraping job');
            expect(callArgs.body).toContain('Error: Database connection failed');
        });
        it('should send error notification without context', async () => {
            mockTwilioClient.messages.create.mockResolvedValue({ sid: 'error-sid-456' });
            await notificationService.sendErrorNotification('Generic error');
            const callArgs = mockTwilioClient.messages.create.mock.calls[0][0];
            expect(callArgs.body).toContain('🚨 Apartment Crawler Error');
            expect(callArgs.body).toContain('Error: Generic error');
            expect(callArgs.body).not.toContain('Context:');
        });
        it('should not throw error if SMS sending fails', async () => {
            const consoleSpy = jest.spyOn(console, 'error').mockImplementation();
            mockTwilioClient.messages.create.mockRejectedValue(new Error('SMS service down'));
            await expect(notificationService.sendErrorNotification('Test error'))
                .resolves.not.toThrow();
            expect(consoleSpy).toHaveBeenCalledWith('Failed to send error notification SMS:', expect.any(Error));
            consoleSpy.mockRestore();
        });
    });
    describe('testSMS', () => {
        it('should send test SMS successfully', async () => {
            mockTwilioClient.messages.create.mockResolvedValue({ sid: 'test-sms-sid' });
            const result = await notificationService.testSMS();
            expect(result).toBe(true);
            expect(mockTwilioClient.messages.create).toHaveBeenCalledWith({
                body: '🧪 Apartment Crawler test message - SMS is working!',
                from: process.env.TWILIO_PHONE_NUMBER,
                to: process.env.MY_PHONE_NUMBER
            });
        });
        it('should return false on test SMS failure', async () => {
            const consoleSpy = jest.spyOn(console, 'error').mockImplementation();
            mockTwilioClient.messages.create.mockRejectedValue(new Error('Test failed'));
            const result = await notificationService.testSMS();
            expect(result).toBe(false);
            expect(consoleSpy).toHaveBeenCalledWith('Test SMS failed:', expect.any(Error));
            consoleSpy.mockRestore();
        });
    });
    describe('private methods', () => {
        describe('formatDate', () => {
            it('should format date correctly', () => {
                // Access private method through type assertion
                const service = notificationService;
                const date = new Date('2024-09-28T12:00:00Z'); // Use specific time to avoid timezone issues
                const formatted = service.formatDate(date);
                // Check that format is M/D pattern, account for timezone differences
                expect(formatted).toMatch(/^9\/(27|28)$/);
            });
            it('should handle single digit dates', () => {
                const service = notificationService;
                const date = new Date('2024-01-05T12:00:00Z'); // Use specific time to avoid timezone issues
                const formatted = service.formatDate(date);
                // Check that format is M/D pattern, account for timezone differences  
                expect(formatted).toMatch(/^1\/(4|5)$/);
            });
        });
    });
});
