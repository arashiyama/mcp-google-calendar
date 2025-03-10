const { app } = require('./app');
const db = require('./db');
const notifications = require('./notifications');

// Function to try starting the server with port auto-selection
function startServer(initialPort) {
  return new Promise((resolve, reject) => {
    // Try to start on the initial port
    let currentPort = initialPort;
    const maxPortAttempts = 10; // Try up to 10 ports (3000-3009)
    let attempts = 0;
    
    // Function to attempt server start on a specific port
    function attemptStart(port) {
      const server = app.listen(port)
        .on('listening', () => {
          console.log(`MCP Server running at http://localhost:${port}`);
          
          // Start the reminder service (check every 5 minutes)
          notifications.startReminderService(5);
          
          resolve(server);
        })
        .on('error', (err) => {
          if (err.code === 'EADDRINUSE') {
            console.log(`Port ${port} is already in use, trying next port...`);
            attempts++;
            
            if (attempts >= maxPortAttempts) {
              reject(new Error('Could not find an available port after multiple attempts'));
              return;
            }
            
            // Try the next port
            attemptStart(port + 1);
          } else {
            // For other errors, reject with the error
            reject(err);
          }
        });
    }
    
    // Start the first attempt
    attemptStart(currentPort);
  });
}

// Get the initial port and start the server
const initialPort = process.env.PORT || 3000;
let server;

// Start the server with auto port selection
startServer(initialPort)
  .then(serverInstance => {
    server = serverInstance;
  })
  .catch(err => {
    console.error('Failed to start server:', err);
    process.exit(1);
  });

// Handle graceful shutdown
process.on('SIGTERM', () => {
  console.log('SIGTERM signal received: closing HTTP server');
  // Stop reminder service
  notifications.stopReminderService();
  console.log('Reminder service stopped');
  
  if (server) {
    server.close(() => {
      console.log('HTTP server closed');
      // Close database connections
      db.closeDatabase();
      console.log('Database connections closed');
    });
  } else {
    db.closeDatabase();
    console.log('Database connections closed');
  }
});

process.on('SIGINT', () => {
  console.log('SIGINT signal received: closing HTTP server');
  // Stop reminder service
  notifications.stopReminderService();
  console.log('Reminder service stopped');
  
  if (server) {
    server.close(() => {
      console.log('HTTP server closed');
      // Close database connections
      db.closeDatabase();
      console.log('Database connections closed');
    });
  } else {
    db.closeDatabase();
    console.log('Database connections closed');
  }
});

// Export the server once it's available
module.exports = { app, getServer: () => server };