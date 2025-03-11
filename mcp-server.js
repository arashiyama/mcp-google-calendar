#!/usr/bin/env node
const { Server } = require('@modelcontextprotocol/sdk/server/index.js');
const { StdioServerTransport } = require('@modelcontextprotocol/sdk/server/stdio.js');
const {
  CallToolRequestSchema,
  ErrorCode,
  ListToolsRequestSchema,
  McpError,
} = require('@modelcontextprotocol/sdk/types.js');
const { google } = require('googleapis');
const dotenv = require('dotenv');
const db = require('./db');

// Load environment variables
dotenv.config();

// Google OAuth2 configuration
const oauth2Client = new google.auth.OAuth2(
  process.env.GOOGLE_CLIENT_ID,
  process.env.GOOGLE_CLIENT_SECRET,
  process.env.GOOGLE_REDIRECT_URI
);

// Import the existing functionality
const {
  validateParams,
  ErrorTypes,
  listCalendars,
  listEvents,
  listRecurringInstances,
  createEvent,
  getEvent,
  updateEvent,
  deleteEvent,
  findDuplicateEvents,
  batchOperations,
  advancedSearchEvents,
  createEventException,
  deleteEventInstance,
  manageWebhooks,
  detectEventConflicts
} = require('./app');

class GoogleCalendarMcpServer {
  constructor() {
    this.server = new Server(
      {
        name: 'google-calendar-mcp',
        version: '1.0.0',
      },
      {
        capabilities: {
          tools: {},
        },
      }
    );

    // Token storage
    this.tokens = null;

    // Set up request handlers
    this.setupToolHandlers();
    
    // Error handling
    this.server.onerror = (error) => console.error('[MCP Error]', error);
    process.on('SIGINT', async () => {
      await this.server.close();
      process.exit(0);
    });
  }

  async loadTokens() {
    try {
      const tokenData = await db.loadTokens();
      if (tokenData) {
        this.tokens = tokenData;
        console.error('Tokens loaded from database');
        
        // Check if token is expired
        if (this.tokens.expiry_date && Date.now() >= this.tokens.expiry_date) {
          console.error('Loaded token is expired, will refresh on next use');
        }
      }
    } catch (err) {
      console.error('Error loading tokens:', err);
    }
  }

  async saveTokens(tokenData) {
    if (!tokenData) return;
    
    try {
      this.tokens = tokenData;
      await db.saveTokens(tokenData);
      console.error('Tokens saved to database');
    } catch (err) {
      console.error('Error saving tokens:', err);
    }
  }

  setupToolHandlers() {
    // List available tools
    this.server.setRequestHandler(ListToolsRequestSchema, async () => ({
      tools: [
        {
          name: 'list_calendars',
          description: 'List available calendars the user has access to',
          inputSchema: {
            type: 'object',
            properties: {},
            required: []
          },
        },
        {
          name: 'list_events',
          description: 'List calendar events based on specified criteria',
          inputSchema: {
            type: 'object',
            properties: {
              calendarId: {
                type: 'string',
                description: 'ID of the calendar to use (defaults to "primary")'
              },
              timeMin: {
                type: 'string',
                description: 'ISO date string for the earliest event time (defaults to current time if not specified)'
              },
              timeMax: {
                type: 'string',
                description: 'ISO date string for the latest event time'
              },
              maxResults: {
                type: 'number',
                description: 'Maximum number of events to return (defaults to 10)'
              },
              q: {
                type: 'string',
                description: 'Free text search term to find events that match'
              },
              orderBy: {
                type: 'string',
                description: 'Sorting order: "startTime" (default) or "updated"'
              },
              pageToken: {
                type: 'string',
                description: 'Token for retrieving the next page of results'
              },
              syncToken: {
                type: 'string',
                description: 'Token for incremental sync'
              },
              timeZone: {
                type: 'string',
                description: 'Time zone used in the response'
              },
              showDeleted: {
                type: 'boolean',
                description: 'Whether to include deleted events (defaults to false)'
              },
              showHiddenInvitations: {
                type: 'boolean',
                description: 'Whether to include hidden invitations (defaults to false)'
              },
              singleEvents: {
                type: 'boolean',
                description: 'Whether to expand recurring events (defaults to true)'
              },
              updatedMin: {
                type: 'string',
                description: 'Lower bound for an event\'s last modification time (ISO date string)'
              },
              iCalUID: {
                type: 'string',
                description: 'Filter by specific iCalendar UID'
              }
            },
            required: []
          },
        },
        {
          name: 'create_event',
          description: 'Create a new calendar event',
          inputSchema: {
            type: 'object',
            properties: {
              calendarId: {
                type: 'string',
                description: 'ID of the calendar to use (defaults to "primary")'
              },
              summary: {
                type: 'string',
                description: 'Event title (required)'
              },
              description: {
                type: 'string',
                description: 'Event description (optional)'
              },
              start: {
                type: 'object',
                description: 'Event start time object with dateTime and timeZone (required)'
              },
              end: {
                type: 'object',
                description: 'Event end time object with dateTime and timeZone (required)'
              },
              location: {
                type: 'string',
                description: 'Event location (optional)'
              },
              recurrence: {
                type: 'array',
                description: 'Array of RRULE strings for recurring events (optional, e.g. ["RRULE:FREQ=DAILY;COUNT=5"])'
              },
              attendees: {
                type: 'array',
                description: 'Array of attendee email addresses (optional)'
              },
              reminders: {
                type: 'object',
                description: 'Reminder settings with useDefault and overrides array (optional)'
              },
              sendUpdates: {
                type: 'string',
                description: 'Preference for sending email updates (optional, "all", "externalOnly", or "none")'
              },
              checkConflicts: {
                type: 'boolean',
                description: 'Whether to check for scheduling conflicts (defaults to true)'
              },
              allowConflicts: {
                type: 'boolean',
                description: 'Whether to allow creation despite conflicts (defaults to false)'
              }
            },
            required: ['summary', 'start', 'end']
          },
        },
        {
          name: 'get_event',
          description: 'Get detailed information for a specific event',
          inputSchema: {
            type: 'object',
            properties: {
              calendarId: {
                type: 'string',
                description: 'ID of the calendar to use (defaults to "primary")'
              },
              eventId: {
                type: 'string',
                description: 'ID of the event to retrieve (required)'
              }
            },
            required: ['eventId']
          },
        },
        {
          name: 'update_event',
          description: 'Update an existing calendar event',
          inputSchema: {
            type: 'object',
            properties: {
              calendarId: {
                type: 'string',
                description: 'ID of the calendar to use (defaults to "primary")'
              },
              eventId: {
                type: 'string',
                description: 'ID of the event to update (required)'
              },
              summary: {
                type: 'string',
                description: 'New event title (optional)'
              },
              description: {
                type: 'string',
                description: 'New event description (optional)'
              },
              start: {
                type: 'object',
                description: 'New event start time object with dateTime and timeZone (optional)'
              },
              end: {
                type: 'object',
                description: 'New event end time object with dateTime and timeZone (optional)'
              },
              location: {
                type: 'string',
                description: 'New event location (optional)'
              },
              recurrence: {
                type: 'array',
                description: 'Array of RRULE strings for recurring events (optional, e.g. ["RRULE:FREQ=DAILY;COUNT=5"])'
              },
              attendees: {
                type: 'array',
                description: 'Array of attendee email addresses (optional)'
              },
              sendUpdates: {
                type: 'string',
                description: 'Preference for sending email updates (optional, "all", "externalOnly", or "none")'
              },
              checkConflicts: {
                type: 'boolean',
                description: 'Whether to check for scheduling conflicts (defaults to true)'
              },
              allowConflicts: {
                type: 'boolean',
                description: 'Whether to allow update despite conflicts (defaults to false)'
              }
            },
            required: ['eventId']
          },
        },
        {
          name: 'delete_event',
          description: 'Delete a calendar event',
          inputSchema: {
            type: 'object',
            properties: {
              calendarId: {
                type: 'string',
                description: 'ID of the calendar to use (defaults to "primary")'
              },
              eventId: {
                type: 'string',
                description: 'ID of the event to delete (required)'
              },
              sendUpdates: {
                type: 'string',
                description: 'Preference for sending email updates (optional, "all", "externalOnly", or "none")'
              }
            },
            required: ['eventId']
          },
        },
        {
          name: 'list_recurring_instances',
          description: 'List all instances of a recurring event',
          inputSchema: {
            type: 'object',
            properties: {
              calendarId: {
                type: 'string',
                description: 'ID of the calendar to use (defaults to "primary")'
              },
              eventId: {
                type: 'string',
                description: 'ID of the recurring event to get instances for (required)'
              },
              timeMin: {
                type: 'string',
                description: 'ISO date string for the earliest event time (defaults to current time)'
              },
              timeMax: {
                type: 'string',
                description: 'ISO date string for the latest event time'
              },
              maxResults: {
                type: 'number',
                description: 'Maximum number of instances to return (defaults to 10)'
              }
            },
            required: ['eventId']
          },
        },
        {
          name: 'find_duplicates',
          description: 'Identify potential duplicate events in the calendar',
          inputSchema: {
            type: 'object',
            properties: {
              calendarId: {
                type: 'string',
                description: 'ID of the calendar to use (defaults to "primary")'
              },
              timeMin: {
                type: 'string',
                description: 'ISO date string for the earliest event time (defaults to current time)'
              },
              timeMax: {
                type: 'string',
                description: 'ISO date string for the latest event time (defaults to 30 days from now)'
              },
              similarityThreshold: {
                type: 'number',
                description: 'Threshold for considering events as duplicates (0.0-1.0, defaults to 0.7)'
              }
            },
            required: []
          },
        },
        {
          name: 'batch_operations',
          description: 'Execute multiple calendar operations in a single request',
          inputSchema: {
            type: 'object',
            properties: {
              operations: {
                type: 'array',
                description: 'Array of operations to perform, each with "action" and "parameters" properties'
              }
            },
            required: ['operations']
          },
        },
        {
          name: 'advanced_search_events',
          description: 'Advanced search for events with complex filtering options',
          inputSchema: {
            type: 'object',
            properties: {
              calendarId: {
                type: 'string',
                description: 'ID of the calendar to use (defaults to "primary")'
              },
              timeRange: {
                type: 'object',
                description: 'Object with "start" and "end" properties (ISO date strings)'
              },
              textSearch: {
                type: 'string',
                description: 'Search term for event title/description'
              },
              location: {
                type: 'string',
                description: 'Filter by event location (substring match)'
              },
              attendees: {
                type: 'array',
                description: 'Array of email addresses to filter by attendance'
              },
              status: {
                type: 'string',
                description: 'Filter by event status ("confirmed", "tentative", or "cancelled")'
              },
              createdAfter: {
                type: 'string',
                description: 'ISO date string to filter by creation time'
              },
              updatedAfter: {
                type: 'string',
                description: 'ISO date string to filter by last update time'
              },
              hasAttachments: {
                type: 'boolean',
                description: 'Filter to events that have attachments (boolean)'
              },
              isRecurring: {
                type: 'boolean',
                description: 'Filter to recurring events or instances (boolean)'
              },
              maxResults: {
                type: 'number',
                description: 'Maximum number of events to return (defaults to 100)'
              }
            },
            required: []
          },
        },
        {
          name: 'detect_conflicts',
          description: 'Detect scheduling conflicts for a proposed event',
          inputSchema: {
            type: 'object',
            properties: {
              calendarId: {
                type: 'string',
                description: 'ID of the calendar to use (defaults to "primary")'
              },
              start: {
                type: 'object',
                description: 'Proposed event start time (required)'
              },
              end: {
                type: 'object',
                description: 'Proposed event end time (required)'
              },
              eventId: {
                type: 'string',
                description: 'ID of current event if updating (to exclude from conflict check)'
              },
              attendees: {
                type: 'array',
                description: 'Array of attendee email addresses to check for conflicts'
              },
              checkAttendees: {
                type: 'boolean',
                description: 'Whether to consider attendee conflicts (default: true)'
              }
            },
            required: ['start', 'end']
          },
        },
        {
          name: 'create_event_exception',
          description: 'Create an exception to a specific instance of a recurring event',
          inputSchema: {
            type: 'object',
            properties: {
              calendarId: {
                type: 'string',
                description: 'ID of the calendar to use (defaults to "primary")'
              },
              recurringEventId: {
                type: 'string',
                description: 'ID of the recurring event series (required)'
              },
              originalStartTime: {
                type: 'string',
                description: 'The original start time of the instance to modify (required)'
              },
              summary: {
                type: 'string',
                description: 'New event title for this instance (optional)'
              },
              description: {
                type: 'string',
                description: 'New event description for this instance (optional)'
              },
              start: {
                type: 'object',
                description: 'New start time object for this instance (optional)'
              },
              end: {
                type: 'object',
                description: 'New end time object for this instance (optional)'
              },
              location: {
                type: 'string',
                description: 'New location for this instance (optional)'
              },
              attendees: {
                type: 'array',
                description: 'Array of attendee email addresses for this instance (optional)'
              },
              reminders: {
                type: 'object',
                description: 'Reminder settings with useDefault and overrides array (optional)'
              },
              sendUpdates: {
                type: 'string',
                description: 'Preference for sending email updates (optional)'
              }
            },
            required: ['recurringEventId', 'originalStartTime']
          },
        },
        {
          name: 'delete_event_instance',
          description: 'Delete a specific instance of a recurring event',
          inputSchema: {
            type: 'object',
            properties: {
              calendarId: {
                type: 'string',
                description: 'ID of the calendar to use (defaults to "primary")'
              },
              recurringEventId: {
                type: 'string',
                description: 'ID of the recurring event series (required)'
              },
              originalStartTime: {
                type: 'string',
                description: 'The original start time of the instance to delete (required)'
              },
              sendUpdates: {
                type: 'string',
                description: 'Preference for sending email updates (optional)'
              }
            },
            required: ['recurringEventId', 'originalStartTime']
          },
        },
        {
          name: 'manage_webhooks',
          description: 'Set up or remove notification webhooks',
          inputSchema: {
            type: 'object',
            properties: {
              operation: {
                type: 'string',
                description: 'Operation to perform: "create", "list", or "delete"'
              },
              address: {
                type: 'string',
                description: 'URL where notifications should be sent (for "create")'
              },
              webhookId: {
                type: 'string',
                description: 'ID of the webhook to delete (for "delete")'
              }
            },
            required: ['operation']
          },
        },
        {
          name: 'get_auth_url',
          description: 'Get the URL for Google Calendar authentication',
          inputSchema: {
            type: 'object',
            properties: {},
            required: []
          },
        },
        {
          name: 'check_auth_status',
          description: 'Check if the user is authenticated with Google Calendar',
          inputSchema: {
            type: 'object',
            properties: {},
            required: []
          },
        }
      ],
    }));

    // Handle tool calls
    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      try {
        const { name, arguments: args } = request.params;
        
        // Special case for authentication-related tools
        if (name === 'get_auth_url') {
          const authUrl = oauth2Client.generateAuthUrl({
            access_type: 'offline',
            scope: ['https://www.googleapis.com/auth/calendar'],
            prompt: 'consent'
          });
          
          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify({ auth_url: authUrl }, null, 2),
              },
            ],
          };
        }
        
        if (name === 'check_auth_status') {
          // Load tokens if not already loaded
          if (!this.tokens) {
            await this.loadTokens();
          }
          
          const isAuthenticated = !!this.tokens;
          let tokenStatus = null;
          
          if (isAuthenticated && this.tokens.expiry_date) {
            const expiryDate = new Date(this.tokens.expiry_date);
            const isExpired = Date.now() >= this.tokens.expiry_date;
            const timeLeftMinutes = isExpired ? 0 : Math.floor((this.tokens.expiry_date - Date.now()) / 1000 / 60);
            
            tokenStatus = {
              status: isExpired ? 'expired' : 'valid',
              expiry: expiryDate.toISOString(),
              timeLeftMinutes: timeLeftMinutes
            };
          }
          
          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify({ 
                  authenticated: isAuthenticated,
                  token_status: tokenStatus
                }, null, 2),
              },
            ],
          };
        }
        
        // For all other tools, check authentication
        if (!this.tokens) {
          await this.loadTokens();
        }
        
        if (!this.tokens) {
          const authUrl = oauth2Client.generateAuthUrl({
            access_type: 'offline',
            scope: ['https://www.googleapis.com/auth/calendar'],
            prompt: 'consent'
          });
          
          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify({
                  error: 'Not authenticated',
                  error_type: ErrorTypes.AUTHENTICATION,
                  auth_url: authUrl
                }, null, 2),
              },
            ],
            isError: true,
          };
        }
        
        // Set up credentials and validate token expiration
        try {
          oauth2Client.setCredentials(this.tokens);
          
          // Check if token needs refreshing
          if (this.tokens.expiry_date && Date.now() >= this.tokens.expiry_date) {
            console.error('Token expired, attempting to refresh...');
            const { credentials } = await oauth2Client.refreshToken(this.tokens.refresh_token);
            await this.saveTokens(credentials); // Save the refreshed tokens
            console.error('Tokens refreshed and saved to database');
          }
        } catch (authError) {
          console.error('Authentication error:', authError);
          const authUrl = oauth2Client.generateAuthUrl({
            access_type: 'offline',
            scope: ['https://www.googleapis.com/auth/calendar'],
            prompt: 'consent'
          });
          
          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify({
                  error: 'Authentication failed. Please log in again.',
                  error_type: ErrorTypes.AUTHENTICATION,
                  auth_url: authUrl
                }, null, 2),
              },
            ],
            isError: true,
          };
        }
        
        const calendar = google.calendar({ version: 'v3', auth: oauth2Client });
        
        // Process the requested action
        let result;
        
        switch (name) {
          case 'list_calendars':
            result = await listCalendars(calendar);
            break;
            
          case 'list_events':
            result = await listEvents(calendar, args || {});
            break;
            
          case 'list_recurring_instances':
            // Validate required parameters
            const recurringInstancesError = validateParams(args, ['eventId']);
            if (recurringInstancesError) {
              throw new McpError(
                ErrorCode.InvalidParams,
                recurringInstancesError
              );
            }
            result = await listRecurringInstances(calendar, args);
            break;
            
          case 'create_event':
            // Validate required parameters
            const createEventError = validateParams(args, ['summary', 'start', 'end']);
            if (createEventError) {
              throw new McpError(
                ErrorCode.InvalidParams,
                createEventError
              );
            }
            result = await createEvent(calendar, args);
            break;
            
          case 'get_event':
            // Validate required parameters
            const getEventError = validateParams(args, ['eventId']);
            if (getEventError) {
              throw new McpError(
                ErrorCode.InvalidParams,
                getEventError
              );
            }
            result = await getEvent(calendar, args);
            break;
            
          case 'update_event':
            // Validate required parameters
            const updateEventError = validateParams(args, ['eventId']);
            if (updateEventError) {
              throw new McpError(
                ErrorCode.InvalidParams,
                updateEventError
              );
            }
            
            // At least one update field should be provided
            if (!args.summary && !args.description && 
                !args.start && !args.end && !args.location) {
              throw new McpError(
                ErrorCode.InvalidParams,
                'At least one field to update must be provided'
              );
            }
            
            result = await updateEvent(calendar, args);
            break;
            
          case 'delete_event':
            // Validate required parameters
            const deleteEventError = validateParams(args, ['eventId']);
            if (deleteEventError) {
              throw new McpError(
                ErrorCode.InvalidParams,
                deleteEventError
              );
            }
            result = await deleteEvent(calendar, args);
            break;
            
          case 'find_duplicates':
            // Check that similarity threshold is valid if provided
            if (args && args.similarityThreshold !== undefined) {
              const threshold = parseFloat(args.similarityThreshold);
              if (isNaN(threshold) || threshold < 0 || threshold > 1) {
                throw new McpError(
                  ErrorCode.InvalidParams,
                  'similarityThreshold must be a number between 0 and 1'
                );
              }
              // Update the parameter with parsed float
              args.similarityThreshold = threshold;
            }
            result = await findDuplicateEvents(calendar, args || {});
            break;
            
          case 'batch_operations':
            // Validate required parameters
            const batchError = validateParams(args, ['operations']);
            if (batchError) {
              throw new McpError(
                ErrorCode.InvalidParams,
                batchError
              );
            }
            
            // Validate that operations is an array
            if (!Array.isArray(args.operations)) {
              throw new McpError(
                ErrorCode.InvalidParams,
                'operations must be an array'
              );
            }
            
            // Execute batch operations
            result = await batchOperations(calendar, args);
            break;
            
          case 'advanced_search_events':
            // Validate time range if provided
            if (args && args.timeRange) {
              // If timeRange is provided, it should be an object
              if (typeof args.timeRange !== 'object') {
                throw new McpError(
                  ErrorCode.InvalidParams,
                  'timeRange must be an object with start and/or end properties'
                );
              }
              
              // Check date formats if provided
              if (args.timeRange.start) {
                try {
                  new Date(args.timeRange.start);
                } catch (e) {
                  throw new McpError(
                    ErrorCode.InvalidParams,
                    'Invalid timeRange.start format. Use ISO 8601 format.'
                  );
                }
              }
              
              if (args.timeRange.end) {
                try {
                  new Date(args.timeRange.end);
                } catch (e) {
                  throw new McpError(
                    ErrorCode.InvalidParams,
                    'Invalid timeRange.end format. Use ISO 8601 format.'
                  );
                }
              }
            }
            
            // Validate attendees if provided
            if (args && args.attendees && !Array.isArray(args.attendees)) {
              throw new McpError(
                ErrorCode.InvalidParams,
                'attendees must be an array of email addresses'
              );
            }
            
            // Execute advanced search
            result = await advancedSearchEvents(calendar, args || {});
            break;
            
          case 'detect_conflicts':
            // Validate required parameters
            const conflictError = validateParams(args, ['start', 'end']);
            if (conflictError) {
              throw new McpError(
                ErrorCode.InvalidParams,
                conflictError
              );
            }
            
            // Validate date formats
            if (args.start) {
              try {
                if (typeof args.start === 'object' && args.start.dateTime) {
                  new Date(args.start.dateTime);
                } else if (typeof args.start === 'object' && args.start.date) {
                  new Date(args.start.date);
                } else {
                  throw new Error('Invalid format');
                }
              } catch (e) {
                throw new McpError(
                  ErrorCode.InvalidParams,
                  'Invalid start time format. Use ISO 8601 format in a dateTime or date property.'
                );
              }
            }
            
            if (args.end) {
              try {
                if (typeof args.end === 'object' && args.end.dateTime) {
                  new Date(args.end.dateTime);
                } else if (typeof args.end === 'object' && args.end.date) {
                  new Date(args.end.date);
                } else {
                  throw new Error('Invalid format');
                }
              } catch (e) {
                throw new McpError(
                  ErrorCode.InvalidParams,
                  'Invalid end time format. Use ISO 8601 format in a dateTime or date property.'
                );
              }
            }
            
            // Validate attendees if provided
            if (args.attendees && !Array.isArray(args.attendees)) {
              throw new McpError(
                ErrorCode.InvalidParams,
                'attendees must be an array of email addresses'
              );
            }
            
            // Execute conflict detection
            result = await detectEventConflicts(calendar, args);
            
            // If no conflicts, return an appropriate response
            if (!result) {
              result = {
                hasConflicts: false,
                timeConflicts: [],
                attendeeConflicts: [],
                summary: {
                  timeConflictsCount: 0,
                  attendeeConflictsCount: 0
                }
              };
            }
            
            break;
            
          case 'create_event_exception':
            // Validate required parameters
            const exceptionError = validateParams(args, ['recurringEventId', 'originalStartTime']);
            if (exceptionError) {
              throw new McpError(
                ErrorCode.InvalidParams,
                exceptionError
              );
            }
            result = await createEventException(calendar, args);
            break;
            
          case 'delete_event_instance':
            // Validate required parameters
            const deleteInstanceError = validateParams(args, ['recurringEventId', 'originalStartTime']);
            if (deleteInstanceError) {
              throw new McpError(
                ErrorCode.InvalidParams,
                deleteInstanceError
              );
            }
            result = await deleteEventInstance(calendar, args);
            break;
            
          case 'manage_webhooks':
            // Validate required parameters
            const webhookError = validateParams(args, ['operation']);
            if (webhookError) {
              throw new McpError(
                ErrorCode.InvalidParams,
                webhookError
              );
            }
            result = await manageWebhooks(calendar, args);
            break;
            
          default:
            throw new McpError(
              ErrorCode.MethodNotFound,
              `Unknown action: ${name}`
            );
        }
        
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(result, null, 2),
            },
          ],
        };
      } catch (error) {
        console.error('Error executing MCP action:', error);
        
        // Categorize errors
        let errorType = ErrorTypes.SERVER_ERROR;
        let errorMessage = error.message || 'An unexpected error occurred';
        let additionalData = null;
        
        if (error.code === 404) {
          errorType = ErrorTypes.NOT_FOUND;
        } else if (error.code === 401 || error.code === 403) {
          errorType = ErrorTypes.AUTHENTICATION;
        } else if (error.code === 400) {
          errorType = ErrorTypes.VALIDATION;
        } else if (error.code === 409 || error.code === 'CONFLICT') {
          errorType = ErrorTypes.SCHEDULING_CONFLICT;
          errorMessage = 'Scheduling conflict detected';
          if (error.conflicts) {
            additionalData = error.conflicts;
          }
        } else if (error.code === 429) {
          errorType = ErrorTypes.RATE_LIMIT;
          errorMessage = 'Google Calendar API rate limit exceeded. Please try again later.';
        } else if (error.errors && error.errors.length > 0) {
          errorType = ErrorTypes.API_ERROR;
          errorMessage = error.errors[0].message;
          
          // Check for specific Google API error reasons
          if (error.errors[0].reason === 'rateLimitExceeded' || error.errors[0].reason === 'userRateLimitExceeded') {
            errorType = ErrorTypes.RATE_LIMIT;
            errorMessage = 'Google Calendar API rate limit exceeded. Please try again later.';
          } else if (error.errors[0].reason === 'quotaExceeded') {
            errorType = ErrorTypes.RATE_LIMIT;
            errorMessage = 'Google Calendar API quota exceeded for today. Please try again tomorrow.';
          }
        }
        
        const errorResponse = {
          error: errorMessage,
          error_type: errorType
        };
        
        // Add conflict data if available
        if (additionalData) {
          errorResponse.conflicts = additionalData;
        }
        
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(errorResponse, null, 2),
            },
          ],
          isError: true,
        };
      }
    });
  }

  async run() {
    try {
      // Initialize database and load tokens at startup
      await db.initDatabase();
      await this.loadTokens();
      console.error('Database initialized and tokens loaded');
      
      // Connect to stdio transport
      const transport = new StdioServerTransport();
      await this.server.connect(transport);
      console.error('Google Calendar MCP server running on stdio');
    } catch (err) {
      console.error('Error starting MCP server:', err);
      process.exit(1);
    }
  }
}

// Create and run the server
const server = new GoogleCalendarMcpServer();
server.run().catch(console.error);
