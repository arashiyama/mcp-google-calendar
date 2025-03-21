// src/index.ts
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { google, calendar_v3 } from 'googleapis';
import { OAuth2Client } from 'google-auth-library';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { z } from 'zod';

// Load environment variables
dotenv.config();

// Constants
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const TOKEN_PATH = path.join(__dirname, '..', 'token.json');
const SCOPES = ['https://www.googleapis.com/auth/calendar'];

// Initialize the OAuth2 client
const oAuth2Client = new OAuth2Client(
  process.env.GOOGLE_CLIENT_ID,
  process.env.GOOGLE_CLIENT_SECRET,
  process.env.GOOGLE_REDIRECT_URI
);

// Create server instance
const server = new McpServer({
  name: "google-calendar",
  version: "1.0.0",
});

// Check if token exists and set credentials
let authenticated = false;
try {
  if (fs.existsSync(TOKEN_PATH)) {
    const token = JSON.parse(fs.readFileSync(TOKEN_PATH, 'utf8'));
    oAuth2Client.setCredentials(token);
    authenticated = true;
  }
} catch (error) {
  console.error('Error loading token:', error);
}

// Create Calendar API client
const calendar = google.calendar({ version: 'v3', auth: oAuth2Client });

// Register tool for authentication
server.tool(
  "auth-google-calendar",
  "Authenticate with Google Calendar",
  {},
  async () => {
    if (authenticated) {
      return {
        content: [{ type: "text", text: "Already authenticated with Google Calendar." }]
      };
    }

    const authUrl = oAuth2Client.generateAuthUrl({
      access_type: 'offline',
      scope: SCOPES,
    });

    return {
      content: [
        {
          type: "text",
          text: `Please visit the following URL to authenticate:\n\n${authUrl}\n\nAfter authentication, you will be redirected to ${process.env.GOOGLE_REDIRECT_URI}. Please copy the code from the URL and use the set-auth-code tool.`
        }
      ]
    };
  }
);

// Register tool for setting auth code
server.tool(
  "set-auth-code",
  "Set the authorization code from Google OAuth flow",
  {
    code: z.string().describe("The authorization code from Google OAuth redirect")
  },
  async ({ code }) => {
    try {
      const { tokens } = await oAuth2Client.getToken(code);
      oAuth2Client.setCredentials(tokens);
      
      // Save the token for future use
      fs.writeFileSync(TOKEN_PATH, JSON.stringify(tokens));
      authenticated = true;
      
      return {
        content: [{ type: "text", text: "Successfully authenticated with Google Calendar!" }]
      };
    } catch (error) {
      console.error('Error retrieving access token:', error);
      return {
        content: [
          {
            type: "text",
            text: `Failed to authenticate: ${error instanceof Error ? error.message : String(error)}`
          }
        ],
        isError: true
      };
    }
  }
);

// Register tool to list calendar events
server.tool(
  "list-events",
  "List upcoming calendar events",
  {
    maxResults: z.number()
      .describe("Maximum number of events to return")
      .default(10),
    timeMin: z.string()
      .describe("Start time in ISO format")
      .default(() => new Date().toISOString())
  },
  async ({ maxResults, timeMin }) => {
    if (!authenticated) {
      return {
        content: [
          {
            type: "text",
            text: "Not authenticated. Please use the auth-google-calendar tool first."
          }
        ],
        isError: true
      };
    }

    try {
      const response = await calendar.events.list({
        calendarId: 'primary',
        timeMin: timeMin,
        maxResults: maxResults,
        singleEvents: true,
        orderBy: 'startTime',
      });

      const events = response.data.items || [];
      
      if (events.length === 0) {
        return {
          content: [{ type: "text", text: "No upcoming events found." }]
        };
      }

      const formattedEvents = events.map((event) => {
        const start = event.start?.dateTime || event.start?.date;
        const end = event.end?.dateTime || event.end?.date;
        return `Title: ${event.summary}\nStart: ${start}\nEnd: ${end}\nLocation: ${event.location || 'Not specified'}\nDescription: ${event.description || 'None'}\n`;
      }).join('\n---\n\n');

      return {
        content: [{ type: "text", text: `Upcoming events:\n\n${formattedEvents}` }]
      };
    } catch (error) {
      console.error('Error retrieving events:', error);
      return {
        content: [
          {
            type: "text",
            text: `Failed to retrieve events: ${error instanceof Error ? error.message : String(error)}`
          }
        ],
        isError: true
      };
    }
  }
);

// Register tool to create calendar event
server.tool(
  "create-event",
  "Create a new calendar event",
  {
    summary: z.string()
      .describe("Event title/summary"),
    description: z.string()
      .describe("Event description")
      .optional(),
    location: z.string()
      .describe("Event location")
      .optional(),
    startDateTime: z.string()
      .describe("Start date and time in ISO format (e.g., 2024-03-15T09:00:00Z) or YYYY-MM-DD format"),
    endDateTime: z.string()
      .describe("End date and time in ISO format (e.g., 2024-03-15T10:00:00Z) or YYYY-MM-DD format"),
    attendees: z.array(z.string())
      .describe("List of attendee email addresses")
      .default([])
  },
  async ({ summary, description, location, startDateTime, endDateTime, attendees = [] }) => {
    if (!authenticated) {
      return {
        content: [
          {
            type: "text",
            text: "Not authenticated. Please use the auth-google-calendar tool first."
          }
        ],
        isError: true
      };
    }

    try {
      // Create event object
      const event: calendar_v3.Schema$Event = {
        summary,
        description,
        location,
        start: {
          dateTime: startDateTime.includes('T') ? startDateTime : undefined,
          date: !startDateTime.includes('T') ? startDateTime : undefined,
        },
        end: {
          dateTime: endDateTime.includes('T') ? endDateTime : undefined,
          date: !endDateTime.includes('T') ? endDateTime : undefined,
        },
      };

      // Add attendees if provided
      if (attendees.length > 0) {
        event.attendees = attendees.map((email: string) => ({ email }));
      }

      const response = await calendar.events.insert({
        calendarId: 'primary',
        requestBody: event,
      });

      return {
        content: [
          {
            type: "text",
            text: `Event created successfully! Event ID: ${response.data.id}`
          }
        ]
      };
    } catch (error) {
      console.error('Error creating event:', error);
      return {
        content: [
          {
            type: "text",
            text: `Failed to create event: ${error instanceof Error ? error.message : String(error)}`
          }
        ],
        isError: true
      };
    }
  }
);

// Register tool to delete calendar event
server.tool(
  "delete-event",
  "Delete a calendar event by ID",
  {
    eventId: z.string()
      .describe("ID of the event to delete")
  },
  async ({ eventId }) => {
    if (!authenticated) {
      return {
        content: [
          {
            type: "text",
            text: "Not authenticated. Please use the auth-google-calendar tool first."
          }
        ],
        isError: true
      };
    }

    try {
      await calendar.events.delete({
        calendarId: 'primary',
        eventId: eventId,
      });

      return {
        content: [
          {
            type: "text",
            text: `Event ${eventId} deleted successfully.`
          }
        ]
      };
    } catch (error) {
      console.error('Error deleting event:', error);
      return {
        content: [
          {
            type: "text",
            text: `Failed to delete event: ${error instanceof Error ? error.message : String(error)}`
          }
        ],
        isError: true
      };
    }
  }
);

// Register tool to search calendar events
server.tool(
  "search-events",
  "Search for calendar events by query",
  {
    query: z.string()
      .describe("Search query (searches in title, description, location, etc.)"),
    maxResults: z.number()
      .describe("Maximum number of events to return")
      .default(10)
  },
  async ({ query, maxResults = 10 }) => {
    if (!authenticated) {
      return {
        content: [
          {
            type: "text",
            text: "Not authenticated. Please use the auth-google-calendar tool first."
          }
        ],
        isError: true
      };
    }

    try {
      const response = await calendar.events.list({
        calendarId: 'primary',
        q: query,
        maxResults: maxResults,
        singleEvents: true,
        orderBy: 'startTime',
      });

      const events = response.data.items || [];
      
      if (events.length === 0) {
        return {
          content: [
            {
              type: "text",
              text: `No events found matching query: "${query}"`
            }
          ]
        };
      }

      const formattedEvents = events.map((event) => {
        const start = event.start?.dateTime || event.start?.date;
        const end = event.end?.dateTime || event.end?.date;
        return `Title: ${event.summary}\nStart: ${start}\nEnd: ${end}\nLocation: ${event.location || 'Not specified'}\nDescription: ${event.description || 'None'}\nID: ${event.id}\n`;
      }).join('\n---\n\n');

      return {
        content: [
          {
            type: "text",
            text: `Events matching "${query}":\n\n${formattedEvents}`
          }
        ]
      };
    } catch (error) {
      console.error('Error searching events:', error);
      return {
        content: [
          {
            type: "text",
            text: `Failed to search events: ${error instanceof Error ? error.message : String(error)}`
          }
        ],
        isError: true
      };
    }
  }
);

// Register tool to get today's events
server.tool(
  "get-todays-events",
  "Get all events scheduled for today",
  {},
  async () => {
    if (!authenticated) {
      return {
        content: [
          {
            type: "text",
            text: "Not authenticated. Please use the auth-google-calendar tool first."
          }
        ],
        isError: true
      };
    }

    try {
      // Calculate the start and end of today
      const now = new Date();
      const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      const endOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59);
      
      const response = await calendar.events.list({
        calendarId: 'primary',
        timeMin: startOfDay.toISOString(),
        timeMax: endOfDay.toISOString(),
        singleEvents: true,
        orderBy: 'startTime',
      });

      const events = response.data.items || [];
      
      if (events.length === 0) {
        return {
          content: [
            {
              type: "text",
              text: "No events scheduled for today."
            }
          ]
        };
      }

      const formattedEvents = events.map((event) => {
        const start = event.start?.dateTime || event.start?.date;
        const end = event.end?.dateTime || event.end?.date;
        return `Title: ${event.summary}\nStart: ${start}\nEnd: ${end}\nLocation: ${event.location || 'Not specified'}\n`;
      }).join('\n---\n\n');

      return {
        content: [
          {
            type: "text",
            text: `Today's events (${startOfDay.toLocaleDateString()}):\n\n${formattedEvents}`
          }
        ]
      };
    } catch (error) {
      console.error('Error retrieving today\'s events:', error);
      return {
        content: [
          {
            type: "text",
            text: `Failed to retrieve today's events: ${error instanceof Error ? error.message : String(error)}`
          }
        ],
        isError: true
      };
    }
  }
);

// Start the server
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("Google Calendar MCP Server running on stdio");
}

main().catch((error) => {
  console.error("Fatal error in main():", error);
  process.exit(1);
});
