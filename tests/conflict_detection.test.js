/**
 * Test file for calendar event conflict detection
 */

const { detectEventConflicts } = require('../app');

// Mock calendar client
const mockCalendar = {
  events: {
    list: jest.fn()
  }
};

// Reset mocks before each test
beforeEach(() => {
  jest.clearAllMocks();
});

describe('Event Conflict Detection', () => {
  test('should return null when no events are found', async () => {
    // Mock API response with no events
    mockCalendar.events.list.mockResolvedValueOnce({
      data: { items: [] }
    });
    
    const result = await detectEventConflicts(mockCalendar, {
      start: { dateTime: '2025-01-01T10:00:00Z' },
      end: { dateTime: '2025-01-01T11:00:00Z' }
    });
    
    expect(result).toBeNull();
    expect(mockCalendar.events.list).toHaveBeenCalledTimes(1);
  });
  
  test('should detect time conflicts', async () => {
    // Mock API response with overlapping event
    mockCalendar.events.list.mockResolvedValueOnce({
      data: {
        items: [
          {
            id: 'event1',
            summary: 'Existing Meeting',
            start: { dateTime: '2025-01-01T10:30:00Z' },
            end: { dateTime: '2025-01-01T11:30:00Z' },
            status: 'confirmed'
          }
        ]
      }
    });
    
    const result = await detectEventConflicts(mockCalendar, {
      start: { dateTime: '2025-01-01T10:00:00Z' },
      end: { dateTime: '2025-01-01T11:00:00Z' }
    });
    
    expect(result).not.toBeNull();
    expect(result.hasConflicts).toBe(true);
    expect(result.timeConflicts.length).toBe(1);
    expect(result.timeConflicts[0].id).toBe('event1');
    expect(result.timeConflicts[0].conflictType).toBe('time_overlap');
  });
  
  test('should exclude the current event when updating', async () => {
    // Mock API response with current event
    mockCalendar.events.list.mockResolvedValueOnce({
      data: {
        items: [
          {
            id: 'currentEvent',
            summary: 'Current Event',
            start: { dateTime: '2025-01-01T10:00:00Z' },
            end: { dateTime: '2025-01-01T11:00:00Z' },
            status: 'confirmed'
          }
        ]
      }
    });
    
    const result = await detectEventConflicts(mockCalendar, {
      eventId: 'currentEvent', // This should be excluded
      start: { dateTime: '2025-01-01T10:00:00Z' },
      end: { dateTime: '2025-01-01T11:00:00Z' }
    });
    
    expect(result).toBeNull();
  });
  
  test('should detect attendee conflicts', async () => {
    // Mock API response with event with same attendee
    mockCalendar.events.list.mockResolvedValueOnce({
      data: {
        items: [
          {
            id: 'event1',
            summary: 'Existing Meeting',
            start: { dateTime: '2025-01-01T10:30:00Z' },
            end: { dateTime: '2025-01-01T11:30:00Z' },
            status: 'confirmed',
            attendees: [
              { email: 'user@example.com' },
              { email: 'another@example.com' }
            ]
          }
        ]
      }
    });
    
    const result = await detectEventConflicts(mockCalendar, {
      start: { dateTime: '2025-01-01T10:00:00Z' },
      end: { dateTime: '2025-01-01T11:00:00Z' },
      attendees: ['user@example.com', 'third@example.com']
    });
    
    expect(result).not.toBeNull();
    expect(result.hasConflicts).toBe(true);
    expect(result.attendeeConflicts.length).toBe(1);
    expect(result.attendeeConflicts[0].id).toBe('event1');
    expect(result.attendeeConflicts[0].conflictType).toBe('attendee_double_booking');
    expect(result.attendeeConflicts[0].conflictingAttendees).toContain('user@example.com');
  });
  
  test('should not detect attendee conflicts when checkAttendees is false', async () => {
    // Mock API response with event with same attendee
    mockCalendar.events.list.mockResolvedValueOnce({
      data: {
        items: [
          {
            id: 'event1',
            summary: 'Existing Meeting',
            start: { dateTime: '2025-01-01T10:30:00Z' },
            end: { dateTime: '2025-01-01T11:30:00Z' },
            status: 'confirmed',
            attendees: [
              { email: 'user@example.com' },
              { email: 'another@example.com' }
            ]
          }
        ]
      }
    });
    
    const result = await detectEventConflicts(mockCalendar, {
      start: { dateTime: '2025-01-01T10:00:00Z' },
      end: { dateTime: '2025-01-01T11:00:00Z' },
      attendees: ['user@example.com', 'third@example.com'],
      checkAttendees: false
    });
    
    expect(result).not.toBeNull();
    expect(result.hasConflicts).toBe(true);
    expect(result.timeConflicts.length).toBe(1);
    expect(result.attendeeConflicts.length).toBe(0);
  });
  
  test('should handle date-only events', async () => {
    mockCalendar.events.list.mockResolvedValueOnce({
      data: {
        items: [
          {
            id: 'event1',
            summary: 'All-day Event',
            start: { date: '2025-01-01' },
            end: { date: '2025-01-02' },
            status: 'confirmed'
          }
        ]
      }
    });
    
    const result = await detectEventConflicts(mockCalendar, {
      start: { date: '2025-01-01' },
      end: { date: '2025-01-02' }
    });
    
    expect(result).not.toBeNull();
    expect(result.hasConflicts).toBe(true);
    expect(result.timeConflicts.length).toBe(1);
  });
  
  test('should throw error for invalid date formats', async () => {
    await expect(detectEventConflicts(mockCalendar, {
      start: { dateTime: 'invalid-date' },
      end: { dateTime: '2025-01-01T11:00:00Z' }
    })).rejects.toThrow();
  });
});