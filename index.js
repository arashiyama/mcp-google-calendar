const { app } = require('./app');
const db = require('./db');

const port = process.env.PORT || 3000;

// Start the server
const server = app.listen(port, () => {
  console.log(`MCP Server running at http://localhost:${port}`);
});

// Handle graceful shutdown
process.on('SIGTERM', () => {
  console.log('SIGTERM signal received: closing HTTP server');
  server.close(() => {
    console.log('HTTP server closed');
    // Close database connections
    db.closeDatabase();
    console.log('Database connections closed');
  });
});

process.on('SIGINT', () => {
  console.log('SIGINT signal received: closing HTTP server');
  server.close(() => {
    console.log('HTTP server closed');
    // Close database connections
    db.closeDatabase();
    console.log('Database connections closed');
  });
});

module.exports = server;