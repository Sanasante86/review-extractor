import React, { useState, useEffect } from 'react';
import axios from 'axios';
import './Settings.css';

function Settings({ onBack }) {
  const [apiKey, setApiKey] = useState('');
  const [maskedApiKey, setMaskedApiKey] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  // Fetch the current API key (masked) on component mount and after updates
  const fetchApiKey = async () => {
    try {
      setLoading(true);
      // Add timestamp to prevent caching
      const timestamp = new Date().getTime();
      const response = await axios.get(`/api/config/api-key?t=${timestamp}`);
      if (response.data.success) {
        console.log('Received masked API key from server:', response.data.apiKey);
        setMaskedApiKey(response.data.apiKey);
      }
    } catch (err) {
      setError('Failed to fetch API key');
      console.error('Error fetching API key:', err);
    } finally {
      setLoading(false);
    }
  };

  // Fetch on component mount
  useEffect(() => {
    fetchApiKey();
  }, []);

  const handleApiKeyChange = (e) => {
    setApiKey(e.target.value);
  };

  const updateApiKey = async (e) => {
    e.preventDefault();
    
    if (!apiKey) {
      setError('Please enter a valid API key');
      return;
    }

    try {
      setLoading(true);
      setError('');
      setSuccess('');
      
      console.log('Sending API key update request for key:', apiKey.substring(0, 4) + '...');
      
      // Add timestamp to prevent caching
      const timestamp = new Date().getTime();
      const response = await axios.post('/api/config/api-key', { 
        apiKey,
        timestamp // Include timestamp in the request body as well
      });
      
      if (response.data.success) {
        console.log('API key update successful, server response:', response.data);
        setSuccess('API key updated successfully');
        setApiKey('');
        
        // Notify the main process that the API key has been updated
        // This will trigger a server restart to use the new API key
        try {
          console.log('Notifying main process of API key update');
          window.electron.send('api-key-updated', apiKey);
        } catch (err) {
          console.error('Error sending IPC message:', err);
        }
        
        // Wait a moment to ensure the file is written and server is restarted
        setTimeout(() => {
          // Fetch the updated masked API key with cache busting
          fetchApiKey();
        }, 1000); // Increased timeout to allow for server restart
      } else {
        setError(response.data.message || 'Failed to update API key');
      }
    } catch (err) {
      console.error('Error in updateApiKey:', err);
      setError(err.response?.data?.message || err.message || 'An error occurred');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="Settings">
      <div className="settings-header">
        <button onClick={onBack} className="back-button">
          &larr; Back to Extractor
        </button>
        <h2>Settings</h2>
      </div>
      
      {error && (
        <div className="error-message">
          <p>{error}</p>
          <button onClick={() => setError('')}>Dismiss</button>
        </div>
      )}
      
      {success && (
        <div className="success-message">
          <p>{success}</p>
          <button onClick={() => setSuccess('')}>Dismiss</button>
        </div>
      )}
      
      <div className="settings-section">
        <h3>Pleper API Configuration</h3>
        
        <div className="current-api-key">
          <p>Current API Key: <span>{loading ? 'Loading...' : maskedApiKey}</span></p>
        </div>
        
        <form onSubmit={updateApiKey} className="api-key-form">
          <div className="form-group">
            <label htmlFor="apiKey">New API Key:</label>
            <input
              type="text"
              id="apiKey"
              value={apiKey}
              onChange={handleApiKeyChange}
              placeholder="Enter new API key"
              disabled={loading}
            />
            <small>The API key is used to authenticate requests to the Pleper API.</small>
          </div>
          
          <button 
            type="submit" 
            disabled={loading || !apiKey}
            className="primary-button"
          >
            {loading ? 'Updating...' : 'Update API Key'}
          </button>
        </form>
      </div>
    </div>
  );
}

export default Settings;
