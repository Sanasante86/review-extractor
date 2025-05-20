const express = require('express');
const cors = require('cors');
const axios = require('axios');
const ExcelJS = require('exceljs');
const path = require('path');
const fs = require('fs');
const config = require('./config');

// In-memory storage to map batch IDs to CIDs
const batchToCidMap = new Map();

// Determine if running in Electron
const isElectron = process.env.ELECTRON_RUN === 'true';

// Set up uploads directory
let uploadsDir;
if (isElectron && process.env.UPLOADS_DIR) {
  // Use the directory provided by Electron
  uploadsDir = process.env.UPLOADS_DIR;
} else {
  // Use the local uploads directory
  uploadsDir = path.join(__dirname, 'uploads');
}

// Ensure the uploads directory exists
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

console.log(`Using uploads directory: ${uploadsDir}`);

// Initialize express app
const app = express();

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve static files from the React app
// Always serve static files, regardless of environment
app.use(express.static(path.join(__dirname, 'client/build')));
console.log('Serving static files from:', path.join(__dirname, 'client/build'));

// Serve static files with proper MIME types
app.get('*.js', (req, res, next) => {
  res.set('Content-Type', 'application/javascript');
  next();
});

app.get('*.css', (req, res, next) => {
  res.set('Content-Type', 'text/css');
  next();
});

// API endpoint to get the current API key
app.get('/api/config/api-key', (req, res) => {
  // Force reading the latest API key from the config file
  let apiKey;
  
  // Determine the config file path
  const configFilePath = path.join(__dirname, 'config.json');
  
  try {
    // Read directly from the config file to ensure we get the latest value
    if (fs.existsSync(configFilePath)) {
      const configData = fs.readFileSync(configFilePath, 'utf8');
      const fileConfig = JSON.parse(configData);
      apiKey = fileConfig.apiKey || process.env.PLEPER_API_KEY || '2b7a280550efbcfb18dc9b5da762990f';
      console.log('Read API key from config file:', apiKey.substring(0, 4) + '...');
    } else {
      apiKey = process.env.PLEPER_API_KEY || '2b7a280550efbcfb18dc9b5da762990f';
      console.log('Config file not found, using env or default API key');
    }
  } catch (error) {
    console.error('Error reading config file in GET endpoint:', error);
    apiKey = process.env.PLEPER_API_KEY || '2b7a280550efbcfb18dc9b5da762990f';
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
    
    console.log('Attempting to update API key to:', apiKey.substring(0, 4) + '...');
    
    // Determine the config file path
    const configFilePath = path.join(__dirname, 'config.json');
    
    // Update the config file directly
    try {
      // Read the current config if it exists
      let fileConfig = {};
      if (fs.existsSync(configFilePath)) {
        const configData = fs.readFileSync(configFilePath, 'utf8');
        fileConfig = JSON.parse(configData);
      }
      
      // Update the API key
      fileConfig.apiKey = apiKey;
      
      // Write the updated config back to the file
      fs.writeFileSync(configFilePath, JSON.stringify(fileConfig, null, 2), 'utf8');
      
      // Also update the environment variable for this process
      process.env.PLEPER_API_KEY = apiKey;
      
      console.log('API key updated successfully in server.js to:', apiKey.substring(0, 4) + '...');
      
      // Also use the config module's update function to ensure consistency
      const updated = config.updateApiKey(apiKey);
      if (!updated) {
        console.warn('Warning: config.updateApiKey returned false, but we updated the file directly');
      }
      
      return res.json({
        success: true,
        message: 'API key updated successfully',
        timestamp: new Date().getTime() // Add timestamp to help with cache busting
      });
    } catch (fileError) {
      console.error('Error updating config file directly:', fileError);
      
      // Try using the config module as fallback
      const updated = config.updateApiKey(apiKey);
      
      if (updated) {
        return res.json({
          success: true,
          message: 'API key updated successfully via config module',
          timestamp: new Date().getTime()
        });
      } else {
        return res.status(500).json({
          success: false,
          message: 'Failed to update API key in both direct file write and via config module'
        });
      }
    }
  } catch (error) {
    console.error('Error updating API key:', error);
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

    // Get the current API key - this will use the getter in config.js
    const currentApiKey = config.PLEPER_API_KEY;
    console.log('Using API key for extraction:', currentApiKey.substring(0, 4) + '...');

    // Step 1: Make the first API call to Pleper
    const formData = new URLSearchParams();
    formData.append('api-key', currentApiKey);
    formData.append('batch_id', 'new_commit');
    formData.append('profile_url', `https://maps.google.com/?cid=${cid}`);

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

    // Get the current API key - this will use the getter in config.js
    const currentApiKey = config.PLEPER_API_KEY;
    console.log('Using API key for results:', currentApiKey.substring(0, 4) + '...');

    // Step 2: Make the second API call to get results
    const secondResponse = await axios.get(
      `https://scrape.pleper.com/v3/batch_get_results?api_key=${currentApiKey}&batch_id=${batchId}`
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

    // We already have the uploads directory set up at the top of the file

    // Get the CID for this batch ID
    const cid = batchToCidMap.get(batchId.toString()) || 'unknown';
    
    // Save the file with CID in the filename
    const fileName = `reviews_${cid}.xlsx`;
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

// Catch-all handler for client-side routing
// Always use this handler, regardless of environment
app.get('*', (req, res, next) => {
  // Skip API routes
  if (req.path.startsWith('/api/')) {
    return next();
  }
  
  // For all other routes, serve the React app
  res.sendFile(path.join(__dirname, 'client/build', 'index.html'));
});

// Set port and start server
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
