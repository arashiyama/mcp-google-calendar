# CLAUDE.md - Assistant Guidelines

## Commands
- `npm start` - Start the server
- `npm run dev` - Start with nodemon for auto-reload during development 
- `npm test` - Run all tests with coverage reports
- Run specific test suites:
  - `npm run test:auth` - Authentication tests
  - `npm run test:api` - API tests
  - `npm run test:db` - Database tests
  - `npm run test:batch` - Batch operations
  - `npm run test:duplicates` - Duplicate detection
  - `npm run test:validation` - Input validation
  - `npm run test:recurring` - Recurring event exceptions
  - `npm run test:notifications` - Notification system
- Run individual tests:
  - `jest tests/api.test.js` - Run specific test file
  - `jest -t "should return 404"` - Run tests matching description
- `npm run db:reset` - Reset the database

## Code Style Guidelines
- **Imports**: Group by type (node modules first, then local)
- **Async/Await**: Use for all asynchronous operations
- **Error Handling**: try/catch blocks for async functions
- **Naming**: camelCase for variables/functions, UPPER_CASE for constants
- **Functions**: Prefix promise-returning functions with async
- **Responses**: JSON format with {status, data/error} structure
- **Input Validation**: Validate parameters before processing
- **Documentation**: JSDoc comments for functions
- **Formatting**: 2-space indentation
- **Testing**: Write unit tests for all new functionality

## Project Structure
This MCP server integrates with Google Calendar, providing:
- Express server with MCP endpoints (/mcp/definition, /mcp/execute)
- Google OAuth2 authentication
- Calendar operations (list, create, update, delete events)
- Recurring events with RRULE support
- Notifications and webhooks
- Batch operations
- SQLite token management
- Conflict detection

## Publishing Notes
When publishing this package to a registry (npm, smithery, etc.):

1. **Package Structure Changes**:
   - Add `bin` entry in package.json to create an executable
   - Create a CLI entrypoint that handles arguments and configuration
   - Move hardcoded paths to environment variables or config files

2. **Distribution Considerations**:
   - Use scoped package name (e.g., `@org/mcp-google-calendar`)
   - Add README instructions for global installation
   - Update MCP configuration to use globally installed package

3. **Claude Integration**:
   - Command: Change from shell script to package name
   - Args: Add appropriate flags for configuration
   - Configuration: Use standard paths or environment variables

4. **Development vs Production**:
   - Maintain local development workflow with npm scripts
   - Add production deployment documentation
   - Consider containerization (Docker) for easier deployment