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
const port = process.env.PORT || 3000;

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
    switch (action) {
      case 'list_events':
        result = await listEvents(calendar, parameters || {});
        break;
      case 'create_event':
        // Validate required parameters
        const createError = validateParams(parameters, ['summary', 'start', 'end']);
        if (createError) {
          return res.json({
            status: 'error',
            error_type: ErrorTypes.VALIDATION,
            error: createError
          });
        }
        result = await createEvent(calendar, parameters);
        break;
      case 'get_event':
        // Validate required parameters
        const getError = validateParams(parameters, ['eventId']);
        if (getError) {
          return res.json({
            status: 'error',
            error_type: ErrorTypes.VALIDATION,
            error: getError
          });
        }
        result = await getEvent(calendar, parameters);
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

app.listen(port, () => {
  console.log(`MCP Server running at http://localhost:${port}`);
});