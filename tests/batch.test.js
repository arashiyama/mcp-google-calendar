const { batchOperations } = require('../app');

// Mock Google Calendar API
jest.mock('googleapis', () => {
  return {
    google: {
      calendar: jest.fn().mockReturnValue({
        events: {
          insert: jest.fn(),
          get: jest.fn(),
          update: jest.fn(),
          delete: jest.fn()
        }
      })
    }
  };
});

describe('Batch Operations', () => {
  let mockCalendar;
  
  beforeEach(() => {
    mockCalendar = {
      events: {
        insert: jest.fn(),
        get: jest.fn(),
        update: jest.fn(),
        delete: jest.fn()
      }
    };
  });
  
  test('should execute multiple operations in a batch', async () => {
    // Mock responses for various operations
    mockCalendar.events.insert.mockResolvedValue({
      data: {
        id: 'new-event-123',
        summary: 'Created Event',
        htmlLink: 'https://calendar.google.com/event?id=new-event-123',
        status: 'confirmed',
        created: '2023-01-01T10:00:00Z'
      }
    });
    
    mockCalendar.events.get.mockResolvedValue({
      data: {
        id: 'existing-event-123',
        summary: 'Existing Event',
        start: { dateTime: '2023-01-02T10:00:00Z' },
        end: { dateTime: '2023-01-02T11:00:00Z' }
      }
    });
    
    mockCalendar.events.update.mockResolvedValue({
      data: {
        id: 'updated-event-123',
        summary: 'Updated Event',
        status: 'confirmed'
      }
    });
    
    mockCalendar.events.delete.mockResolvedValue({});
    
    const operations = [
      {
        action: 'create_event',
        parameters: {
          summary: 'New Event',
          start: { dateTime: '2023-01-01T10:00:00Z' },
          end: { dateTime: '2023-01-01T11:00:00Z' }
        }
      },
      {
        action: 'get_event',
        parameters: {
          eventId: 'existing-event-123'
        }
      },
      {
        action: 'update_event',
        parameters: {
          eventId: 'existing-event-123',
          summary: 'Updated Title'
        }
      },
      {
        action: 'delete_event',
        parameters: {
          eventId: 'event-to-delete-123'
        }
      }
    ];
    
    const result = await batchOperations(mockCalendar, { operations });
    
    // Check overall stats
    expect(result.operations_count).toBe(4);
    expect(result.success_count).toBe(4);
    expect(result.error_count).toBe(0);
    
    // Check each operation result
    expect(result.results[0].action).toBe('create_event');
    expect(result.results[0].success).toBe(true);
    expect(result.results[0].data.id).toBe('new-event-123');
    
    expect(result.results[1].action).toBe('get_event');
    expect(result.results[1].success).toBe(true);
    expect(result.results[1].data.id).toBe('existing-event-123');
    
    expect(result.results[2].action).toBe('update_event');
    expect(result.results[2].success).toBe(true);
    expect(result.results[2].data.id).toBe('updated-event-123');
    
    expect(result.results[3].action).toBe('delete_event');
    expect(result.results[3].success).toBe(true);
    expect(result.results[3].data.deleted).toBe(true);
    
    // Verify all mock functions were called
    expect(mockCalendar.events.insert).toHaveBeenCalled();
    expect(mockCalendar.events.get).toHaveBeenCalledTimes(2); // Once for get, once for update
    expect(mockCalendar.events.update).toHaveBeenCalled();
    expect(mockCalendar.events.delete).toHaveBeenCalled();
  });
  
  test('should handle errors in batch operations gracefully', async () => {
    // Mock success for one operation and failure for another
    mockCalendar.events.insert.mockResolvedValue({
      data: {
        id: 'new-event-123',
        summary: 'Created Event'
      }
    });
    
    mockCalendar.events.get.mockRejectedValue({
      code: 404,
      message: 'Event not found'
    });
    
    const operations = [
      {
        action: 'create_event',
        parameters: {
          summary: 'New Event',
          start: { dateTime: '2023-01-01T10:00:00Z' },
          end: { dateTime: '2023-01-01T11:00:00Z' }
        }
      },
      {
        action: 'get_event',
        parameters: {
          eventId: 'non-existent-123'
        }
      },
      {
        action: 'unknown_action',
        parameters: {}
      }
    ];
    
    const result = await batchOperations(mockCalendar, { operations });
    
    // Check overall stats
    expect(result.operations_count).toBe(3);
    expect(result.success_count).toBe(1);
    expect(result.error_count).toBe(2);
    
    // Check success
    expect(result.results[0].action).toBe('create_event');
    expect(result.results[0].success).toBe(true);
    
    // Check handled API error
    expect(result.results[1].action).toBe('get_event');
    expect(result.results[1].success).toBe(false);
    expect(result.results[1].error).toBe('Event not found');
    
    // Check unknown action error
    expect(result.results[2].action).toBe('unknown_action');
    expect(result.results[2].success).toBe(false);
    expect(result.results[2].error).toContain('Unsupported action');
  });
  
  test('should validate operations parameter', async () => {
    // Test with empty operations array
    await expect(batchOperations(mockCalendar, { operations: [] }))
      .rejects.toThrow('No operations provided');
    
    // Test with non-array operations
    await expect(batchOperations(mockCalendar, { operations: 'not an array' }))
      .rejects.toThrow('No operations provided');
    
    // Test with missing action
    const badOperations = [
      {
        parameters: { id: '123' }
      }
    ];
    
    await expect(batchOperations(mockCalendar, { operations: badOperations }))
      .rejects.toThrow('Each operation must have an action property');
  });
  
  test('should validate individual operation parameters', async () => {
    const operations = [
      {
        action: 'create_event',
        parameters: {
          // Missing required parameters
        }
      }
    ];
    
    const result = await batchOperations(mockCalendar, { operations });
    
    expect(result.results[0].success).toBe(false);
    expect(result.results[0].error_type).toBe('validation_error');
    expect(result.results[0].error).toContain('Missing required parameters');
  });
});