# Google Calendar MCP Server

This is a Model Context Protocol (MCP) server implementation for Google Calendar. It allows AI assistants and applications to access and manipulate Google Calendar data in a standardized way.

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

## MCP Endpoints

- `/mcp/definition` - GET endpoint that returns the capabilities of this MCP server
- `/mcp/execute` - POST endpoint for executing actions on Google Calendar

## Supported Actions

- `list_calendars` - List all available calendars
- `list_events` - List calendar events
- `create_event` - Create a new calendar event
- `get_event` - Get details for a specific event
- `update_event` - Update an existing calendar event
- `delete_event` - Delete a calendar event
- `find_duplicates` - Identify potential duplicate events in your calendar

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