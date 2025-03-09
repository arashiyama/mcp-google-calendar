# CLAUDE.md - Assistant Guidelines

## Commands
- `npm start` - Start the server
- `npm run dev` - Start with nodemon for auto-reload during development

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