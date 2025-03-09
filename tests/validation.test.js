const { validateParams } = require('../app');

describe('Validation function tests', () => {
  
  test('validateParams should return null when all required parameters are present', () => {
    const params = {
      summary: 'Test Event',
      start: { dateTime: '2023-01-01T09:00:00Z' },
      end: { dateTime: '2023-01-01T10:00:00Z' }
    };
    
    const required = ['summary', 'start', 'end'];
    const result = validateParams(params, required);
    
    expect(result).toBeNull();
  });
  
  test('validateParams should pass with recurrence parameter', () => {
    const params = {
      summary: 'Recurring Event',
      start: { dateTime: '2023-01-01T09:00:00Z' },
      end: { dateTime: '2023-01-01T10:00:00Z' },
      recurrence: ['RRULE:FREQ=DAILY;COUNT=5']
    };
    
    const required = ['summary', 'start', 'end'];
    const result = validateParams(params, required);
    
    expect(result).toBeNull();
  });
  
  test('validateParams should return error message when params is null', () => {
    const params = null;
    const required = ['summary', 'start', 'end'];
    
    const result = validateParams(params, required);
    expect(result).toBe('No parameters provided');
  });
  
  test('validateParams should return error message listing missing parameters', () => {
    const params = {
      summary: 'Test Event'
    };
    
    const required = ['summary', 'start', 'end'];
    const result = validateParams(params, required);
    
    expect(result).toBe('Missing required parameters: start, end');
  });
  
  test('validateParams should handle empty required array', () => {
    const params = {
      summary: 'Test Event'
    };
    
    const required = [];
    const result = validateParams(params, required);
    
    expect(result).toBeNull();
  });
  
  test('validateParams should handle falsy values that are not undefined or null', () => {
    const params = {
      summary: '',
      value: 0,
      check: false
    };
    
    const required = ['summary', 'value', 'check'];
    const result = validateParams(params, required);
    
    expect(result).toBeNull();
  });
  
  test('validateParams should validate attendees and sendUpdates parameters', () => {
    const params = {
      eventId: '123',
      summary: 'Meeting with Attendees',
      attendees: ['user1@example.com', 'user2@example.com'],
      sendUpdates: 'all'
    };
    
    const required = ['eventId'];
    const result = validateParams(params, required);
    
    expect(result).toBeNull();
  });
});