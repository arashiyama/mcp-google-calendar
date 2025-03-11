# Google Calendar MCP Server

This is a Model Context Protocol (MCP) server implementation for Google Calendar. It allows AI assistants and applications to access and manipulate Google Calendar data in a standardized way.

## Features

- Full CRUD operations for Google Calendar events
- Support for recurring events and exceptions
- Batch operations for multiple requests
- Event reminders and notifications
- Advanced search and filtering
- Webhook notifications for calendar changes
- Database persistence for tokens and webhooks

## Support the Project

If you find this project useful, consider supporting the developer:

[Buy Me A Coffee](https://buymeacoffee.com/jonathancare)

## Setup Instructions

1. Create a Google Cloud project and enable the Google Calendar API:
   - Go to the [Google Cloud Console](https://console.cloud.google.com/)
   - Create a new project
   - Enable the Google Calendar API
   - Create OAuth 2.0 credentials (you'll need a client ID and client secret)
   - Configure the OAuth consent screen

2. Install dependencies:
   ```
   npm install
   npm install @modelcontextprotocol/sdk --save
   ```

3. Update the `.env` file with your Google API credentials:
   ```
   GOOGLE_CLIENT_ID=your_client_id_here
   GOOGLE_CLIENT_SECRET=your_client_secret_here
   GOOGLE_REDIRECT_URI=http://localhost:3000/auth/google/callback
   ```

4. Make the MCP server script executable:
   ```
   chmod +x mcp-server.js
   chmod +x start-mcp.sh
   ```

5. Start the MCP server:
   ```
   ./start-mcp.sh
   ```

6. Authentication will be handled through the MCP tools when you first use them.

## Connecting to Claude

To use this MCP server with Claude:

1. Add the following MCP configuration to Claude's settings:

```json
{
  "mcpServers": {
    "googleCalendar": {
      "command": "node",
      "args": ["/path/to/mcp-google-calendar/mcp-server.js"],
      "env": {
        "GOOGLE_CLIENT_ID": "your_client_id_here",
        "GOOGLE_CLIENT_SECRET": "your_client_secret_here",
        "GOOGLE_REDIRECT_URI": "http://localhost:3000/auth/google/callback"
      },
      "disabled": false,
      "autoApprove": []
    }
  }
}
```

2. Replace `/path/to/mcp-google-calendar/mcp-server.js` with the actual path to your mcp-server.js file
3. Replace the Google API credentials with your own
4. In Claude desktop app, go to Settings > MCP Servers, or in Claude web app, use the MCP configuration panel
5. Claude will now be able to manage your Google Calendar

## MCP Tools

This server provides the following MCP tools:

### Authentication Tools
- `get_auth_url` - Get the URL for Google Calendar authentication
- `check_auth_status` - Check if the user is authenticated with Google Calendar

### Calendar Tools

### Core Calendar Operations
- `list_calendars` - List all available calendars
- `list_events` - List calendar events with filtering options
- `create_event` - Create a new calendar event
- `get_event` - Get details for a specific event
- `update_event` - Update an existing calendar event
- `delete_event` - Delete a calendar event
- `find_duplicates` - Identify potential duplicate events in your calendar
- `advanced_search_events` - Advanced search with complex filtering

### Recurring Events
- `list_recurring_instances` - List all instances of a recurring event
- `create_event_exception` - Create an exception to a specific instance of a recurring event
- `delete_event_instance` - Delete a specific instance of a recurring event

### Batch Operations
- `batch_operations` - Execute multiple calendar operations in a single request

### Notifications
- `manage_webhooks` - Set up, list, or delete notification webhooks

All event-related actions support an optional `calendarId` parameter to work with different calendars. If not specified, the primary calendar is used by default.

## Example Usage with MCP Tools

When using this MCP server with Claude or other MCP-compatible assistants, you can use the tools directly. Here are some examples:

### Authentication

```
// Get authentication URL
use_mcp_tool(
  server_name: "googleCalendar",
  tool_name: "get_auth_url",
  arguments: {}
)

// Check authentication status
use_mcp_tool(
  server_name: "googleCalendar",
  tool_name: "check_auth_status",
  arguments: {}
)
```

### List Calendars
```
use_mcp_tool(
  server_name: "googleCalendar",
  tool_name: "list_calendars",
  arguments: {}
)
```

### List Events
```
use_mcp_tool(
  server_name: "googleCalendar",
  tool_name: "list_events",
  arguments: {
    "calendarId": "primary",
    "timeMin": "2023-01-01T00:00:00Z",
    "maxResults": 10
  }
)
```

### Create Event
```
use_mcp_tool(
  server_name: "googleCalendar",
  tool_name: "create_event",
  arguments: {
    "calendarId": "primary",
    "summary": "Team Meeting",
    "description": "Weekly team sync",
    "location": "Conference Room A",
    "start": {
      "dateTime": "2023-01-15T09:00:00-07:00",
      "timeZone": "America/Los_Angeles"
    },
    "end": {
      "dateTime": "2023-01-15T10:00:00-07:00",
      "timeZone": "America/Los_Angeles"
    }
  }
)
```

### Get Event
```
use_mcp_tool(
  server_name: "googleCalendar",
  tool_name: "get_event",
  arguments: {
    "calendarId": "primary",
    "eventId": "event_id_here"
  }
)
```

### Update Event
```
use_mcp_tool(
  server_name: "googleCalendar",
  tool_name: "update_event",
  arguments: {
    "calendarId": "primary",
    "eventId": "event_id_here",
    "summary": "Updated Meeting Title",
    "description": "This event has been updated",
    "location": "Conference Room B",
    "start": {
      "dateTime": "2023-01-15T10:00:00-07:00",
      "timeZone": "America/Los_Angeles"
    },
    "end": {
      "dateTime": "2023-01-15T11:00:00-07:00",
      "timeZone": "America/Los_Angeles"
    }
  }
)
```

### Delete Event
```
use_mcp_tool(
  server_name: "googleCalendar",
  tool_name: "delete_event",
  arguments: {
    "calendarId": "primary",
    "eventId": "event_id_here"
  }
)
```

### Find Duplicate Events
```
use_mcp_tool(
  server_name: "googleCalendar",
  tool_name: "find_duplicates",
  arguments: {
    "calendarId": "primary",
    "timeMin": "2023-01-01T00:00:00Z",
    "timeMax": "2023-12-31T23:59:59Z",
    "similarityThreshold": 0.7
  }
)
```

### Advanced Search Events
```
use_mcp_tool(
  server_name: "googleCalendar",
  tool_name: "advanced_search_events",
  arguments: {
    "calendarId": "primary",
    "timeRange": {
      "start": "2023-01-01T00:00:00Z",
      "end": "2023-12-31T23:59:59Z"
    },
    "textSearch": "meeting",
    "location": "conference",
    "attendees": ["jane@example.com"],
    "status": "confirmed",
    "isRecurring": true,
    "maxResults": 50
  }
)
```

### Manage Webhooks
```
use_mcp_tool(
  server_name: "googleCalendar",
  tool_name: "manage_webhooks",
  arguments: {
    "operation": "create",
    "address": "https://your-server.com/webhook/calendar"
  }
)
```

## Webhook Notifications

This MCP server supports real-time notifications through webhooks. When events in your calendar change, notifications are sent to the registered webhook endpoints.

### Setting up Webhooks

1. Create a publicly accessible HTTPS endpoint that can receive POST requests
2. Register your endpoint using the `manage_webhooks` MCP tool:
   ```
   use_mcp_tool(
     server_name: "googleCalendar",
     tool_name: "manage_webhooks",
     arguments: {
       "operation": "create",
       "address": "https://your-server.com/webhook/calendar"
     }
   )
   ```
3. Your server will start receiving notifications when calendar events change

### Webhook Notification Format

Notifications are sent as JSON payloads with the following structure:

```json
{
  "type": "calendar_update",
  "events": [
    {
      "id": "event_id",
      "summary": "Event Title",
      "start": { "dateTime": "2023-01-15T09:00:00-07:00" },
      "end": { "dateTime": "2023-01-15T10:00:00-07:00" },
      "status": "confirmed",
      "updated": "2023-01-10T12:34:56Z"
    }
  ],
  "channelId": "webhook_id",
  "timestamp": "2023-01-10T12:34:56Z"
}
```

The server also supports event reminder notifications:

```json
{
  "type": "event_reminder",
  "events": [
    {
      "id": "event_id",
      "summary": "Upcoming Event",
      "start": { "dateTime": "2023-01-15T09:00:00-07:00" },
      "end": { "dateTime": "2023-01-15T10:00:00-07:00" },
      "location": "Conference Room",
      "status": "confirmed"
    }
  ],
  "timestamp": "2023-01-15T08:45:00Z"
}
```
