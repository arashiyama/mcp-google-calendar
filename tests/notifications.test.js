/**
 * Tests for notification system
 */

const notifications = require('../notifications');
const db = require('../db');
const fetch = require('node-fetch');

// Mock dependencies
jest.mock('../db');
jest.mock('node-fetch');
jest.mock('googleapis', () => ({
  google: {
    auth: {
      OAuth2: jest.fn().mockImplementation(() => ({
        setCredentials: jest.fn()
      }))
    },
    calendar: jest.fn().mockImplementation(() => ({
      events: {
        list: jest.fn()
      }
    }))
  }
}));

describe('Notifications', () => {
  beforeEach(() => {
    // Reset all mocks
    jest.clearAllMocks();
  });
  
  describe('sendNotification', () => {
    test('should send a notification to the webhook address', async () => {
      // Mock fetch to return a successful response
      fetch.mockResolvedValueOnce({
        ok: true,
        status: 200
      });
      
      // Test data
      const address = 'https://example.com/webhook';
      const data = {
        type: 'event_reminder',
        events: [
          {
            id: 'event123',
            summary: 'Test Event',
            start: { dateTime: '2025-03-15T10:00:00Z' }
          }
        ],
        timestamp: '2025-03-14T10:00:00Z'
      };
      
      // Call the function
      await notifications.sendNotification(address, data);
      
      // Verify fetch was called with correct arguments
      expect(fetch).toHaveBeenCalledWith(address, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(data),
      });
    });
    
    test('should throw an error when the notification fails', async () => {
      // Mock fetch to return a failed response
      fetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error'
      });
      
      // Test data
      const address = 'https://example.com/webhook';
      const data = { type: 'test' };
      
      // Call the function and expect it to throw
      await expect(notifications.sendNotification(address, data))
        .rejects.toThrow('Failed to send notification: 500 Internal Server Error');
    });
  });
  
  describe('processReminders', () => {
    test('should process and send reminders for upcoming events', async () => {
      // Setup test data
      const webhookId = 'webhook123';
      const webhook = {
        id: webhookId,
        address: 'https://example.com/webhook',
        expiration: Date.now() + 86400000 // 1 day in the future
      };
      
      const tokens = {
        access_token: 'fake-token',
        refresh_token: 'fake-refresh-token',
        expiry_date: Date.now() + 3600000 // 1 hour in the future
      };
      
      const upcomingEvents = {
        data: {
          items: [
            {
              id: 'event1',
              summary: 'Meeting 1',
              start: { dateTime: '2025-03-15T10:00:00Z' },
              end: { dateTime: '2025-03-15T11:00:00Z' },
              location: 'Conference Room',
              status: 'confirmed'
            },
            {
              id: 'event2', 
              summary: 'Meeting 2',
              start: { dateTime: '2025-03-15T14:00:00Z' },
              end: { dateTime: '2025-03-15T15:00:00Z' },
              status: 'confirmed'
            }
          ]
        }
      };
      
      // Mock db.getWebhook to return our test webhook
      db.getWebhook.mockResolvedValueOnce(webhook);
      
      // Mock db.loadTokens to return our test tokens
      db.loadTokens.mockResolvedValueOnce(tokens);
      
      // Mock google.calendar().events.list to return upcoming events
      require('googleapis').google.calendar().events.list.mockResolvedValueOnce(upcomingEvents);
      
      // Mock db.getRemindersSent to return empty array (no reminders sent yet)
      db.getRemindersSent.mockResolvedValueOnce([]);
      
      // Mock fetch to return a successful response
      fetch.mockResolvedValueOnce({
        ok: true,
        status: 200
      });
      
      // Call the function
      await notifications.processReminders(webhookId);
      
      // Verify the webhook was retrieved
      expect(db.getWebhook).toHaveBeenCalledWith(webhookId);
      
      // Verify tokens were loaded
      expect(db.loadTokens).toHaveBeenCalled();
      
      // Verify events were retrieved
      expect(require('googleapis').google.calendar().events.list).toHaveBeenCalled();
      
      // Verify the notification was sent
      expect(fetch).toHaveBeenCalled();
      const fetchCall = fetch.mock.calls[0];
      expect(fetchCall[0]).toBe(webhook.address);
      
      // Verify the request body contains the right events
      const requestBody = JSON.parse(fetchCall[1].body);
      expect(requestBody.type).toBe('event_reminder');
      expect(requestBody.events.length).toBe(2);
      expect(requestBody.events[0].id).toBe('event1');
      expect(requestBody.events[1].id).toBe('event2');
      
      // Verify reminders were marked as sent
      expect(db.saveReminderSent).toHaveBeenCalledTimes(2);
      expect(db.saveReminderSent).toHaveBeenCalledWith(webhookId, 'event1');
      expect(db.saveReminderSent).toHaveBeenCalledWith(webhookId, 'event2');
    });
    
    test('should skip events that already had reminders sent', async () => {
      // Setup test data
      const webhookId = 'webhook123';
      const webhook = {
        id: webhookId,
        address: 'https://example.com/webhook',
        expiration: Date.now() + 86400000
      };
      
      const tokens = {
        access_token: 'fake-token',
        refresh_token: 'fake-refresh-token',
        expiry_date: Date.now() + 3600000
      };
      
      const upcomingEvents = {
        data: {
          items: [
            {
              id: 'event1',
              summary: 'Meeting 1',
              start: { dateTime: '2025-03-15T10:00:00Z' },
              end: { dateTime: '2025-03-15T11:00:00Z' },
              status: 'confirmed'
            },
            {
              id: 'event2',
              summary: 'Meeting 2',
              start: { dateTime: '2025-03-15T14:00:00Z' },
              end: { dateTime: '2025-03-15T15:00:00Z' },
              status: 'confirmed'
            }
          ]
        }
      };
      
      // Mock db.getWebhook to return our test webhook
      db.getWebhook.mockResolvedValueOnce(webhook);
      
      // Mock db.loadTokens to return our test tokens
      db.loadTokens.mockResolvedValueOnce(tokens);
      
      // Mock google.calendar().events.list to return upcoming events
      require('googleapis').google.calendar().events.list.mockResolvedValueOnce(upcomingEvents);
      
      // Mock db.getRemindersSent to return that 'event1' already had reminders sent
      db.getRemindersSent.mockResolvedValueOnce(['event1']);
      
      // Mock fetch to return a successful response
      fetch.mockResolvedValueOnce({
        ok: true,
        status: 200
      });
      
      // Call the function
      await notifications.processReminders(webhookId);
      
      // Verify the notification was sent with only event2
      expect(fetch).toHaveBeenCalled();
      const fetchCall = fetch.mock.calls[0];
      
      // Verify the request body contains only event2
      const requestBody = JSON.parse(fetchCall[1].body);
      expect(requestBody.events.length).toBe(1);
      expect(requestBody.events[0].id).toBe('event2');
      
      // Verify only event2 was marked as sent
      expect(db.saveReminderSent).toHaveBeenCalledTimes(1);
      expect(db.saveReminderSent).toHaveBeenCalledWith(webhookId, 'event2');
    });
  });
  
  describe('startReminderService and stopReminderService', () => {
    // Override setInterval and clearInterval for testing
    const originalSetInterval = global.setInterval;
    const originalClearInterval = global.clearInterval;
    
    beforeEach(() => {
      global.setInterval = jest.fn().mockReturnValue(123);
      global.clearInterval = jest.fn();
    });
    
    afterEach(() => {
      global.setInterval = originalSetInterval;
      global.clearInterval = originalClearInterval;
    });
    
    test('should start the reminder service with specified interval', () => {
      // Call the function with a 10 minute interval
      const timer = notifications.startReminderService(10);
      
      // Verify setInterval was called with the right interval
      expect(global.setInterval).toHaveBeenCalled();
      const interval = global.setInterval.mock.calls[0][1];
      expect(interval).toBe(10 * 60 * 1000); // 10 minutes in ms
      
      // Verify it returns the timer ID
      expect(timer).toBe(123);
    });
    
    test('should stop the reminder service', () => {
      // First start the service
      const timer = notifications.startReminderService(5);
      
      // Then stop it
      notifications.stopReminderService();
      
      // Verify clearInterval was called with the right timer ID
      expect(global.clearInterval).toHaveBeenCalledWith(timer);
    });
  });
});