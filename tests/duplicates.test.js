const { findDuplicateEvents } = require('../app');

// Mock calendar client
const mockCalendar = {
  events: {
    list: jest.fn()
  }
};

describe('Duplicate Event Detection', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });
  
  it('should return empty array when no events found', async () => {
    // Mock empty response
    mockCalendar.events.list.mockResolvedValue({
      data: {
        items: []
      }
    });
    
    const result = await findDuplicateEvents(mockCalendar, {});
    
    expect(result).toHaveProperty('duplicateGroups');
    expect(result.duplicateGroups).toEqual([]);
    expect(result).toHaveProperty('message');
  });
  
  it('should identify duplicate events with similar titles and close times', async () => {
    // Mock events with duplicates
    const now = new Date();
    const mockEvents = [
      {
        id: 'event1',
        summary: 'Team Meeting',
        description: 'Weekly sync',
        start: { dateTime: now.toISOString() },
        end: { dateTime: new Date(now.getTime() + 3600000).toISOString() }
      },
      {
        id: 'event2',
        summary: 'Team Meeting',  // Same title
        description: 'Weekly team sync',
        start: { dateTime: new Date(now.getTime() + 1800000).toISOString() },  // 30 minutes later (within 48 hours)
        end: { dateTime: new Date(now.getTime() + 5400000).toISOString() }
      },
      {
        id: 'event3',
        summary: 'Doctor Appointment',  // Different title
        description: 'Annual checkup',
        start: { dateTime: new Date(now.getTime() + 86400000).toISOString() },  // 24 hours later
        end: { dateTime: new Date(now.getTime() + 90000000).toISOString() }
      }
    ];
    
    mockCalendar.events.list.mockResolvedValue({
      data: {
        items: mockEvents
      }
    });
    
    const result = await findDuplicateEvents(mockCalendar, { similarityThreshold: 0.7 });
    
    expect(result).toHaveProperty('duplicateGroups');
    expect(result.duplicateGroups.length).toBe(1);  // One duplicate group
    expect(result.duplicateGroups[0].events.length).toBe(2);  // Two events in that group
    expect(result.duplicateGroups[0].events.map(e => e.id)).toContain('event1');
    expect(result.duplicateGroups[0].events.map(e => e.id)).toContain('event2');
    expect(result).toHaveProperty('count', 1);
  });
  
  it('should respect similarity threshold', async () => {
    // Events with some similarity but below default threshold
    const now = new Date();
    const mockEvents = [
      {
        id: 'event1',
        summary: 'Team Meeting with Product',
        start: { dateTime: now.toISOString() },
        end: { dateTime: new Date(now.getTime() + 3600000).toISOString() }
      },
      {
        id: 'event2',
        summary: 'Team Meeting with Design',  // Similar but not identical
        start: { dateTime: new Date(now.getTime() + 3600000).toISOString() },  // 1 hour later (within 48 hours)
        end: { dateTime: new Date(now.getTime() + 7200000).toISOString() }
      }
    ];
    
    mockCalendar.events.list.mockResolvedValue({
      data: {
        items: mockEvents
      }
    });
    
    // With high threshold - should not detect as duplicates
    const highThresholdResult = await findDuplicateEvents(mockCalendar, { similarityThreshold: 0.9 });
    expect(highThresholdResult.duplicateGroups.length).toBe(0);
    
    // With low threshold - should detect as duplicates
    mockCalendar.events.list.mockResolvedValue({ data: { items: mockEvents } }); // Reset mock
    const lowThresholdResult = await findDuplicateEvents(mockCalendar, { similarityThreshold: 0.5 });
    expect(lowThresholdResult.duplicateGroups.length).toBe(1);
  });
  
  it('should handle API errors gracefully', async () => {
    mockCalendar.events.list.mockRejectedValue(new Error('API error'));
    
    await expect(findDuplicateEvents(mockCalendar, {})).rejects.toThrow('API error');
  });
});