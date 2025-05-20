const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const url = require('url');
const { spawn } = require('child_process');
const fs = require('fs');

// Keep a global reference of the window object to avoid garbage collection
let mainWindow;
let serverProcess;

// Determine if we're in development or production
const isDev = process.env.NODE_ENV === 'development' || process.env.ELECTRON_START_URL;

// Get the app path - this will be different in packaged app vs development
const appPath = app.getAppPath();
console.log('App path:', appPath);

// Create the uploads directory if it doesn't exist
const uploadsDir = path.join(app.getPath('userData'), 'uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}
console.log('Uploads directory:', uploadsDir);

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
  console.error('Uncaught exception:', error);
  dialog.showErrorBox('Error', `An error occurred: ${error.message}`);
});

function createWindow() {
  // Create the browser window
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js'),
      devTools: isDev // Only enable DevTools in development mode
    },
    icon: path.join(__dirname, 'client/public/logo512.png')
  });

  // DevTools will only be available in development mode
  // if (isDev) {
  //   mainWindow.webContents.openDevTools();
  // }
  
  // Handle page load errors
  mainWindow.webContents.on('did-fail-load', (event, errorCode, errorDescription) => {
    console.error('Page failed to load:', errorCode, errorDescription);
    dialog.showErrorBox('Error', `Failed to load the application: ${errorDescription} (${errorCode})`);
  });

  // Emitted when the window is closed
  mainWindow.on('closed', function () {
    mainWindow = null;
  });

  // Wait a moment for the server to start before loading the app
  setTimeout(() => {
    // Load the app from the Express server
    const startUrl = process.env.ELECTRON_START_URL || 'http://localhost:5000';
    console.log('Loading app from:', startUrl);
    
    // Load the URL and handle errors
    mainWindow.loadURL(startUrl).catch(err => {
      console.error('Failed to load URL:', err);
      dialog.showErrorBox('Error', `Failed to load the application: ${err.message}`);
      
      // If we can't load from the server, try loading from file as a fallback
      tryLoadFromFile();
    });
  }, 1000); // Wait 1 second for the server to start
}

// Fallback function to load from file if server loading fails
function tryLoadFromFile() {
  console.log('Trying to load from file as fallback...');
  
  // Production mode - use the local file
  let indexPath;
  
  // Try different possible paths for the index.html file
  const possiblePaths = [
    path.join(__dirname, './client/build/index.html'),
    path.join(__dirname, '../client/build/index.html'),
    path.join(appPath, './client/build/index.html'),
    path.join(appPath, 'client/build/index.html'),
    path.join(appPath, 'build/index.html'),
    path.join(appPath, 'index.html'),
    path.join(process.resourcesPath, 'app/client/build/index.html'),
    path.join(process.resourcesPath, 'client/build/index.html')
  ];
  
  for (const p of possiblePaths) {
    console.log('Checking path:', p);
    if (fs.existsSync(p)) {
      indexPath = p;
      console.log('Found index.html at:', indexPath);
      break;
    }
  }
  
  if (!indexPath) {
    console.error('Could not find index.html in any of the expected locations');
    dialog.showErrorBox('Error', 'Could not find the application files. Please reinstall the application.');
    app.quit();
    return;
  }
  
  const fileUrl = url.format({
    pathname: indexPath,
    protocol: 'file:',
    slashes: true
  });
  console.log('Loading from file:', fileUrl);
  
  mainWindow.loadURL(fileUrl).catch(err => {
    console.error('Failed to load from file:', err);
    dialog.showErrorBox('Error', `Failed to load the application: ${err.message}`);
  });
}

function startServer() {
  try {
    // Load the API key from config.json - do this first so it's available for all code paths
    let apiKey = '2b7a280550efbcfb18dc9b5da762990f'; // Default API key
    const configFilePath = path.join(app.getPath('userData'), 'config.json');
    
    try {
      if (fs.existsSync(configFilePath)) {
        const configData = fs.readFileSync(configFilePath, 'utf8');
        const fileConfig = JSON.parse(configData);
        if (fileConfig.apiKey) {
          apiKey = fileConfig.apiKey;
        }
      }
    } catch (error) {
      console.error('Error reading config file:', error);
    }
    
    // Find the server script
    let serverPath;
    
    // Get the application directory
    const appDir = path.dirname(process.execPath);
    console.log('Application directory:', appDir);
    console.log('Current directory:', __dirname);
    console.log('Resource path:', process.resourcesPath);
    
    // List all possible server paths to check
    const possibleServerPaths = [
      // Development paths
      path.join(__dirname, 'server.js'),
      path.join(appPath, 'server.js'),
      
      // Production paths - app directory
      path.join(appDir, 'server.js'),
      path.join(appDir, 'resources', 'server.js'),
      path.join(appDir, 'resources', 'app', 'server.js'),
      
      // Production paths - resources directory
      path.join(process.resourcesPath, 'server.js'),
      path.join(process.resourcesPath, 'app', 'server.js'),
      path.join(process.resourcesPath, 'app.asar', 'server.js'),
      
      // Additional fallbacks
      path.resolve('./server.js'),
      path.resolve('../server.js')
    ];
    
    // Log all files in the current directory to help with debugging
    try {
      console.log('Files in current directory:');
      const files = fs.readdirSync(__dirname);
      files.forEach(file => console.log(' - ' + file));
      
      if (process.resourcesPath) {
        console.log('Files in resources directory:');
        const resourceFiles = fs.readdirSync(process.resourcesPath);
        resourceFiles.forEach(file => console.log(' - ' + file));
      }
    } catch (err) {
      console.error('Error listing directory contents:', err);
    }
    
    // Check each possible path
    for (const p of possibleServerPaths) {
      console.log('Checking server path:', p);
      if (fs.existsSync(p)) {
        serverPath = p;
        console.log('Found server.js at:', serverPath);
        break;
      }
    }
    
    // If server.js is not found, use the embedded server
    if (!serverPath) {
      console.log('Server.js not found, using embedded server...');
      
      // Create a temporary server.js file
      const tempDir = app.getPath('temp');
      const tempServerPath = path.join(tempDir, 'server.js');
      
      // Embedded server code - simplified version of server.js
      const serverCode = `
        const express = require('express');
        const cors = require('cors');
        const axios = require('axios');
        const ExcelJS = require('exceljs');
        const path = require('path');
        const fs = require('fs');
        
        // Get API key from environment variables
        const PLEPER_API_KEY = process.env.PLEPER_API_KEY;
        const CONFIG_FILE_PATH = process.env.CONFIG_FILE_PATH;
        
        // In-memory storage to map batch IDs to CIDs
        const batchToCidMap = new Map();
        
        // Set up uploads directory from environment
        const uploadsDir = process.env.UPLOADS_DIR || path.join(__dirname, 'uploads');
        console.log(\`Using uploads directory: \${uploadsDir}\`);
        
        // Ensure the uploads directory exists
        if (!fs.existsSync(uploadsDir)) {
          fs.mkdirSync(uploadsDir, { recursive: true });
        }
        
        // Initialize express app
        const app = express();
        
        // Middleware
        app.use(cors());
        app.use(express.json());
        app.use(express.urlencoded({ extended: true }));
        
        // API endpoint to get the current API key
        app.get('/api/config/api-key', (req, res) => {
          // Force reading the latest API key from the config file
          let apiKey = process.env.PLEPER_API_KEY;
          
          try {
            // Read directly from the config file to ensure we get the latest value
            if (CONFIG_FILE_PATH && fs.existsSync(CONFIG_FILE_PATH)) {
              const configData = fs.readFileSync(CONFIG_FILE_PATH, 'utf8');
              const fileConfig = JSON.parse(configData);
              if (fileConfig.apiKey) {
                apiKey = fileConfig.apiKey;
                console.log('[Embedded Server] Read API key from config file:', apiKey.substring(0, 4) + '...');
              }
            }
          } catch (error) {
            console.error('[Embedded Server] Error reading config file in GET endpoint:', error);
          }
          
          // Only return a masked version of the API key for security
          const maskedKey = apiKey.substring(0, 4) + '...' + apiKey.substring(apiKey.length - 4);
          
          // Set cache control headers to prevent caching
          res.set('Cache-Control', 'no-store, no-cache, must-revalidate, private');
          res.set('Pragma', 'no-cache');
          res.set('Expires', '0');
          
          return res.json({
            success: true,
            apiKey: maskedKey,
            timestamp: new Date().getTime() // Add timestamp to help with cache busting
          });
        });
        
        // API endpoint to update the API key
        app.post('/api/config/api-key', (req, res) => {
          try {
            const { apiKey } = req.body;
            
            if (!apiKey) {
              return res.status(400).json({ success: false, message: 'API key is required' });
            }
            
            console.log('[Embedded Server] Attempting to update API key to:', apiKey.substring(0, 4) + '...');
            
            // Update the config file
            if (!CONFIG_FILE_PATH) {
              return res.status(500).json({ 
                success: false, 
                message: 'Config file path not set' 
              });
            }
            
            try {
              // Ensure the directory exists
              const configDir = path.dirname(CONFIG_FILE_PATH);
              if (!fs.existsSync(configDir)) {
                console.log('[Embedded Server] Creating config directory: ' + configDir);
                fs.mkdirSync(configDir, { recursive: true });
              }
              
              // Read the current config
              let fileConfig = {};
              if (fs.existsSync(CONFIG_FILE_PATH)) {
                const configData = fs.readFileSync(CONFIG_FILE_PATH, 'utf8');
                fileConfig = JSON.parse(configData);
                console.log('[Embedded Server] Read existing config file');
              } else {
                console.log('[Embedded Server] Config file does not exist, will create new one');
              }
              
              // Update the API key
              fileConfig.apiKey = apiKey;
              
              // Write the updated config back to the file
              fs.writeFileSync(CONFIG_FILE_PATH, JSON.stringify(fileConfig, null, 2), 'utf8');
              
              // Update the in-memory API key for this process
              process.env.PLEPER_API_KEY = apiKey;
              
              console.log('[Embedded Server] API key updated successfully to:', apiKey.substring(0, 4) + '...');
              
              // Set cache control headers to prevent caching
              res.set('Cache-Control', 'no-store, no-cache, must-revalidate, private');
              res.set('Pragma', 'no-cache');
              res.set('Expires', '0');
              
              return res.json({
                success: true,
                message: 'API key updated successfully',
                timestamp: new Date().getTime() // Add timestamp to help with cache busting
              });
            } catch (err) {
              console.error('[Embedded Server] Error writing to config file:', err);
              return res.status(500).json({ 
                success: false, 
                message: 'Failed to update config file', 
                error: err.message 
              });
            }
          } catch (error) {
            console.error('[Embedded Server] Error updating API key:', error);
            return res.status(500).json({ 
              success: false, 
              message: 'Server error', 
              error: error.message 
            });
          }
        });
        
        // API endpoint to initiate the review extraction
        app.post('/api/extract-reviews', async (req, res) => {
          try {
            const { cid } = req.body;
            
            if (!cid) {
              return res.status(400).json({ success: false, message: 'CID is required' });
            }
            
            // ALWAYS read the latest API key directly from the config file
            let currentApiKey = process.env.PLEPER_API_KEY || '';
            
            // Force reading from the config file for every API call
            if (CONFIG_FILE_PATH && fs.existsSync(CONFIG_FILE_PATH)) {
              try {
                // Read the file synchronously to ensure we get the latest value
                const configData = fs.readFileSync(CONFIG_FILE_PATH, 'utf8');
                const fileConfig = JSON.parse(configData);
                if (fileConfig.apiKey) {
                  currentApiKey = fileConfig.apiKey;
                  console.log('[Embedded Server] Using API key from config file for extraction:', currentApiKey.substring(0, 4) + '...');
                } else {
                  console.warn('[Embedded Server] No API key found in config file, using environment variable');
                }
              } catch (err) {
                console.error('[Embedded Server] Error reading config file for API key:', err);
              }
            } else {
              console.warn('[Embedded Server] Config file not found at:', CONFIG_FILE_PATH);
              console.warn('[Embedded Server] Using environment variable for API key');
            }
            
            if (!currentApiKey) {
              console.error('[Embedded Server] No API key available! Using default key');
              currentApiKey = '2b7a280550efbcfb18dc9b5da762990f'; // Default key as last resort
            }
        
            // Step 1: Make the first API call to Pleper
            const formData = new URLSearchParams();
            formData.append('api-key', currentApiKey);
            formData.append('batch_id', 'new_commit');
            formData.append('profile_url', \`https://maps.google.com/?cid=\${cid}\`);
        
            const firstResponse = await axios.post(
              'https://scrape.pleper.com/v3/google/by-profile/reviews',
              formData,
              {
                headers: {
                  'Content-Type': 'application/x-www-form-urlencoded'
                }
              }
            );
        
            if (!firstResponse.data.success) {
              return res.status(400).json({ 
                success: false, 
                message: 'Failed to initiate review extraction' 
              });
            }
        
            const batchId = firstResponse.data.batch_id;
            
            // Store the CID for this batch ID
            batchToCidMap.set(batchId.toString(), cid);
        
            // Return the initial response
            return res.json({
              success: true,
              message: 'Review extraction initiated',
              data: firstResponse.data
            });
          } catch (error) {
            console.error('Error initiating review extraction:', error);
            return res.status(500).json({ 
              success: false, 
              message: 'Server error', 
              error: error.message 
            });
          }
        });
        
        // API endpoint to get the results after waiting
        app.get('/api/get-results/:batchId', async (req, res) => {
          try {
            const { batchId } = req.params;
            
            if (!batchId) {
              return res.status(400).json({ success: false, message: 'Batch ID is required' });
            }
            
            // ALWAYS read the latest API key directly from the config file
            let currentApiKey = process.env.PLEPER_API_KEY || '';
            
            // Force reading from the config file for every API call
            if (CONFIG_FILE_PATH && fs.existsSync(CONFIG_FILE_PATH)) {
              try {
                // Read the file synchronously to ensure we get the latest value
                const configData = fs.readFileSync(CONFIG_FILE_PATH, 'utf8');
                const fileConfig = JSON.parse(configData);
                if (fileConfig.apiKey) {
                  currentApiKey = fileConfig.apiKey;
                  console.log('[Embedded Server] Using API key from config file for results:', currentApiKey.substring(0, 4) + '...');
                } else {
                  console.warn('[Embedded Server] No API key found in config file, using environment variable');
                }
              } catch (err) {
                console.error('[Embedded Server] Error reading config file for API key:', err);
              }
            } else {
              console.warn('[Embedded Server] Config file not found at:', CONFIG_FILE_PATH);
              console.warn('[Embedded Server] Using environment variable for API key');
            }
            
            if (!currentApiKey) {
              console.error('[Embedded Server] No API key available! Using default key');
              currentApiKey = '2b7a280550efbcfb18dc9b5da762990f'; // Default key as last resort
            }
        
            // Step 2: Make the second API call to get results
            const secondResponse = await axios.get(
              \`https://scrape.pleper.com/v3/batch_get_results?api_key=\${currentApiKey}&batch_id=\${batchId}\`
            );
        
            if (secondResponse.data.status !== 'Finished') {
              return res.json({
                success: true,
                message: 'Results not ready yet',
                status: secondResponse.data.status
              });
            }
        
            // Process the results
            const reviews = [];
            if (secondResponse.data.results && 
                secondResponse.data.results['google/by-profile/reviews']) {
              
              const reviewData = secondResponse.data.results['google/by-profile/reviews'];
              
              reviewData.forEach(item => {
                if (item.results && Array.isArray(item.results)) {
                  item.results.forEach(review => {
                    reviews.push({
                      review_link: review.review_link || '',
                      time: review.time || '',
                      rating: review.rating || '',
                      content: review.content || ''
                    });
                  });
                }
              });
            }
        
            // Generate Excel file
            const workbook = new ExcelJS.Workbook();
            const worksheet = workbook.addWorksheet('Reviews');
            
            // Add headers
            worksheet.columns = [
              { header: 'review_link', key: 'review_link', width: 50 },
              { header: 'time', key: 'time', width: 20 },
              { header: 'rating', key: 'rating', width: 10 },
              { header: 'content', key: 'content', width: 100 }
            ];
            
            // Add rows
            reviews.forEach(review => {
              worksheet.addRow(review);
            });
        
            // Get the CID for this batch ID
            const cid = batchToCidMap.get(batchId.toString()) || 'unknown';
            
            // Save the file with CID in the filename
            const fileName = \`reviews_\${cid}.xlsx\`;
            const filePath = path.join(uploadsDir, fileName);
            
            await workbook.xlsx.writeFile(filePath);
        
            return res.json({
              success: true,
              message: 'Results processed successfully',
              fileName,
              reviewCount: reviews.length
            });
          } catch (error) {
            console.error('Error getting results:', error);
            return res.status(500).json({ 
              success: false, 
              message: 'Server error', 
              error: error.message 
            });
          }
        });
        
        // API endpoint to download the Excel file
        app.get('/api/download/:fileName', (req, res) => {
          const { fileName } = req.params;
          const filePath = path.join(uploadsDir, fileName);
          
          if (!fs.existsSync(filePath)) {
            return res.status(404).json({ success: false, message: 'File not found' });
          }
          
          res.download(filePath);
        });
        
        // Set port and start server
        const PORT = process.env.PORT || 5000;
        app.listen(PORT, () => console.log(\`Server running on port \${PORT}\`));
      `;
      
      // Write the embedded server code to a temporary file
      fs.writeFileSync(tempServerPath, serverCode, 'utf8');
      console.log('Created embedded server at:', tempServerPath);
      serverPath = tempServerPath;
    }
    
    // Set environment variables for the server
    const env = { ...process.env };
    env.ELECTRON_RUN = 'true';
    env.UPLOADS_DIR = uploadsDir;
    env.PLEPER_API_KEY = apiKey;
    env.CONFIG_FILE_PATH = configFilePath;
    
    // Log important paths and values for debugging
    console.log('CONFIG_FILE_PATH:', configFilePath);
    console.log('Initial API key:', apiKey.substring(0, 4) + '...');
    console.log('UPLOADS_DIR:', uploadsDir);
    console.log('Starting server from:', serverPath);
    
    // Start the server as a child process
    serverProcess = spawn('node', [serverPath], { 
      env,
      stdio: ['ignore', 'pipe', 'pipe']
    });
    
    // Log server output
    serverProcess.stdout.on('data', (data) => {
      const output = data.toString().trim();
      console.log(`Server: ${output}`);
    });
    
    serverProcess.stderr.on('data', (data) => {
      const error = data.toString().trim();
      console.error(`Server Error: ${error}`);
      
      // Show error dialog for critical server errors
      if (error.includes('EADDRINUSE')) {
        dialog.showErrorBox('Server Error', 'The server port is already in use. Please close any other instances of this application and try again.');
      } else if (error.includes('Error')) {
        dialog.showErrorBox('Server Error', `The server encountered an error: ${error}`);
      }
    });
    
    serverProcess.on('error', (error) => {
      console.error('Failed to start server process:', error);
      dialog.showErrorBox('Server Error', `Failed to start the server: ${error.message}`);
    });
    
    serverProcess.on('close', (code) => {
      console.log(`Server process exited with code ${code}`);
      if (code !== 0 && code !== null) {
        dialog.showErrorBox('Server Error', `The server stopped unexpectedly with code ${code}`);
      }
    });
  } catch (error) {
    console.error('Error starting server:', error);
    dialog.showErrorBox('Server Error', `Failed to start the server: ${error.message}`);
  }
}

// This method will be called when Electron has finished initialization
app.whenReady().then(() => {
  startServer();
  createWindow();
  
  app.on('activate', function () {
    // On macOS it's common to re-create a window when the dock icon is clicked
    if (mainWindow === null) createWindow();
  });
});

// Quit when all windows are closed, except on macOS
app.on('window-all-closed', function () {
  if (process.platform !== 'darwin') app.quit();
});

// When app is about to quit, kill the server process
app.on('will-quit', () => {
  if (serverProcess) {
    serverProcess.kill();
  }
});

// Function to restart the server process
function restartServer() {
  console.log('Restarting server process...');
  
  // Kill the existing server process if it exists
  if (serverProcess) {
    console.log('Killing existing server process');
    serverProcess.kill();
    serverProcess = null;
  }
  
  // Start a new server process
  try {
    startServer();
    console.log('Server process restarted successfully');
  } catch (error) {
    console.error('Error restarting server process:', error);
    dialog.showErrorBox('Server Error', `Failed to restart the server: ${error.message}`);
  }
}

// Handle IPC messages from the renderer process
ipcMain.on('app-ready', (event) => {
  // The renderer process is ready
  console.log('Renderer process is ready');
});

// Handle API key updated message from the renderer process
ipcMain.on('api-key-updated', (event, newApiKey) => {
  console.log('API key updated, restarting server...');
  // Restart the server to use the new API key
  restartServer();
});

// Handle restart server message from the renderer process
ipcMain.on('restart-server', (event) => {
  console.log('Restart server requested from renderer process');
  restartServer();
});

// Handle log messages from the renderer process
ipcMain.on('log-message', (event, message) => {
  console.log('Renderer:', message);
});

// Handle error messages from the renderer process
ipcMain.on('log-error', (event, message) => {
  console.error('Renderer Error:', message);
  dialog.showErrorBox('Application Error', message);
});
