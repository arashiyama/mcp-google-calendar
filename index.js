const { app } = require('./app');
const db = require('./db');
const notifications = require('./notifications');

const port = process.env.PORT || 3000;

// Start the server
const server = app.listen(port, () => {
  console.log(`MCP Server running at http://localhost:${port}`);
  
  // Start the reminder service (check every 5 minutes)
  notifications.startReminderService(5);
});

// Handle graceful shutdown
process.on('SIGTERM', () => {
  console.log('SIGTERM signal received: closing HTTP server');
  // Stop reminder service
  notifications.stopReminderService();
  console.log('Reminder service stopped');
  
  server.close(() => {
    console.log('HTTP server closed');
    // Close database connections
    db.closeDatabase();
    console.log('Database connections closed');
  });
});

process.on('SIGINT', () => {
  console.log('SIGINT signal received: closing HTTP server');
  // Stop reminder service
  notifications.stopReminderService();
  console.log('Reminder service stopped');
  
  server.close(() => {
    console.log('HTTP server closed');
    // Close database connections
    db.closeDatabase();
    console.log('Database connections closed');
  });
});

module.exports = server;