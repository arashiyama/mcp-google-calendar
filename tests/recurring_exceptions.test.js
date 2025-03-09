/**
 * Tests for recurring event exceptions functionality
 */

const { createEventException, deleteEventInstance } = require('../app');

// Mock Google Calendar API client
const mockCalendar = {
  events: {
    get: jest.fn(),
    instances: jest.fn(),
    update: jest.fn(),
    delete: jest.fn()
  }
};

describe('Recurring Event Exceptions', () => {
  beforeEach(() => {
    // Reset all mocks
    jest.clearAllMocks();
  });

  describe('createEventException', () => {
    test('should create an exception to a recurring event instance', async () => {
      // Setup mock data
      const recurringEventId = 'recurring123';
      const originalStartTime = '2025-03-15T10:00:00Z';
      
      // Mock get call to verify the event exists and is recurring
      mockCalendar.events.get.mockResolvedValueOnce({
        data: {
          id: recurringEventId,
          summary: 'Team Meeting',
          recurrence: ['RRULE:FREQ=WEEKLY;COUNT=10']
        }
      });
      
      // Mock instances call to find the specific instance
      mockCalendar.events.instances.mockResolvedValueOnce({
        data: {
          items: [
            {
              id: 'instance1',
              recurringEventId: recurringEventId,
              summary: 'Team Meeting',
              start: { dateTime: '2025-03-08T10:00:00Z' },
              end: { dateTime: '2025-03-08T11:00:00Z' },
              originalStartTime: { dateTime: '2025-03-08T10:00:00Z' }
            },
            {
              id: 'instance2',
              recurringEventId: recurringEventId,
              summary: 'Team Meeting',
              start: { dateTime: '2025-03-15T10:00:00Z' },
              end: { dateTime: '2025-03-15T11:00:00Z' },
              originalStartTime: { dateTime: '2025-03-15T10:00:00Z' }
            }
          ]
        }
      });
      
      // Mock update call to modify the instance
      mockCalendar.events.update.mockResolvedValueOnce({
        data: {
          id: 'instance2',
          recurringEventId: recurringEventId,
          summary: 'Virtual Team Meeting',
          description: 'Online meeting this week',
          start: { dateTime: '2025-03-15T10:00:00Z' },
          end: { dateTime: '2025-03-15T11:00:00Z' },
          location: 'Zoom',
          originalStartTime: { dateTime: '2025-03-15T10:00:00Z' },
          status: 'confirmed',
          updated: '2025-03-10T08:30:00Z',
          htmlLink: 'https://calendar.google.com/event?id=abc123'
        }
      });
      
      // Call the function with test parameters
      const result = await createEventException(mockCalendar, {
        calendarId: 'primary',
        recurringEventId: recurringEventId,
        originalStartTime: originalStartTime,
        summary: 'Virtual Team Meeting',
        description: 'Online meeting this week',
        location: 'Zoom'
      });
      
      // Verify the get call was made correctly
      expect(mockCalendar.events.get).toHaveBeenCalledWith({
        calendarId: 'primary',
        eventId: recurringEventId
      });
      
      // Verify the instances call was made correctly
      expect(mockCalendar.events.instances).toHaveBeenCalledWith({
        calendarId: 'primary',
        eventId: recurringEventId,
        maxResults: 100
      });
      
      // Verify the update call was made with the correct parameters
      expect(mockCalendar.events.update).toHaveBeenCalled();
      const updateParams = mockCalendar.events.update.mock.calls[0][0];
      expect(updateParams.calendarId).toBe('primary');
      expect(updateParams.eventId).toBe('instance2');
      expect(updateParams.resource.summary).toBe('Virtual Team Meeting');
      expect(updateParams.resource.description).toBe('Online meeting this week');
      expect(updateParams.resource.location).toBe('Zoom');
      
      // Verify the result structure
      expect(result).toEqual({
        id: 'instance2',
        recurringEventId: recurringEventId,
        calendarId: 'primary',
        summary: 'Virtual Team Meeting',
        description: 'Online meeting this week',
        start: { dateTime: '2025-03-15T10:00:00Z' },
        end: { dateTime: '2025-03-15T11:00:00Z' },
        location: 'Zoom',
        htmlLink: 'https://calendar.google.com/event?id=abc123',
        updated: '2025-03-10T08:30:00Z',
        status: 'confirmed',
        originalStartTime: { dateTime: '2025-03-15T10:00:00Z' },
        isRecurringException: true
      });
    });
    
    test('should throw an error if the event is not recurring', async () => {
      // Mock get call to return a non-recurring event
      mockCalendar.events.get.mockResolvedValueOnce({
        data: {
          id: 'nonrecurring123',
          summary: 'One-time Meeting',
          // No recurrence property
        }
      });
      
      // Call the function and expect it to throw
      await expect(createEventException(mockCalendar, {
        calendarId: 'primary',
        recurringEventId: 'nonrecurring123',
        originalStartTime: '2025-03-15T10:00:00Z'
      })).rejects.toThrow('The specified event is not a recurring event');
    });
    
    test('should throw an error if the instance is not found', async () => {
      // Mock get call to verify the event exists and is recurring
      mockCalendar.events.get.mockResolvedValueOnce({
        data: {
          id: 'recurring123',
          summary: 'Team Meeting',
          recurrence: ['RRULE:FREQ=WEEKLY;COUNT=10']
        }
      });
      
      // Mock instances call to return no matching instance
      mockCalendar.events.instances.mockResolvedValueOnce({
        data: {
          items: [
            {
              id: 'instance1',
              recurringEventId: 'recurring123',
              originalStartTime: { dateTime: '2025-03-08T10:00:00Z' }
            }
          ]
        }
      });
      
      // Call the function and expect it to throw
      await expect(createEventException(mockCalendar, {
        calendarId: 'primary',
        recurringEventId: 'recurring123',
        originalStartTime: '2025-04-15T10:00:00Z' // No matching instance for this date
      })).rejects.toThrow('Could not find the specified instance in this recurring event series');
    });
  });
  
  describe('deleteEventInstance', () => {
    test('should delete a specific instance of a recurring event', async () => {
      // Setup mock data
      const recurringEventId = 'recurring123';
      const originalStartTime = '2025-03-15T10:00:00Z';
      
      // Mock instances call to find the specific instance
      mockCalendar.events.instances.mockResolvedValueOnce({
        data: {
          items: [
            {
              id: 'instance1',
              recurringEventId: recurringEventId,
              originalStartTime: { dateTime: '2025-03-08T10:00:00Z' }
            },
            {
              id: 'instance2',
              recurringEventId: recurringEventId,
              originalStartTime: { dateTime: '2025-03-15T10:00:00Z' }
            }
          ]
        }
      });
      
      // Mock delete call
      mockCalendar.events.delete.mockResolvedValueOnce({});
      
      // Call the function with test parameters
      const result = await deleteEventInstance(mockCalendar, {
        calendarId: 'primary',
        recurringEventId: recurringEventId,
        originalStartTime: originalStartTime
      });
      
      // Verify the instances call was made correctly
      expect(mockCalendar.events.instances).toHaveBeenCalledWith({
        calendarId: 'primary',
        eventId: recurringEventId,
        maxResults: 100
      });
      
      // Verify the delete call was made with the correct parameters
      expect(mockCalendar.events.delete).toHaveBeenCalledWith({
        calendarId: 'primary',
        eventId: 'instance2'
      });
      
      // Verify the result structure
      expect(result).toEqual({
        eventId: 'instance2',
        recurringEventId: recurringEventId,
        calendarId: 'primary',
        deleted: true,
        originalStartTime: originalStartTime,
        timestamp: expect.any(String)
      });
    });
    
    test('should throw an error if the instance is not found', async () => {
      // Mock instances call to return no matching instance
      mockCalendar.events.instances.mockResolvedValueOnce({
        data: {
          items: [
            {
              id: 'instance1',
              recurringEventId: 'recurring123',
              originalStartTime: { dateTime: '2025-03-08T10:00:00Z' }
            }
          ]
        }
      });
      
      // Call the function and expect it to throw
      await expect(deleteEventInstance(mockCalendar, {
        calendarId: 'primary',
        recurringEventId: 'recurring123',
        originalStartTime: '2025-04-15T10:00:00Z' // No matching instance for this date
      })).rejects.toThrow('Could not find the specified instance in this recurring event series');
    });
  });
});