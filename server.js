const config = require("./src/config");
const { createApp } = require("./src/app");

const app = createApp(config);
const server = app.listen(config.port, () => {
  console.log(`Eva AI ready: http://localhost:${config.port}  (default brain: ${config.defaultBrain})`);
  if (!config.accessToken) console.log("Note: ACCESS_TOKEN is not set, so anyone who can reach this server can use it.");
});

for (const sig of ["SIGINT", "SIGTERM"]) {
  process.on(sig, () => server.close(() => process.exit(0)));
}
