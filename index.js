const express = require('express');
const { google } = require('googleapis');
const bodyParser = require('body-parser');
const cors = require('cors');
const dotenv = require('dotenv');

// Load environment variables
dotenv.config();

const app = express();
const port = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(bodyParser.json());
app.use(express.static('public'));

// Google OAuth2 configuration
const oauth2Client = new google.auth.OAuth2(
  process.env.GOOGLE_CLIENT_ID,
  process.env.GOOGLE_CLIENT_SECRET,
  process.env.GOOGLE_REDIRECT_URI
);

// Store tokens (in a production app, use a proper database)
let tokens = null;

// MCP definition endpoint
app.get('/mcp/definition', (req, res) => {
  res.json({
    name: "Google Calendar MCP",
    version: "1.0.0",
    description: "MCP server for Google Calendar access",
    actions: {
      list_events: {
        description: "List calendar events",
        parameters: {
          timeMin: "ISO date string for the earliest event time",
          maxResults: "Maximum number of events to return"
        }
      },
      create_event: {
        description: "Create a new calendar event",
        parameters: {
          summary: "Event title",
          description: "Event description",
          start: "Event start time object with dateTime and timeZone",
          end: "Event end time object with dateTime and timeZone",
          location: "Event location"
        }
      },
      get_event: {
        description: "Get details for a specific event",
        parameters: {
          eventId: "ID of the event to retrieve"
        }
      }
    }
  });
});

// MCP execute endpoint
app.post('/mcp/execute', async (req, res) => {
  try {
    const { action, parameters } = req.body;
    
    if (!tokens) {
      return res.json({
        status: 'error',
        error: 'Not authenticated',
        auth_url: oauth2Client.generateAuthUrl({
          access_type: 'offline',
          scope: ['https://www.googleapis.com/auth/calendar']
        })
      });
    }
    
    oauth2Client.setCredentials(tokens);
    const calendar = google.calendar({ version: 'v3', auth: oauth2Client });
    
    let result;
    switch (action) {
      case 'list_events':
        result = await listEvents(calendar, parameters);
        break;
      case 'create_event':
        result = await createEvent(calendar, parameters);
        break;
      case 'get_event':
        result = await getEvent(calendar, parameters);
        break;
      default:
        throw new Error(`Unknown action: ${action}`);
    }
    
    return res.json({
      status: 'success',
      data: result
    });
  } catch (error) {
    console.error('Error executing MCP action:', error);
    return res.json({
      status: 'error',
      error: error.message
    });
  }
});

// Home route
app.get('/', (req, res) => {
  if (!tokens) {
    const authUrl = oauth2Client.generateAuthUrl({
      access_type: 'offline',
      scope: ['https://www.googleapis.com/auth/calendar']
    });
    return res.send(`<h1>Google Calendar MCP</h1><p>Not authenticated. <a href="${authUrl}">Login with Google</a></p>`);
  }
  res.send('<h1>Google Calendar MCP</h1><p>Authenticated! The MCP server is ready to use.</p>');
});

// OAuth callback route
app.get('/auth/google/callback', async (req, res) => {
  const { code } = req.query;
  
  try {
    const { tokens: newTokens } = await oauth2Client.getToken(code);
    tokens = newTokens;
    res.send('Authentication successful! You can close this window.');
  } catch (error) {
    console.error('Error retrieving access token', error);
    res.status(500).send('Error retrieving access token');
  }
});

// Action implementations
async function listEvents(calendar, { timeMin, maxResults = 10 }) {
  const response = await calendar.events.list({
    calendarId: 'primary',
    timeMin: timeMin || (new Date()).toISOString(),
    maxResults: maxResults,
    singleEvents: true,
    orderBy: 'startTime',
  });
  
  return response.data.items.map(event => ({
    id: event.id,
    summary: event.summary,
    description: event.description,
    start: event.start,
    end: event.end,
    location: event.location
  }));
}

async function createEvent(calendar, { summary, description, start, end, location }) {
  const event = {
    summary,
    description,
    start,
    end,
    location
  };
  
  const response = await calendar.events.insert({
    calendarId: 'primary',
    resource: event,
  });
  
  return {
    id: response.data.id,
    htmlLink: response.data.htmlLink
  };
}

async function getEvent(calendar, { eventId }) {
  const response = await calendar.events.get({
    calendarId: 'primary',
    eventId: eventId
  });
  
  return {
    id: response.data.id,
    summary: response.data.summary,
    description: response.data.description,
    start: response.data.start,
    end: response.data.end,
    location: response.data.location
  };
}

app.listen(port, () => {
  console.log(`MCP Server running at http://localhost:${port}`);
});