const { app } = require('./app');

const port = process.env.PORT || 3000;

app.listen(port, () => {
  console.log(`MCP Server running at http://localhost:${port}`);
});