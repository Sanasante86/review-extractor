const { contextBridge, ipcRenderer } = require('electron');

// Log preload script execution
console.log('Preload script executing...');

try {
  // Expose protected methods that allow the renderer process to use
  // the ipcRenderer without exposing the entire object
  contextBridge.exposeInMainWorld(
    'electron',
    {
      send: (channel, data) => {
        // whitelist channels
        let validChannels = ['app-ready', 'log-error', 'api-key-updated', 'restart-server'];
        if (validChannels.includes(channel)) {
          ipcRenderer.send(channel, data);
        }
      },
      receive: (channel, func) => {
        let validChannels = ['from-main'];
        if (validChannels.includes(channel)) {
          // Deliberately strip event as it includes `sender` 
          ipcRenderer.on(channel, (event, ...args) => func(...args));
        }
      },
      // Add a log function for debugging
      log: (message) => {
        console.log(message);
        ipcRenderer.send('log-message', message);
      },
      // Add an error function for debugging
      error: (message) => {
        console.error(message);
        ipcRenderer.send('log-error', message);
      }
    }
  );

  // Add error handling for the React app
  window.addEventListener('error', (event) => {
    console.error('Uncaught error:', event.error);
    ipcRenderer.send('log-error', `Uncaught error: ${event.error?.message || 'Unknown error'}`);
  });

  // Notify the main process that the page has loaded
  window.addEventListener('DOMContentLoaded', () => {
    console.log('DOM content loaded, notifying main process');
    ipcRenderer.send('app-ready');
  });

  console.log('Preload script completed successfully');
} catch (error) {
  console.error('Error in preload script:', error);
}
