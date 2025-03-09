const express = require('express');
const { google } = require('googleapis');
const bodyParser = require('body-parser');
const cors = require('cors');
const dotenv = require('dotenv');
const path = require('path');
const db = require('./db');

// Load environment variables
dotenv.config();

const app = express();

// Middleware
app.use(cors());
app.use(bodyParser.json());
app.use(express.static('public'));

// Error types for better categorization
const ErrorTypes = {
  AUTHENTICATION: 'authentication_error',
  VALIDATION: 'validation_error',
  NOT_FOUND: 'not_found_error',
  API_ERROR: 'api_error',
  SERVER_ERROR: 'server_error'
};

// Google OAuth2 configuration
const oauth2Client = new google.auth.OAuth2(
  process.env.GOOGLE_CLIENT_ID,
  process.env.GOOGLE_CLIENT_SECRET,
  process.env.GOOGLE_REDIRECT_URI
);

// Token storage using database
let tokens = null;

/**
 * Save tokens to the database
 * @param {Object} tokenData - The token data to save
 * @returns {Promise<void>}
 */
async function saveTokens(tokenData) {
  if (!tokenData) return;
  
  try {
    tokens = tokenData;
    await db.saveTokens(tokenData);
    console.log('Tokens saved to database');
  } catch (err) {
    console.error('Error saving tokens:', err);
  }
}

/**
 * Load tokens from database
 * @returns {Promise<void>}
 */
async function loadTokens() {
  try {
    const tokenData = await db.loadTokens();
    if (tokenData) {
      tokens = tokenData;
      console.log('Tokens loaded from database');
      
      // Check if token is expired
      if (tokens.expiry_date && Date.now() >= tokens.expiry_date) {
        console.log('Loaded token is expired, will refresh on next use');
      }
    }
  } catch (err) {
    console.error('Error loading tokens:', err);
  }
}

// Initialize database and load tokens at startup
(async () => {
  try {
    await db.initDatabase();
    await loadTokens();
    console.log('Database initialized and tokens loaded');
  } catch (err) {
    console.error('Error initializing database:', err);
  }
})();

/**
 * Validates required parameters against a provided object
 * @param {Object} params - Parameters to validate
 * @param {string[]} required - List of required parameter keys
 * @returns {string|null} - Error message or null if valid
 */
function validateParams(params, required) {
  if (!params) {
    return 'No parameters provided';
  }
  
  const missing = required.filter(param => {
    return params[param] === undefined || params[param] === null;
  });
  
  if (missing.length > 0) {
    return `Missing required parameters: ${missing.join(', ')}`;
  }
  
  return null;
}

// MCP definition endpoint
app.get('/mcp/definition', (req, res) => {
  res.json({
    name: "Google Calendar MCP",
    version: "1.0.0",
    description: "MCP server for Google Calendar access",
    actions: {
      list_calendars: {
        description: "List available calendars the user has access to",
        parameters: {},
        response: {
          status: "success or error",
          data: "Array of calendar objects (if successful)",
          error: "Error message (if failed)",
          error_type: "Type of error that occurred (if failed)"
        },
        required_parameters: []
      },
      list_events: {
        description: "List calendar events based on specified criteria",
        parameters: {
          calendarId: "ID of the calendar to use (defaults to 'primary')",
          timeMin: "ISO date string for the earliest event time (defaults to current time if not specified)",
          timeMax: "ISO date string for the latest event time",
          maxResults: "Maximum number of events to return (defaults to 10)",
          q: "Free text search term to find events that match",
          orderBy: "Sorting order: 'startTime' (default) or 'updated'",
          pageToken: "Token for retrieving the next page of results",
          syncToken: "Token for incremental sync",
          timeZone: "Time zone used in the response",
          showDeleted: "Whether to include deleted events (defaults to false)",
          showHiddenInvitations: "Whether to include hidden invitations (defaults to false)",
          singleEvents: "Whether to expand recurring events (defaults to true)",
          updatedMin: "Lower bound for an event's last modification time (ISO date string)",
          iCalUID: "Filter by specific iCalendar UID"
        },
        response: {
          status: "success or error",
          data: {
            events: "Array of event objects",
            nextPageToken: "Token for the next page of results (if available)",
            syncToken: "Token for future incremental sync (if available)"
          },
          error: "Error message (if failed)",
          error_type: "Type of error that occurred (if failed)"
        },
        required_parameters: ["timeMin (defaults to current time if omitted)"]
      },
      list_recurring_instances: {
        description: "List all instances of a recurring event",
        parameters: {
          calendarId: "ID of the calendar to use (defaults to 'primary')",
          eventId: "ID of the recurring event to get instances for (required)",
          timeMin: "ISO date string for the earliest event time (defaults to current time)",
          timeMax: "ISO date string for the latest event time",
          maxResults: "Maximum number of instances to return (defaults to 10)"
        },
        response: {
          status: "success or error",
          data: "Array of event instance objects (if successful)",
          error: "Error message (if failed)",
          error_type: "Type of error that occurred (if failed)"
        },
        required_parameters: ["eventId"]
      },
      create_event: {
        description: "Create a new calendar event",
        parameters: {
          calendarId: "ID of the calendar to use (defaults to 'primary')",
          summary: "Event title (required)",
          description: "Event description (optional)",
          start: "Event start time object with dateTime and timeZone (required)",
          end: "Event end time object with dateTime and timeZone (required)",
          location: "Event location (optional)",
          recurrence: "Array of RRULE strings for recurring events (optional, e.g. ['RRULE:FREQ=DAILY;COUNT=5'])",
          attendees: "Array of attendee email addresses (optional)",
          sendUpdates: "Preference for sending email updates (optional, 'all', 'externalOnly', or 'none')"
        },
        response: {
          status: "success or error",
          data: "Created event details (if successful)",
          error: "Error message (if failed)",
          error_type: "Type of error that occurred (if failed)"
        },
        required_parameters: ["summary", "start", "end"]
      },
      get_event: {
        description: "Get detailed information for a specific event",
        parameters: {
          calendarId: "ID of the calendar to use (defaults to 'primary')",
          eventId: "ID of the event to retrieve (required)"
        },
        response: {
          status: "success or error",
          data: "Detailed event object (if successful)",
          error: "Error message (if failed)",
          error_type: "Type of error that occurred (if failed)"
        },
        required_parameters: ["eventId"]
      },
      update_event: {
        description: "Update an existing calendar event",
        parameters: {
          calendarId: "ID of the calendar to use (defaults to 'primary')",
          eventId: "ID of the event to update (required)",
          summary: "New event title (optional)",
          description: "New event description (optional)",
          start: "New event start time object with dateTime and timeZone (optional)",
          end: "New event end time object with dateTime and timeZone (optional)",
          location: "New event location (optional)",
          recurrence: "Array of RRULE strings for recurring events (optional, e.g. ['RRULE:FREQ=DAILY;COUNT=5'])",
          attendees: "Array of attendee email addresses (optional)",
          sendUpdates: "Preference for sending email updates (optional, 'all', 'externalOnly', or 'none')"
        },
        response: {
          status: "success or error",
          data: "Updated event details (if successful)",
          error: "Error message (if failed)",
          error_type: "Type of error that occurred (if failed)"
        },
        required_parameters: ["eventId"]
      },
      delete_event: {
        description: "Delete a calendar event",
        parameters: {
          calendarId: "ID of the calendar to use (defaults to 'primary')",
          eventId: "ID of the event to delete (required)",
          sendUpdates: "Preference for sending email updates (optional, 'all', 'externalOnly', or 'none')"
        },
        response: {
          status: "success or error",
          data: "Deletion confirmation (if successful)",
          error: "Error message (if failed)",
          error_type: "Type of error that occurred (if failed)"
        },
        required_parameters: ["eventId"]
      },
      find_duplicates: {
        description: "Identify potential duplicate events in the calendar",
        parameters: {
          calendarId: "ID of the calendar to use (defaults to 'primary')",
          timeMin: "ISO date string for the earliest event time (defaults to current time)",
          timeMax: "ISO date string for the latest event time (defaults to 30 days from now)",
          similarityThreshold: "Threshold for considering events as duplicates (0.0-1.0, defaults to 0.7)"
        },
        response: {
          status: "success or error",
          data: "Groups of potential duplicate events (if successful)",
          error: "Error message (if failed)",
          error_type: "Type of error that occurred (if failed)"
        },
        required_parameters: []
      },
      batch_operations: {
        description: "Execute multiple calendar operations in a single request",
        parameters: {
          operations: "Array of operations to perform, each with 'action' and 'parameters' properties"
        },
        response: {
          status: "success or error",
          data: "Results of batch operations (if successful)",
          error: "Error message (if failed)",
          error_type: "Type of error that occurred (if failed)"
        },
        required_parameters: ["operations"]
      },
      advanced_search_events: {
        description: "Advanced search for events with complex filtering options",
        parameters: {
          calendarId: "ID of the calendar to use (defaults to 'primary')",
          timeRange: "Object with 'start' and 'end' properties (ISO date strings)",
          textSearch: "Search term for event title/description",
          location: "Filter by event location (substring match)",
          attendees: "Array of email addresses to filter by attendance",
          status: "Filter by event status ('confirmed', 'tentative', or 'cancelled')",
          createdAfter: "ISO date string to filter by creation time",
          updatedAfter: "ISO date string to filter by last update time",
          hasAttachments: "Filter to events that have attachments (boolean)",
          isRecurring: "Filter to recurring events or instances (boolean)",
          maxResults: "Maximum number of events to return (defaults to 100)"
        },
        response: {
          status: "success or error",
          data: {
            events: "Array of matching event objects",
            totalMatches: "Total number of events that matched the criteria"
          },
          error: "Error message (if failed)",
          error_type: "Type of error that occurred (if failed)"
        },
        required_parameters: []
      }
    },
    error_types: {
      authentication_error: "User is not authenticated or token is invalid",
      validation_error: "Required parameters are missing or invalid",
      not_found_error: "Requested resource was not found",
      api_error: "Error occurred in the Google Calendar API",
      server_error: "Unexpected server-side error"
    },
    authentication: {
      type: "oauth2",
      login_url: oauth2Client.generateAuthUrl({
        access_type: 'offline',
        scope: ['https://www.googleapis.com/auth/calendar'],
        prompt: 'consent'
      })
    }
  });
});

// MCP execute endpoint
app.post('/mcp/execute', async (req, res) => {
  try {
    // Validate basic request structure
    const { action, parameters } = req.body;
    
    if (!action) {
      return res.json({
        status: 'error',
        error_type: ErrorTypes.VALIDATION,
        error: 'Missing required field: action'
      });
    }
    
    // Check authentication
    if (!tokens) {
      return res.json({
        status: 'error',
        error_type: ErrorTypes.AUTHENTICATION,
        error: 'Not authenticated',
        auth_url: oauth2Client.generateAuthUrl({
          access_type: 'offline',
          scope: ['https://www.googleapis.com/auth/calendar']
        })
      });
    }
    
    // Set up credentials and validate token expiration
    try {
      oauth2Client.setCredentials(tokens);
      
      // Check if token needs refreshing
      if (tokens.expiry_date && Date.now() >= tokens.expiry_date) {
        console.log('Token expired, attempting to refresh...');
        const { credentials } = await oauth2Client.refreshToken(tokens.refresh_token);
        await saveTokens(credentials); // Save the refreshed tokens
        console.log('Tokens refreshed and saved to database');
      }
    } catch (authError) {
      console.error('Authentication error:', authError);
      return res.json({
        status: 'error',
        error_type: ErrorTypes.AUTHENTICATION,
        error: 'Authentication failed. Please log in again.',
        auth_url: oauth2Client.generateAuthUrl({
          access_type: 'offline',
          scope: ['https://www.googleapis.com/auth/calendar']
        })
      });
    }
    
    const calendar = google.calendar({ version: 'v3', auth: oauth2Client });
    
    // Process the requested action
    let result;
    let validationError;
    
    switch (action) {
      case 'list_calendars':
        result = await listCalendars(calendar);
        break;
        
      case 'list_events':
        result = await listEvents(calendar, parameters || {});
        break;
        
      case 'list_recurring_instances':
        // Validate required parameters
        validationError = validateParams(parameters, ['eventId']);
        if (validationError) {
          return res.json({
            status: 'error',
            error_type: ErrorTypes.VALIDATION,
            error: validationError
          });
        }
        result = await listRecurringInstances(calendar, parameters);
        break;
        
      case 'create_event':
        // Validate required parameters
        validationError = validateParams(parameters, ['summary', 'start', 'end']);
        if (validationError) {
          return res.json({
            status: 'error',
            error_type: ErrorTypes.VALIDATION,
            error: validationError
          });
        }
        result = await createEvent(calendar, parameters);
        break;
        
      case 'get_event':
        // Validate required parameters
        validationError = validateParams(parameters, ['eventId']);
        if (validationError) {
          return res.json({
            status: 'error',
            error_type: ErrorTypes.VALIDATION,
            error: validationError
          });
        }
        result = await getEvent(calendar, parameters);
        break;
        
      case 'update_event':
        // Validate required parameters
        validationError = validateParams(parameters, ['eventId']);
        if (validationError) {
          return res.json({
            status: 'error',
            error_type: ErrorTypes.VALIDATION,
            error: validationError
          });
        }
        
        // At least one update field should be provided
        if (!parameters.summary && !parameters.description && 
            !parameters.start && !parameters.end && !parameters.location) {
          return res.json({
            status: 'error',
            error_type: ErrorTypes.VALIDATION,
            error: 'At least one field to update must be provided'
          });
        }
        
        result = await updateEvent(calendar, parameters);
        break;
        
      case 'delete_event':
        // Validate required parameters
        validationError = validateParams(parameters, ['eventId']);
        if (validationError) {
          return res.json({
            status: 'error',
            error_type: ErrorTypes.VALIDATION,
            error: validationError
          });
        }
        result = await deleteEvent(calendar, parameters);
        break;
        
      case 'find_duplicates':
        // Check that similarity threshold is valid if provided
        if (parameters && parameters.similarityThreshold !== undefined) {
          const threshold = parseFloat(parameters.similarityThreshold);
          if (isNaN(threshold) || threshold < 0 || threshold > 1) {
            return res.json({
              status: 'error',
              error_type: ErrorTypes.VALIDATION,
              error: 'similarityThreshold must be a number between 0 and 1'
            });
          }
          // Update the parameter with parsed float
          parameters.similarityThreshold = threshold;
        }
        result = await findDuplicateEvents(calendar, parameters || {});
        break;
        
      case 'batch_operations':
        // Validate required parameters
        validationError = validateParams(parameters, ['operations']);
        if (validationError) {
          return res.json({
            status: 'error',
            error_type: ErrorTypes.VALIDATION,
            error: validationError
          });
        }
        
        // Validate that operations is an array
        if (!Array.isArray(parameters.operations)) {
          return res.json({
            status: 'error',
            error_type: ErrorTypes.VALIDATION,
            error: 'operations must be an array'
          });
        }
        
        // Execute batch operations
        result = await batchOperations(calendar, parameters);
        break;
        
      case 'advanced_search_events':
        // Validate time range if provided
        if (parameters && parameters.timeRange) {
          // If timeRange is provided, it should be an object
          if (typeof parameters.timeRange !== 'object') {
            return res.json({
              status: 'error',
              error_type: ErrorTypes.VALIDATION,
              error: 'timeRange must be an object with start and/or end properties'
            });
          }
          
          // Check date formats if provided
          if (parameters.timeRange.start) {
            try {
              new Date(parameters.timeRange.start);
            } catch (e) {
              return res.json({
                status: 'error',
                error_type: ErrorTypes.VALIDATION,
                error: 'Invalid timeRange.start format. Use ISO 8601 format.'
              });
            }
          }
          
          if (parameters.timeRange.end) {
            try {
              new Date(parameters.timeRange.end);
            } catch (e) {
              return res.json({
                status: 'error',
                error_type: ErrorTypes.VALIDATION,
                error: 'Invalid timeRange.end format. Use ISO 8601 format.'
              });
            }
          }
        }
        
        // Validate attendees if provided
        if (parameters && parameters.attendees && !Array.isArray(parameters.attendees)) {
          return res.json({
            status: 'error',
            error_type: ErrorTypes.VALIDATION,
            error: 'attendees must be an array of email addresses'
          });
        }
        
        // Execute advanced search
        result = await advancedSearchEvents(calendar, parameters || {});
        break;
        
      default:
        return res.json({
          status: 'error',
          error_type: ErrorTypes.VALIDATION,
          error: `Unknown action: ${action}`
        });
    }
    
    return res.json({
      status: 'success',
      data: result
    });
  } catch (error) {
    console.error('Error executing MCP action:', error);
    
    // Categorize errors
    let errorType = ErrorTypes.SERVER_ERROR;
    let errorMessage = error.message || 'An unexpected error occurred';
    
    if (error.code === 404) {
      errorType = ErrorTypes.NOT_FOUND;
    } else if (error.code === 401 || error.code === 403) {
      errorType = ErrorTypes.AUTHENTICATION;
    } else if (error.errors && error.errors.length > 0) {
      errorType = ErrorTypes.API_ERROR;
      errorMessage = error.errors[0].message;
    }
    
    return res.json({
      status: 'error',
      error_type: errorType,
      error: errorMessage
    });
  }
});

// Home route
app.get('/', (req, res) => {
  // Check if authenticated
  if (!tokens) {
    const authUrl = oauth2Client.generateAuthUrl({
      access_type: 'offline',
      scope: ['https://www.googleapis.com/auth/calendar'],
      prompt: 'consent' // Force prompt to ensure refresh token is always provided
    });
    
    return res.send(`
      <h1>Google Calendar MCP</h1>
      <p>Status: <span style="color: red;">Not authenticated</span></p>
      <p><a href="${authUrl}" style="display: inline-block; background-color: #4285f4; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px;">Login with Google</a></p>
      <hr>
      <h2>Available MCP Endpoints</h2>
      <ul>
        <li><code>/mcp/definition</code> - GET endpoint for MCP capabilities</li>
        <li><code>/mcp/execute</code> - POST endpoint for executing actions</li>
      </ul>
      <p>See documentation at <a href="/index.html">/index.html</a> for sample requests.</p>
    `);
  }
  
  // Get token expiry info
  let tokenStatus = 'Active';
  let tokenExpiry = 'Unknown';
  
  if (tokens.expiry_date) {
    const expiryDate = new Date(tokens.expiry_date);
    tokenExpiry = expiryDate.toLocaleString();
    
    if (Date.now() >= tokens.expiry_date) {
      tokenStatus = 'Expired (will be refreshed on next request)';
    } else {
      const timeLeft = Math.floor((tokens.expiry_date - Date.now()) / 1000 / 60);
      tokenStatus = `Valid (expires in ${timeLeft} minutes)`;
    }
  }
  
  res.send(`
    <h1>Google Calendar MCP</h1>
    <p>Status: <span style="color: green;">Authenticated</span></p>
    <p>Token status: ${tokenStatus}</p>
    <p>Token expiry: ${tokenExpiry}</p>
    <p><a href="/logout" style="display: inline-block; background-color: #f44336; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px;">Logout</a></p>
    <hr>
    <h2>Available MCP Endpoints</h2>
    <ul>
      <li><code>/mcp/definition</code> - GET endpoint for MCP capabilities</li>
      <li><code>/mcp/execute</code> - POST endpoint for executing actions</li>
    </ul>
    <p>See the client at <a href="/index.html">/index.html</a> to test the MCP server.</p>
    <hr>
    <p><small>Tokens are securely stored in a SQLite database.</small></p>
  `);
});

// OAuth callback route
app.get('/auth/google/callback', async (req, res) => {
  const { code } = req.query;
  
  if (!code) {
    console.error('No authorization code provided');
    return res.status(400).send('<h1>Authentication Error</h1><p>No authorization code provided. Please try again.</p>');
  }
  
  try {
    const { tokens: newTokens } = await oauth2Client.getToken(code);
    
    if (!newTokens) {
      throw new Error('Failed to retrieve tokens');
    }
    
    // Store tokens and add expiry if not present
    if (!newTokens.expiry_date) {
      // Set default expiry (1 hour from now)
      newTokens.expiry_date = Date.now() + 3600000;
    }
    
    // Save tokens to database for persistence between server restarts
    await saveTokens(newTokens);
    
    console.log('Authentication successful, tokens received and saved');
    
    // Send a more user-friendly response
    res.send(`
      <h1>Authentication Successful!</h1>
      <p>You have successfully authenticated with Google Calendar.</p>
      <p>You can now close this window and return to the application.</p>
      <script>
        // Redirect to home page after 3 seconds
        setTimeout(() => {
          window.location.href = '/';
        }, 3000);
      </script>
    `);
  } catch (error) {
    console.error('Error retrieving access token:', error);
    
    let errorMessage = 'Error retrieving access token';
    if (error.message) {
      errorMessage += `: ${error.message}`;
    }
    
    res.status(500).send(`
      <h1>Authentication Error</h1>
      <p>${errorMessage}</p>
      <p><a href="/">Return to home page</a></p>
    `);
  }
});

// Action implementations
/**
 * List calendar events with optional filters
 * @param {Object} calendar - Google Calendar API client
 * @param {Object} params - Parameters for listing events
 * @returns {Object} Object containing events array and pagination tokens
 */
async function listEvents(calendar, { 
  calendarId = 'primary', 
  timeMin, 
  maxResults = 10, 
  timeMax, 
  q,
  orderBy = 'startTime',
  pageToken,
  syncToken,
  timeZone,
  showDeleted = false,
  showHiddenInvitations = false,
  singleEvents = true,
  updatedMin,
  iCalUID
}) {
  try {
    // Build request parameters with all available filters
    const requestParams = {
      calendarId: calendarId,
      timeMin: timeMin || (new Date()).toISOString(),
      maxResults: parseInt(maxResults, 10) || 10,
      singleEvents: singleEvents !== false, // Default to true unless explicitly set to false
      orderBy: ['startTime', 'updated'].includes(orderBy) ? orderBy : 'startTime',
    };
    
    // Add optional parameters if provided
    if (timeMax) requestParams.timeMax = timeMax;
    if (q) requestParams.q = q;
    if (pageToken) requestParams.pageToken = pageToken;
    if (syncToken) requestParams.syncToken = syncToken;
    if (timeZone) requestParams.timeZone = timeZone;
    if (showDeleted === true) requestParams.showDeleted = true;
    if (showHiddenInvitations === true) requestParams.showHiddenInvitations = true;
    if (updatedMin) requestParams.updatedMin = updatedMin;
    if (iCalUID) requestParams.iCalUID = iCalUID;
    
    const response = await calendar.events.list(requestParams);
    
    // Prepare result object with pagination tokens
    const result = {
      events: [],
      nextPageToken: response.data.nextPageToken || null,
      syncToken: response.data.nextSyncToken || null
    };
    
    if (!response.data.items) {
      return result;
    }
    
    result.events = response.data.items.map(event => ({
      id: event.id,
      calendarId: calendarId,
      summary: event.summary || '',
      description: event.description || '',
      start: event.start,
      end: event.end,
      location: event.location || '',
      htmlLink: event.htmlLink,
      created: event.created,
      updated: event.updated,
      status: event.status,
      recurrence: event.recurrence || null,
      recurringEventId: event.recurringEventId || null,
      originalStartTime: event.originalStartTime || null,
      isRecurringEvent: Boolean(event.recurrence),
      isRecurringInstance: Boolean(event.recurringEventId),
      attendees: event.attendees || [],
      organizer: event.organizer || null,
      hasAttachments: Boolean(event.attachments && event.attachments.length > 0)
    }));
    
    return result;
  } catch (error) {
    console.error('Error listing events:', error);
    throw error;
  }
}

/**
 * Create a new calendar event
 * @param {Object} calendar - Google Calendar API client
 * @param {Object} params - Event parameters
 * @returns {Object} Created event details
 */
async function createEvent(calendar, { calendarId = 'primary', summary, description, start, end, location, recurrence, attendees, sendUpdates }) {
  try {
    // Validate date formats
    if (start && typeof start === 'object' && start.dateTime) {
      try {
        new Date(start.dateTime);
      } catch (e) {
        throw new Error('Invalid start.dateTime format. Use ISO 8601 format.');
      }
    }
    
    if (end && typeof end === 'object' && end.dateTime) {
      try {
        new Date(end.dateTime);
      } catch (e) {
        throw new Error('Invalid end.dateTime format. Use ISO 8601 format.');
      }
    }
    
    // Create base event object
    const event = {
      summary,
      description: description || '',
      start,
      end,
      location: location || ''
    };
    
    // Add recurrence if provided
    if (recurrence && Array.isArray(recurrence)) {
      event.recurrence = recurrence;
    }
    
    // Add attendees if provided
    if (attendees && Array.isArray(attendees)) {
      event.attendees = attendees.map(email => ({ email }));
    }
    
    // Prepare request parameters
    const requestParams = {
      calendarId: calendarId,
      resource: event
    };
    
    // Add sendUpdates if provided
    if (sendUpdates && ['all', 'externalOnly', 'none'].includes(sendUpdates)) {
      requestParams.sendUpdates = sendUpdates;
    }
    
    const response = await calendar.events.insert(requestParams);
    
    // Return event details including recurrence information if available
    return {
      id: response.data.id,
      calendarId: calendarId,
      htmlLink: response.data.htmlLink,
      status: response.data.status,
      created: response.data.created,
      recurrence: response.data.recurrence || null,
      recurringEventId: response.data.recurringEventId || null
    };
  } catch (error) {
    console.error('Error creating event:', error);
    throw error;
  }
}

/**
 * Get details for a specific calendar event
 * @param {Object} calendar - Google Calendar API client
 * @param {Object} params - Parameters with eventId
 * @returns {Object} Event details
 */
async function getEvent(calendar, { calendarId = 'primary', eventId }) {
  try {
    if (!eventId) {
      throw new Error('Event ID is required');
    }
    
    const response = await calendar.events.get({
      calendarId: calendarId,
      eventId: eventId
    });
    
    return {
      id: response.data.id,
      calendarId: calendarId,
      summary: response.data.summary || '',
      description: response.data.description || '',
      start: response.data.start,
      end: response.data.end,
      location: response.data.location || '',
      htmlLink: response.data.htmlLink,
      created: response.data.created,
      updated: response.data.updated,
      status: response.data.status,
      attendees: response.data.attendees || [],
      recurrence: response.data.recurrence || null,
      recurringEventId: response.data.recurringEventId || null,
      // For recurring events, include the instance info
      originalStartTime: response.data.originalStartTime || null
    };
  } catch (error) {
    console.error('Error getting event:', error);
    
    // Handle specific error cases
    if (error.code === 404) {
      throw new Error(`Event not found with ID: ${eventId} in calendar: ${calendarId}`);
    }
    
    throw error;
  }
}

/**
 * Update an existing calendar event
 * @param {Object} calendar - Google Calendar API client
 * @param {Object} params - Parameters for updating the event
 * @returns {Object} Updated event details
 */
async function updateEvent(calendar, { calendarId = 'primary', eventId, summary, description, start, end, location, recurrence, attendees, sendUpdates }) {
  try {
    if (!eventId) {
      throw new Error('Event ID is required');
    }
    
    // First get the existing event to ensure it exists and to preserve fields not being updated
    const currentEvent = await calendar.events.get({
      calendarId: calendarId,
      eventId: eventId
    });
    
    // Build the update using the current event as base and overriding with new values
    const eventUpdate = {
      ...currentEvent.data
    };
    
    // Update fields if provided in params
    if (summary !== undefined) eventUpdate.summary = summary;
    if (description !== undefined) eventUpdate.description = description;
    if (start !== undefined) eventUpdate.start = start;
    if (end !== undefined) eventUpdate.end = end;
    if (location !== undefined) eventUpdate.location = location;
    
    // Update recurrence if provided
    if (recurrence !== undefined) {
      if (recurrence === null) {
        // Remove recurrence
        delete eventUpdate.recurrence;
      } else if (Array.isArray(recurrence)) {
        // Update recurrence
        eventUpdate.recurrence = recurrence;
      }
    }
    
    // Update attendees if provided
    if (attendees !== undefined) {
      if (attendees === null) {
        // Remove attendees
        delete eventUpdate.attendees;
      } else if (Array.isArray(attendees)) {
        // Update attendees
        eventUpdate.attendees = attendees.map(email => ({ email }));
      }
    }
    
    // Validate date formats if provided
    if (start && typeof start === 'object' && start.dateTime) {
      try {
        new Date(start.dateTime);
      } catch (e) {
        throw new Error('Invalid start.dateTime format. Use ISO 8601 format.');
      }
    }
    
    if (end && typeof end === 'object' && end.dateTime) {
      try {
        new Date(end.dateTime);
      } catch (e) {
        throw new Error('Invalid end.dateTime format. Use ISO 8601 format.');
      }
    }
    
    // Prepare request parameters
    const requestParams = {
      calendarId: calendarId,
      eventId: eventId,
      resource: eventUpdate
    };
    
    // Add sendUpdates if provided
    if (sendUpdates && ['all', 'externalOnly', 'none'].includes(sendUpdates)) {
      requestParams.sendUpdates = sendUpdates;
    }
    
    // Send the update request
    const response = await calendar.events.update(requestParams);
    
    return {
      id: response.data.id,
      calendarId: calendarId,
      summary: response.data.summary || '',
      description: response.data.description || '',
      start: response.data.start,
      end: response.data.end,
      location: response.data.location || '',
      htmlLink: response.data.htmlLink,
      updated: response.data.updated,
      status: response.data.status,
      recurrence: response.data.recurrence || null,
      recurringEventId: response.data.recurringEventId || null,
      attendees: response.data.attendees || []
    };
  } catch (error) {
    console.error('Error updating event:', error);
    
    // Handle specific error cases
    if (error.code === 404) {
      throw new Error(`Event not found with ID: ${eventId} in calendar: ${calendarId}`);
    }
    
    throw error;
  }
}

/**
 * Delete a calendar event
 * @param {Object} calendar - Google Calendar API client
 * @param {Object} params - Parameters with eventId
 * @returns {Object} Deletion status
 */
async function deleteEvent(calendar, { calendarId = 'primary', eventId, sendUpdates }) {
  try {
    if (!eventId) {
      throw new Error('Event ID is required');
    }
    
    // Verify the event exists first
    const eventResponse = await calendar.events.get({
      calendarId: calendarId,
      eventId: eventId
    });
    
    // Check if this is a recurring event
    const isRecurring = eventResponse.data.recurrence || eventResponse.data.recurringEventId;
    
    // Prepare request parameters
    const requestParams = {
      calendarId: calendarId,
      eventId: eventId
    };
    
    // Add sendUpdates if provided
    if (sendUpdates && ['all', 'externalOnly', 'none'].includes(sendUpdates)) {
      requestParams.sendUpdates = sendUpdates;
    }
    
    // Delete the event
    await calendar.events.delete(requestParams);
    
    return {
      eventId: eventId,
      calendarId: calendarId,
      deleted: true,
      wasRecurring: Boolean(isRecurring),
      timestamp: new Date().toISOString()
    };
  } catch (error) {
    console.error('Error deleting event:', error);
    
    // Handle specific error cases
    if (error.code === 404) {
      throw new Error(`Event not found with ID: ${eventId} in calendar: ${calendarId}`);
    }
    
    throw error;
  }
}

/**
 * Find potential duplicate events in the calendar
 * @param {Object} calendar - Google Calendar API client
 * @param {Object} params - Parameters for finding duplicates
 * @returns {Object} List of potential duplicate groups
 */
async function findDuplicateEvents(calendar, { calendarId = 'primary', timeMin, timeMax, similarityThreshold = 0.7 }) {
  try {
    // Default time range if not specified (from now to 30 days in the future)
    const now = new Date();
    const defaultTimeMin = now.toISOString();
    const defaultTimeMax = new Date(now.setDate(now.getDate() + 30)).toISOString();
    
    // Build request parameters
    const requestParams = {
      calendarId: calendarId,
      timeMin: timeMin || defaultTimeMin,
      timeMax: timeMax || defaultTimeMax,
      maxResults: 2500, // Get a large number of events to find duplicates
      singleEvents: true,
      orderBy: 'startTime',
    };
    
    // Get all events in the time range
    const response = await calendar.events.list(requestParams);
    
    if (!response.data.items || response.data.items.length === 0) {
      return { 
        duplicateGroups: [],
        message: "No events found in the specified time range",
        calendarId: calendarId 
      };
    }
    
    const events = response.data.items;
    const duplicateGroups = [];
    
    // Helper function to calculate string similarity (Levenshtein distance based)
    function calculateSimilarity(str1, str2) {
      if (!str1 || !str2) return 0;
      
      // Convert to lowercase for comparison
      str1 = str1.toLowerCase();
      str2 = str2.toLowerCase();
      
      // If strings are identical, return 1
      if (str1 === str2) return 1;
      
      // Calculate Levenshtein distance
      const len1 = str1.length;
      const len2 = str2.length;
      const maxLen = Math.max(len1, len2);
      
      // Use dynamic programming to compute Levenshtein distance
      const dp = Array(len1 + 1).fill().map(() => Array(len2 + 1).fill(0));
      
      for (let i = 0; i <= len1; i++) dp[i][0] = i;
      for (let j = 0; j <= len2; j++) dp[0][j] = j;
      
      for (let i = 1; i <= len1; i++) {
        for (let j = 1; j <= len2; j++) {
          const cost = str1[i-1] === str2[j-1] ? 0 : 1;
          dp[i][j] = Math.min(
            dp[i-1][j] + 1,
            dp[i][j-1] + 1,
            dp[i-1][j-1] + cost
          );
        }
      }
      
      // Convert distance to similarity score (0 to 1)
      const distance = dp[len1][len2];
      return 1 - (distance / maxLen);
    }
    
    // Function to check if two events might be duplicates
    function arePotentialDuplicates(event1, event2, threshold) {
      // Summary similarity
      const summarySimilarity = calculateSimilarity(
        event1.summary || '', 
        event2.summary || ''
      );
      
      // Time proximity (check if event times are close)
      const start1 = new Date(event1.start.dateTime || event1.start.date);
      const start2 = new Date(event2.start.dateTime || event2.start.date);
      const timeDiffMs = Math.abs(start1 - start2);
      const timeDiffHours = timeDiffMs / (1000 * 60 * 60);
      const timeProximity = timeDiffHours < 48 ? 1 : 0; // Consider as close if within 48 hours
      
      // Overall similarity score, weighted more toward summary
      const overallSimilarity = (summarySimilarity * 0.7) + (timeProximity * 0.3);
      
      return overallSimilarity >= threshold;
    }
    
    // Find duplicate groups
    const processedEvents = new Set();
    
    for (let i = 0; i < events.length; i++) {
      const event1 = events[i];
      
      // Skip if this event has already been included in a duplicate group
      if (processedEvents.has(event1.id)) continue;
      
      const duplicates = [event1];
      
      for (let j = i + 1; j < events.length; j++) {
        const event2 = events[j];
        
        // Skip if this event has already been included in a duplicate group
        if (processedEvents.has(event2.id)) continue;
        
        if (arePotentialDuplicates(event1, event2, similarityThreshold)) {
          duplicates.push(event2);
          processedEvents.add(event2.id);
        }
      }
      
      // If we found duplicates, add the group
      if (duplicates.length > 1) {
        duplicateGroups.push({
          events: duplicates.map(event => ({
            id: event.id,
            calendarId: calendarId,
            summary: event.summary || '',
            description: event.description || '',
            start: event.start,
            end: event.end,
            location: event.location || '',
            created: event.created,
            creator: event.creator,
            htmlLink: event.htmlLink
          }))
        });
        
        // Mark all events in this group as processed
        duplicates.forEach(event => processedEvents.add(event.id));
      }
    }
    
    return {
      duplicateGroups,
      count: duplicateGroups.length,
      calendarId: calendarId,
      timeRange: {
        from: requestParams.timeMin,
        to: requestParams.timeMax
      }
    };
  } catch (error) {
    console.error('Error finding duplicate events:', error);
    throw error;
  }
}

/**
 * List available calendars the user has access to
 * @param {Object} calendar - Google Calendar API client
 * @returns {Array} Array of calendar objects
 */
async function listCalendars(calendar) {
  try {
    const response = await calendar.calendarList.list();
    
    if (!response.data.items) {
      return [];
    }
    
    return response.data.items.map(calendar => ({
      id: calendar.id,
      summary: calendar.summary || '',
      description: calendar.description || '',
      primary: calendar.primary || false,
      accessRole: calendar.accessRole || '',
      backgroundColor: calendar.backgroundColor || '#000000',
      foregroundColor: calendar.foregroundColor || '#FFFFFF',
      timeZone: calendar.timeZone || 'UTC',
      selected: calendar.selected || false
    }));
  } catch (error) {
    console.error('Error listing calendars:', error);
    throw error;
  }
}

/**
 * List all instances of a recurring event
 * @param {Object} calendar - Google Calendar API client
 * @param {Object} params - Parameters for listing instances
 * @returns {Array} Array of event instances
 */
async function listRecurringInstances(calendar, { calendarId = 'primary', eventId, timeMin, timeMax, maxResults = 10 }) {
  try {
    if (!eventId) {
      throw new Error('Event ID is required');
    }
    
    // First get the event to verify it exists and check if it's recurring
    const eventResponse = await calendar.events.get({
      calendarId: calendarId,
      eventId: eventId
    });
    
    // Check if it's a recurring event (has recurrence rules)
    const isRecurring = Boolean(eventResponse.data.recurrence);
    
    if (!isRecurring) {
      // Return the single event in an array if it's not recurring
      return [{
        id: eventResponse.data.id,
        calendarId: calendarId,
        summary: eventResponse.data.summary || '',
        description: eventResponse.data.description || '',
        start: eventResponse.data.start,
        end: eventResponse.data.end,
        location: eventResponse.data.location || '',
        htmlLink: eventResponse.data.htmlLink,
        isRecurringEvent: false,
        recurrence: null,
        message: "This is not a recurring event"
      }];
    }
    
    // Build request parameters
    const requestParams = {
      calendarId: calendarId,
      eventId: eventId,
      maxResults: parseInt(maxResults, 10) || 10
    };
    
    // Add optional time parameters if provided
    if (timeMin) requestParams.timeMin = timeMin;
    if (timeMax) requestParams.timeMax = timeMax;
    
    // Get instances of the recurring event
    const response = await calendar.events.instances(requestParams);
    
    if (!response.data.items) {
      return [];
    }
    
    return response.data.items.map(instance => ({
      id: instance.id,
      calendarId: calendarId,
      summary: instance.summary || '',
      description: instance.description || '',
      start: instance.start,
      end: instance.end,
      location: instance.location || '',
      htmlLink: instance.htmlLink,
      created: instance.created,
      updated: instance.updated,
      status: instance.status,
      recurringEventId: instance.recurringEventId,
      originalStartTime: instance.originalStartTime,
      isRecurringInstance: true
    }));
  } catch (error) {
    console.error('Error listing recurring event instances:', error);
    
    // Handle specific error cases
    if (error.code === 404) {
      throw new Error(`Event not found with ID: ${eventId} in calendar: ${calendarId}`);
    }
    
    throw error;
  }
}

/**
 * Execute batch operations on calendar events
 * @param {Object} calendar - Google Calendar API client
 * @param {Object} params - Parameters for batch operations
 * @returns {Array} Results of batch operations
 */
async function batchOperations(calendar, { operations = [] }) {
  try {
    if (!Array.isArray(operations) || operations.length === 0) {
      throw new Error('No operations provided for batch processing');
    }
    
    // Validate each operation
    for (const op of operations) {
      if (!op.action) {
        throw new Error('Each operation must have an action property');
      }
      if (!op.parameters) {
        throw new Error('Each operation must have parameters');
      }
    }
    
    // Track results
    const results = [];
    
    // Process operations sequentially
    // Note: We're not using true batch API calls here as it requires more complex setup
    // This implementation processes requests sequentially but in a single request to our MCP
    for (let i = 0; i < operations.length; i++) {
      const { action, parameters } = operations[i];
      let result;
      
      try {
        switch (action) {
          case 'create_event':
            // Validate required parameters
            const createError = validateParams(parameters, ['summary', 'start', 'end']);
            if (createError) {
              results.push({
                action: 'create_event',
                success: false,
                error: createError,
                error_type: ErrorTypes.VALIDATION
              });
              continue;
            }
            result = await createEvent(calendar, parameters);
            results.push({
              action: 'create_event',
              success: true,
              data: result
            });
            break;
            
          case 'update_event':
            // Validate required parameters
            const updateError = validateParams(parameters, ['eventId']);
            if (updateError) {
              results.push({
                action: 'update_event',
                success: false,
                error: updateError,
                error_type: ErrorTypes.VALIDATION
              });
              continue;
            }
            
            // Make sure at least one field to update is provided
            if (!parameters.summary && !parameters.description && 
                !parameters.start && !parameters.end && !parameters.location &&
                !parameters.recurrence && !parameters.attendees) {
              results.push({
                action: 'update_event',
                success: false,
                error: 'At least one field to update must be provided',
                error_type: ErrorTypes.VALIDATION
              });
              continue;
            }
            
            result = await updateEvent(calendar, parameters);
            results.push({
              action: 'update_event',
              success: true,
              data: result
            });
            break;
            
          case 'delete_event':
            // Validate required parameters
            const deleteError = validateParams(parameters, ['eventId']);
            if (deleteError) {
              results.push({
                action: 'delete_event',
                success: false,
                error: deleteError,
                error_type: ErrorTypes.VALIDATION
              });
              continue;
            }
            
            result = await deleteEvent(calendar, parameters);
            results.push({
              action: 'delete_event',
              success: true,
              data: result
            });
            break;
            
          case 'get_event':
            // Validate required parameters
            const getError = validateParams(parameters, ['eventId']);
            if (getError) {
              results.push({
                action: 'get_event',
                success: false,
                error: getError,
                error_type: ErrorTypes.VALIDATION
              });
              continue;
            }
            
            result = await getEvent(calendar, parameters);
            results.push({
              action: 'get_event',
              success: true,
              data: result
            });
            break;
            
          default:
            results.push({
              action: action,
              success: false,
              error: `Unsupported action in batch operation: ${action}`,
              error_type: ErrorTypes.VALIDATION
            });
        }
      } catch (error) {
        console.error(`Error in batch operation (${action}):`, error);
        
        // Categorize errors
        let errorType = ErrorTypes.SERVER_ERROR;
        let errorMessage = error.message || 'An unexpected error occurred';
        
        if (error.code === 404) {
          errorType = ErrorTypes.NOT_FOUND;
        } else if (error.code === 401 || error.code === 403) {
          errorType = ErrorTypes.AUTHENTICATION;
        } else if (error.errors && error.errors.length > 0) {
          errorType = ErrorTypes.API_ERROR;
          errorMessage = error.errors[0].message;
        }
        
        results.push({
          action: action,
          success: false,
          error: errorMessage,
          error_type: errorType
        });
      }
    }
    
    return {
      operations_count: operations.length,
      results: results,
      success_count: results.filter(r => r.success).length,
      error_count: results.filter(r => !r.success).length
    };
  } catch (error) {
    console.error('Error executing batch operations:', error);
    throw error;
  }
}

/**
 * Advanced search for events with complex filtering
 * @param {Object} calendar - Google Calendar API client
 * @param {Object} params - Parameters for advanced search
 * @returns {Object} Object containing filtered events and stats
 */
async function advancedSearchEvents(calendar, {
  calendarId = 'primary',
  timeRange,
  textSearch,
  location,
  attendees,
  status,
  createdAfter,
  updatedAfter,
  hasAttachments,
  isRecurring,
  maxResults = 100
}) {
  try {
    // Build initial request parameters for Google Calendar API
    const requestParams = {
      calendarId: calendarId,
      maxResults: 2500, // Get more events to allow for client-side filtering
      singleEvents: true,
      orderBy: 'startTime'
    };
    
    // Add time range if provided
    if (timeRange) {
      if (timeRange.start) requestParams.timeMin = timeRange.start;
      if (timeRange.end) requestParams.timeMax = timeRange.end;
    } else {
      // Default to events from now forward
      requestParams.timeMin = new Date().toISOString();
    }
    
    // Add text search if provided (this is passed directly to the API)
    if (textSearch) requestParams.q = textSearch;
    
    // Add updated time filter if provided (this is passed directly to the API)
    if (updatedAfter) requestParams.updatedMin = updatedAfter;
    
    // Get events from the API
    const response = await calendar.events.list(requestParams);
    
    if (!response.data.items || response.data.items.length === 0) {
      return { 
        events: [],
        totalMatches: 0
      };
    }
    
    // Start with all events
    let filteredEvents = response.data.items;
    
    // Apply additional client-side filtering for criteria not supported by the API
    
    // Filter by location
    if (location) {
      const locationLower = location.toLowerCase();
      filteredEvents = filteredEvents.filter(event => 
        event.location && event.location.toLowerCase().includes(locationLower)
      );
    }
    
    // Filter by attendees
    if (attendees && Array.isArray(attendees) && attendees.length > 0) {
      filteredEvents = filteredEvents.filter(event => {
        if (!event.attendees || event.attendees.length === 0) return false;
        
        return attendees.some(email => 
          event.attendees.some(a => 
            a.email && a.email.toLowerCase() === email.toLowerCase()
          )
        );
      });
    }
    
    // Filter by event status
    if (status && ['confirmed', 'tentative', 'cancelled'].includes(status)) {
      filteredEvents = filteredEvents.filter(event => event.status === status);
    }
    
    // Filter by creation time
    if (createdAfter) {
      const createdTime = new Date(createdAfter).getTime();
      filteredEvents = filteredEvents.filter(event => 
        event.created && new Date(event.created).getTime() >= createdTime
      );
    }
    
    // Filter by attachments
    if (hasAttachments === true) {
      filteredEvents = filteredEvents.filter(event => 
        event.attachments && event.attachments.length > 0
      );
    }
    
    // Filter by recurrence
    if (isRecurring !== undefined) {
      if (isRecurring === true) {
        // Include both recurring event masters and instances
        filteredEvents = filteredEvents.filter(event => 
          (event.recurrence && event.recurrence.length > 0) || event.recurringEventId
        );
      } else {
        // Only include single (non-recurring) events
        filteredEvents = filteredEvents.filter(event => 
          !event.recurrence && !event.recurringEventId
        );
      }
    }
    
    // Get total count before limiting results
    const totalMatches = filteredEvents.length;
    
    // Limit results to the requested number
    filteredEvents = filteredEvents.slice(0, Math.min(maxResults, filteredEvents.length));
    
    // Map to our standard event format
    const formattedEvents = filteredEvents.map(event => ({
      id: event.id,
      calendarId: calendarId,
      summary: event.summary || '',
      description: event.description || '',
      start: event.start,
      end: event.end,
      location: event.location || '',
      htmlLink: event.htmlLink,
      created: event.created,
      updated: event.updated,
      status: event.status,
      recurrence: event.recurrence || null,
      recurringEventId: event.recurringEventId || null,
      originalStartTime: event.originalStartTime || null,
      isRecurringEvent: Boolean(event.recurrence),
      isRecurringInstance: Boolean(event.recurringEventId),
      attendees: event.attendees || [],
      organizer: event.organizer || null,
      hasAttachments: Boolean(event.attachments && event.attachments.length > 0)
    }));
    
    return {
      events: formattedEvents,
      totalMatches: totalMatches,
      limitApplied: totalMatches > maxResults
    };
  } catch (error) {
    console.error('Error in advanced search:', error);
    throw error;
  }
}

/**
 * Revoke tokens and remove from database
 * @returns {Promise<boolean>} Success status
 */
async function revokeTokens() {
  try {
    if (!tokens || !tokens.access_token) {
      return false;
    }

    // Revoke access token with Google
    await oauth2Client.revokeToken(tokens.access_token);

    // Remove tokens from database
    await db.deleteTokens();

    // Clear in-memory tokens
    tokens = null;

    return true;
  } catch (error) {
    console.error('Error revoking tokens:', error);
    return false;
  }
}

// Logout endpoint
app.get('/logout', async (req, res) => {
  try {
    const success = await revokeTokens();
    
    if (success) {
      res.send(`
        <h1>Logged Out</h1>
        <p>You have been successfully logged out of Google Calendar.</p>
        <p><a href="/">Return to home page</a></p>
        <script>
          // Redirect to home page after 3 seconds
          setTimeout(() => {
            window.location.href = '/';
          }, 3000);
        </script>
      `);
    } else {
      res.send(`
        <h1>Logout Error</h1>
        <p>There was an error during logout. You may not have been logged in.</p>
        <p><a href="/">Return to home page</a></p>
      `);
    }
  } catch (error) {
    console.error('Error during logout:', error);
    res.status(500).send(`
      <h1>Logout Error</h1>
      <p>An unexpected error occurred during logout.</p>
      <p><a href="/">Return to home page</a></p>
    `);
  }
});

module.exports = { 
  app, 
  validateParams, 
  ErrorTypes,
  // Export functions for testing
  listCalendars,
  listEvents,
  listRecurringInstances,
  createEvent,
  getEvent,
  updateEvent,
  deleteEvent,
  findDuplicateEvents,
  batchOperations,
  advancedSearchEvents
};