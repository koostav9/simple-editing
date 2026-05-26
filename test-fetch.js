const { app, protocol, net } = require('electron');
const { pathToFileURL } = require('url');

app.whenReady().then(() => {
  protocol.registerSchemesAsPrivileged([
    { scheme: 'media', privileges: { bypassCSP: true, stream: true, supportFetchAPI: true, corsEnabled: true } }
  ]);
});
