const express = require('express');
const { google } = require('googleapis');
const bodyParser = require('body-parser');
const cors = require('cors');
const dotenv = require('dotenv');
const fs = require('fs');
const path = require('path');

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

// Token storage
// For development only - in production use a secure database
const TOKEN_PATH = path.join(__dirname, '.token-cache.json');
let tokens = null;

/**
 * Save tokens to a local file (for development purposes only)
 * In production, use a secure database
 */
function saveTokens() {
  if (!tokens) return;
  
  try {
    fs.writeFileSync(TOKEN_PATH, JSON.stringify(tokens), { encoding: 'utf8' });
    console.log('Tokens saved to', TOKEN_PATH);
  } catch (err) {
    console.error('Error saving tokens:', err);
  }
}

/**
 * Load tokens from local file if available
 * In production, use a secure database
 */
function loadTokens() {
  try {
    if (fs.existsSync(TOKEN_PATH)) {
      const data = fs.readFileSync(TOKEN_PATH, { encoding: 'utf8' });
      tokens = JSON.parse(data);
      console.log('Tokens loaded from local file');
      
      // Check if token is expired
      if (tokens.expiry_date && Date.now() >= tokens.expiry_date) {
        console.log('Loaded token is expired, will refresh on next use');
      }
    }
  } catch (err) {
    console.error('Error loading tokens:', err);
  }
}

// Try to load tokens at startup
loadTokens();

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
      list_events: {
        description: "List calendar events based on specified criteria",
        parameters: {
          timeMin: "ISO date string for the earliest event time (defaults to current time if not specified)",
          timeMax: "ISO date string for the latest event time",
          maxResults: "Maximum number of events to return (defaults to 10)",
          q: "Free text search term to find events that match"
        },
        response: {
          status: "success or error",
          data: "Array of event objects (if successful)",
          error: "Error message (if failed)",
          error_type: "Type of error that occurred (if failed)"
        },
        required_parameters: ["timeMin (defaults to current time if omitted)"]
      },
      create_event: {
        description: "Create a new calendar event",
        parameters: {
          summary: "Event title (required)",
          description: "Event description (optional)",
          start: "Event start time object with dateTime and timeZone (required)",
          end: "Event end time object with dateTime and timeZone (required)",
          location: "Event location (optional)"
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
          eventId: "ID of the event to update (required)",
          summary: "New event title (optional)",
          description: "New event description (optional)",
          start: "New event start time object with dateTime and timeZone (optional)",
          end: "New event end time object with dateTime and timeZone (optional)",
          location: "New event location (optional)"
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
          eventId: "ID of the event to delete (required)"
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
        tokens = credentials;
        saveTokens(); // Save the refreshed tokens
        console.log('Tokens refreshed and saved');
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
      case 'list_events':
        result = await listEvents(calendar, parameters || {});
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
    <hr>
    <h2>Available MCP Endpoints</h2>
    <ul>
      <li><code>/mcp/definition</code> - GET endpoint for MCP capabilities</li>
      <li><code>/mcp/execute</code> - POST endpoint for executing actions</li>
    </ul>
    <p>See the client at <a href="/index.html">/index.html</a> to test the MCP server.</p>
    <hr>
    <p><small>Note: In a production environment, you would use a proper database to store tokens.</small></p>
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
    tokens = newTokens;
    if (!tokens.expiry_date) {
      // Set default expiry (1 hour from now)
      tokens.expiry_date = Date.now() + 3600000;
    }
    
    // Save tokens to file for persistence between server restarts
    saveTokens();
    
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
 * @returns {Array} Array of calendar events
 */
async function listEvents(calendar, { timeMin, maxResults = 10, timeMax, q }) {
  try {
    // Build request parameters with all available filters
    const requestParams = {
      calendarId: 'primary',
      timeMin: timeMin || (new Date()).toISOString(),
      maxResults: parseInt(maxResults, 10) || 10,
      singleEvents: true,
      orderBy: 'startTime',
    };
    
    // Add optional parameters if provided
    if (timeMax) requestParams.timeMax = timeMax;
    if (q) requestParams.q = q;
    
    const response = await calendar.events.list(requestParams);
    
    if (!response.data.items) {
      return [];
    }
    
    return response.data.items.map(event => ({
      id: event.id,
      summary: event.summary || '',
      description: event.description || '',
      start: event.start,
      end: event.end,
      location: event.location || '',
      htmlLink: event.htmlLink,
      created: event.created,
      updated: event.updated,
      status: event.status
    }));
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
async function createEvent(calendar, { summary, description, start, end, location }) {
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
    
    const event = {
      summary,
      description: description || '',
      start,
      end,
      location: location || ''
    };
    
    const response = await calendar.events.insert({
      calendarId: 'primary',
      resource: event,
    });
    
    return {
      id: response.data.id,
      htmlLink: response.data.htmlLink,
      status: response.data.status,
      created: response.data.created
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
async function getEvent(calendar, { eventId }) {
  try {
    if (!eventId) {
      throw new Error('Event ID is required');
    }
    
    const response = await calendar.events.get({
      calendarId: 'primary',
      eventId: eventId
    });
    
    return {
      id: response.data.id,
      summary: response.data.summary || '',
      description: response.data.description || '',
      start: response.data.start,
      end: response.data.end,
      location: response.data.location || '',
      htmlLink: response.data.htmlLink,
      created: response.data.created,
      updated: response.data.updated,
      status: response.data.status,
      attendees: response.data.attendees || []
    };
  } catch (error) {
    console.error('Error getting event:', error);
    
    // Handle specific error cases
    if (error.code === 404) {
      throw new Error(`Event not found with ID: ${eventId}`);
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
async function updateEvent(calendar, { eventId, summary, description, start, end, location }) {
  try {
    if (!eventId) {
      throw new Error('Event ID is required');
    }
    
    // First get the existing event to ensure it exists and to preserve fields not being updated
    const currentEvent = await calendar.events.get({
      calendarId: 'primary',
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
    
    // Send the update request
    const response = await calendar.events.update({
      calendarId: 'primary',
      eventId: eventId,
      resource: eventUpdate
    });
    
    return {
      id: response.data.id,
      summary: response.data.summary || '',
      description: response.data.description || '',
      start: response.data.start,
      end: response.data.end,
      location: response.data.location || '',
      htmlLink: response.data.htmlLink,
      updated: response.data.updated,
      status: response.data.status
    };
  } catch (error) {
    console.error('Error updating event:', error);
    
    // Handle specific error cases
    if (error.code === 404) {
      throw new Error(`Event not found with ID: ${eventId}`);
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
async function deleteEvent(calendar, { eventId }) {
  try {
    if (!eventId) {
      throw new Error('Event ID is required');
    }
    
    // Verify the event exists first
    await calendar.events.get({
      calendarId: 'primary',
      eventId: eventId
    });
    
    // Delete the event
    await calendar.events.delete({
      calendarId: 'primary',
      eventId: eventId
    });
    
    return {
      eventId: eventId,
      deleted: true,
      timestamp: new Date().toISOString()
    };
  } catch (error) {
    console.error('Error deleting event:', error);
    
    // Handle specific error cases
    if (error.code === 404) {
      throw new Error(`Event not found with ID: ${eventId}`);
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
async function findDuplicateEvents(calendar, { timeMin, timeMax, similarityThreshold = 0.7 }) {
  try {
    // Default time range if not specified (from now to 30 days in the future)
    const now = new Date();
    const defaultTimeMin = now.toISOString();
    const defaultTimeMax = new Date(now.setDate(now.getDate() + 30)).toISOString();
    
    // Build request parameters
    const requestParams = {
      calendarId: 'primary',
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
        message: "No events found in the specified time range" 
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

module.exports = { 
  app, 
  validateParams, 
  ErrorTypes,
  // Export functions for testing
  listEvents,
  createEvent,
  getEvent,
  updateEvent,
  deleteEvent,
  findDuplicateEvents
};