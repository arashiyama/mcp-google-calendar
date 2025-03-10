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
   ```

3. Update the `.env` file with your Google API credentials:
   ```
   GOOGLE_CLIENT_ID=your_client_id_here
   GOOGLE_CLIENT_SECRET=your_client_secret_here
   GOOGLE_REDIRECT_URI=http://localhost:3000/auth/google/callback
   ```

4. Start the server:
   ```
   npm start
   ```

5. Open http://localhost:3000 in your browser and authorize the application with Google.

## Connecting to Claude

To use this MCP server with Claude:

1. Start the server using `npm start`
2. Add the following MCP configuration to Claude:

```json
{
  "mcpServers": {
    "googleCalendar": {
      "name": "Google Calendar MCP",
      "version": "1.0.0",
      "command": "npm",
      "args": ["start"],
      "description": "MCP server for Google Calendar access",
      "url": "http://localhost:3000",
      "mcpProtocolVersion": "0.1"
    }
  }
}
```

3. In Claude settings, go to Model Context Protocol > Add MCP server
4. Enter the details above (or import a JSON file with these contents)
5. Claude will now be able to manage your Google Calendar

## MCP Endpoints

- `/mcp/definition` - GET endpoint that returns the capabilities of this MCP server
- `/mcp/execute` - POST endpoint for executing actions on Google Calendar

## Supported Actions

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

## Example Usage

### List Calendars
```json
{
  "action": "list_calendars",
  "parameters": {}
}
```

### List Events
```json
{
  "action": "list_events",
  "parameters": {
    "calendarId": "primary",
    "timeMin": "2023-01-01T00:00:00Z",
    "maxResults": 10
  }
}
```

### Create Event
```json
{
  "action": "create_event",
  "parameters": {
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
}
```

### Get Event
```json
{
  "action": "get_event",
  "parameters": {
    "calendarId": "primary",
    "eventId": "event_id_here"
  }
}
```

### Update Event
```json
{
  "action": "update_event",
  "parameters": {
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
}
```

### Delete Event
```json
{
  "action": "delete_event",
  "parameters": {
    "calendarId": "primary",
    "eventId": "event_id_here"
  }
}
```

### Find Duplicate Events
```json
{
  "action": "find_duplicates",
  "parameters": {
    "calendarId": "primary",
    "timeMin": "2023-01-01T00:00:00Z",
    "timeMax": "2023-12-31T23:59:59Z",
    "similarityThreshold": 0.7
  }
}
```

### List Recurring Instances
```json
{
  "action": "list_recurring_instances",
  "parameters": {
    "calendarId": "primary",
    "eventId": "recurring_event_id_here",
    "timeMin": "2023-01-01T00:00:00Z",
    "maxResults": 25
  }
}
```

### Create Event Exception
```json
{
  "action": "create_event_exception",
  "parameters": {
    "calendarId": "primary",
    "recurringEventId": "recurring_event_id_here",
    "originalStartTime": "2023-01-15T09:00:00-07:00",
    "summary": "Special Team Meeting",
    "location": "Virtual Meeting Room",
    "reminders": {
      "useDefault": false,
      "overrides": [
        { "method": "email", "minutes": 30 },
        { "method": "popup", "minutes": 15 }
      ]
    }
  }
}
```

### Delete Event Instance
```json
{
  "action": "delete_event_instance",
  "parameters": {
    "calendarId": "primary",
    "recurringEventId": "recurring_event_id_here",
    "originalStartTime": "2023-01-22T09:00:00-07:00"
  }
}
```

### Batch Operations
```json
{
  "action": "batch_operations",
  "parameters": {
    "operations": [
      {
        "action": "get_event",
        "parameters": {
          "calendarId": "primary",
          "eventId": "event_id_1"
        }
      },
      {
        "action": "create_event",
        "parameters": {
          "summary": "New Event",
          "start": {
            "dateTime": "2023-02-15T10:00:00-07:00",
            "timeZone": "America/Los_Angeles"
          },
          "end": {
            "dateTime": "2023-02-15T11:00:00-07:00",
            "timeZone": "America/Los_Angeles"
          }
        }
      },
      {
        "action": "delete_event",
        "parameters": {
          "eventId": "event_id_2"
        }
      }
    ]
  }
}
```

### Advanced Search Events
```json
{
  "action": "advanced_search_events",
  "parameters": {
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
}
```

### Manage Webhooks
```json
{
  "action": "manage_webhooks",
  "parameters": {
    "operation": "create",
    "address": "https://your-server.com/webhook/calendar"
  }
}
```

## Webhook Notifications

This MCP server supports real-time notifications through webhooks. When events in your calendar change, notifications are sent to the registered webhook endpoints.

### Setting up Webhooks

1. Create a publicly accessible HTTPS endpoint that can receive POST requests
2. Register your endpoint using the `manage_webhooks` action with the "create" operation
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