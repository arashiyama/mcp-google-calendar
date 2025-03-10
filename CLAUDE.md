# CLAUDE.md - Assistant Guidelines

## Commands
- `npm start` - Start the server
- `npm run dev` - Start with nodemon for auto-reload during development
- `npm test` - Run all tests
- `npm run test:auth` - Run authentication tests
- `npm run test:api` - Run API tests
- `npm run test:db` - Run database tests
- `npm run test:batch` - Run batch operations tests
- `npm run test:duplicates` - Run duplicate detection tests
- `npm run test:validation` - Run input validation tests
- `npm run test:recurring` - Run recurring event exceptions tests
- `npm run test:notifications` - Run notification system tests
- `npm run db:reset` - Reset the database

## Code Style Guidelines
- **Imports**: Group imports by type (node modules, local modules)
- **Async/Await**: Use async/await for asynchronous operations
- **Error Handling**: Use try/catch blocks for async functions
- **Naming Conventions**:
  - Variables/functions: camelCase
  - Constants: UPPER_CASE
  - Functions that return promises should be prefixed with async
- **Response Format**: Always return JSON with {status, data/error} structure
- **Parameter Validation**: Validate input parameters before processing
- **Environment Variables**: Use dotenv for configuration
- **Documentation**: Include JSDoc comments for functions

## Project Structure
This is a Model Context Protocol (MCP) server for Google Calendar integration.
Key components:
- Express server with MCP endpoints (/mcp/definition, /mcp/execute)
- Google OAuth2 authentication
- Calendar API implementations (list, create, get events)

## Implemented Features
1. **Core Calendar Operations**
   - Create, read, update, delete events
   - List events with filtering and pagination
   - Advanced search capabilities

2. **Recurring Events**
   - Support for RRULE strings (RFC 5545)
   - List recurring instances
   - CRUD operations for recurring events
   - Support for recurring event exceptions
   - Create and delete specific instances

3. **Event Reminders and Notifications**
   - Setting reminders on events
   - Webhook notifications for calendar changes
   - Real-time updates via notification endpoints
   - Database tracking for sent notifications

4. **Batch Operations**
   - Sequential execution of multiple operations
   - Error handling and partial success
   - Comprehensive test suite
   - Support for all operation types

5. **Token Management**
   - Database persistence with SQLite
   - Token refresh, migration, and revocation
   - Webhook and sync token management
   - Logout functionality

6. **Conflict Detection**
   - Time-based conflict detection for overlapping events
   - Attendee-based conflict detection for double-booking
   - Standalone conflict detection endpoint
   - Integrated conflict checks in create and update operations
   - Option to allow conflicts with warning

## Next Steps
1. ✅ Set up CI/CD pipeline
2. Add rate limiting and security enhancements
3. ✅ Improve web testing interface
4. Create notification management console
5. Add customizable notification preferences