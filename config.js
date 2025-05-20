// Configuration for the application
require('dotenv').config();
const fs = require('fs');
const path = require('path');

// Safely try to require electron
let app = null;
try {
  const electron = require('electron');
  app = electron.app || (electron.remote && electron.remote.app);
} catch (e) {
  // Not running in Electron
}

// Determine if running in Electron
const isElectron = process.env.ELECTRON_RUN === 'true' || app !== null;

// Path to the config file
let configFilePath;
if (isElectron && app) {
  // In packaged Electron app, use the config file from resources
  const userDataPath = app.getPath('userData');
  configFilePath = path.join(userDataPath, 'config.json');
  
  // If the config file doesn't exist in userData, copy it from resources
  if (!fs.existsSync(configFilePath)) {
    const resourcePath = process.resourcesPath ? 
      path.join(process.resourcesPath, 'config.json') : 
      path.join(__dirname, 'config.json');
    
    if (fs.existsSync(resourcePath)) {
      try {
        const configData = fs.readFileSync(resourcePath, 'utf8');
        fs.writeFileSync(configFilePath, configData, 'utf8');
        console.log(`Copied config from ${resourcePath} to ${configFilePath}`);
      } catch (err) {
        console.error('Error copying config file:', err);
      }
    }
  }
} else {
  // In development, use the local config file
  configFilePath = path.join(__dirname, 'config.json');
}

console.log(`Using config file: ${configFilePath}`);

// Read configuration from file
let fileConfig = {};
try {
  if (fs.existsSync(configFilePath)) {
    const configData = fs.readFileSync(configFilePath, 'utf8');
    fileConfig = JSON.parse(configData);
  }
} catch (error) {
  console.error('Error reading config file:', error);
}

// Configuration object with getter for API key to ensure it's always up-to-date
const config = {
  // Use a getter for PLEPER_API_KEY to always return the most current value
  get PLEPER_API_KEY() {
    // Always read from file first, then fall back to env var, then default
    try {
      // Force a fresh read from the file system
      if (fs.existsSync(configFilePath)) {
        // Clear any require cache if this is being used in a module
        delete require.cache[require.resolve(configFilePath)];
        
        // Read the file directly
        const configData = fs.readFileSync(configFilePath, 'utf8');
        const currentFileConfig = JSON.parse(configData);
        
        if (currentFileConfig.apiKey) {
          const key = currentFileConfig.apiKey;
          console.log(`[config.js] Using API key from config file: ${key.substring(0, 4)}...`);
          return key;
        }
      }
    } catch (error) {
      console.error('[config.js] Error reading config file in getter:', error);
    }
    
    // Fall back to environment variable
    if (process.env.PLEPER_API_KEY) {
      const key = process.env.PLEPER_API_KEY;
      console.log(`[config.js] Using API key from environment: ${key.substring(0, 4)}...`);
      return key;
    }
    
    // Last resort - use default
    console.log('[config.js] Using default API key');
    return '2b7a280550efbcfb18dc9b5da762990f';
  },
  
  // Other configuration options
  PORT: process.env.PORT || 5000,
  NODE_ENV: process.env.NODE_ENV || 'development'
};

// Function to update the API key
const updateApiKey = (newApiKey) => {
  if (!newApiKey) {
    console.error('[config.js] updateApiKey called with empty key');
    return false;
  }
  
  console.log(`[config.js] Updating API key to: ${newApiKey.substring(0, 4)}...`);
  
  try {
    // Update the config file
    let currentFileConfig = {};
    
    // Read the current config if it exists
    try {
      if (fs.existsSync(configFilePath)) {
        const configData = fs.readFileSync(configFilePath, 'utf8');
        currentFileConfig = JSON.parse(configData);
        console.log('[config.js] Read existing config file');
      } else {
        console.log('[config.js] Config file does not exist, will create new one');
      }
    } catch (readError) {
      console.error('[config.js] Error reading config file during update:', readError);
    }
    
    // Update the config file with new API key
    const updatedConfig = { ...currentFileConfig, apiKey: newApiKey };
    
    // Ensure the directory exists
    const configDir = path.dirname(configFilePath);
    if (!fs.existsSync(configDir)) {
      console.log(`[config.js] Creating config directory: ${configDir}`);
      fs.mkdirSync(configDir, { recursive: true });
    }
    
    // Write the updated config to file
    fs.writeFileSync(configFilePath, JSON.stringify(updatedConfig, null, 2), 'utf8');
    console.log(`[config.js] Wrote updated config to: ${configFilePath}`);
    
    // Also update the environment variable for this process
    process.env.PLEPER_API_KEY = newApiKey;
    
    console.log('[config.js] API key updated successfully');
    return true;
  } catch (error) {
    console.error('[config.js] Error updating API key:', error);
    return false;
  }
};

module.exports = {
  ...config,
  updateApiKey
};
