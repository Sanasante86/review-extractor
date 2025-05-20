import React, { useState } from 'react';
import axios from 'axios';
import './App.css';
import Settings from './Settings';

function App() {
  const [cid, setCid] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [step, setStep] = useState(0); // 0: initial, 1: first API call done, 2: results ready
  const [apiResponse, setApiResponse] = useState(null);
  const [fileName, setFileName] = useState('');
  const [reviewCount, setReviewCount] = useState(0);
  const [statusMessage, setStatusMessage] = useState('');
  const [showSettings, setShowSettings] = useState(false);

  const handleCidChange = (e) => {
    setCid(e.target.value);
  };

  const extractReviews = async (e) => {
    e.preventDefault();
    
    if (!cid) {
      setError('Please enter a valid CID');
      return;
    }

    try {
      setLoading(true);
      setError('');
      setStep(0);
      setStatusMessage('Initiating review extraction...');
      
      // First API call
      const response = await axios.post('/api/extract-reviews', { cid });
      
      if (response.data.success) {
        setApiResponse(response.data.data);
        setStep(1);
        setStatusMessage('Extraction initiated. Waiting for results (15 seconds)...');
        
        // Wait for 15 seconds
        setTimeout(() => {
          getResults(response.data.data.batch_id);
        }, 15000);
      } else {
        setError(response.data.message || 'Failed to extract reviews');
        setLoading(false);
      }
    } catch (err) {
      setError(err.response?.data?.message || err.message || 'An error occurred');
      setLoading(false);
    }
  };

  const getResults = async (batchId) => {
    try {
      setStatusMessage('Fetching results...');
      
      // Second API call
      const response = await axios.get(`/api/get-results/${batchId}`);
      
      if (response.data.success) {
        if (response.data.status && response.data.status !== 'Finished') {
          // Results not ready yet, try again after 5 seconds
          setStatusMessage(`Results not ready yet. Status: ${response.data.status}. Trying again in 5 seconds...`);
          setTimeout(() => {
            getResults(batchId);
          }, 5000);
        } else {
          // Results are ready
          setFileName(response.data.fileName);
          setReviewCount(response.data.reviewCount);
          setStep(2);
          setStatusMessage('Results processed successfully!');
          setLoading(false);
        }
      } else {
        setError(response.data.message || 'Failed to get results');
        setLoading(false);
      }
    } catch (err) {
      setError(err.response?.data?.message || err.message || 'An error occurred');
      setLoading(false);
    }
  };

  const downloadFile = async () => {
    try {
      setError('');
      // Use axios to get the file as a blob
      const response = await axios.get(`/api/download/${fileName}`, {
        responseType: 'blob'
      });
      
      // Create a blob URL and trigger download
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', fileName);
      document.body.appendChild(link);
      link.click();
      
      // Clean up
      window.URL.revokeObjectURL(url);
      document.body.removeChild(link);
    } catch (err) {
      console.error('Download error:', err);
      setError('Failed to download file. Please try again.');
    }
  };

  const resetForm = () => {
    setCid('');
    setLoading(false);
    setError('');
    setStep(0);
    setApiResponse(null);
    setFileName('');
    setReviewCount(0);
    setStatusMessage('');
  };

  const toggleSettings = () => {
    setShowSettings(!showSettings);
  };

  if (showSettings) {
    return <Settings onBack={toggleSettings} />;
  }

  return (
    <div className="App">
      <header className="App-header">
        <h1>Google Reviews Extractor</h1>
        <p>Extract reviews from Google Maps using Pleper API</p>
        <button onClick={toggleSettings} className="settings-button">
          <span role="img" aria-label="Settings">⚙️</span> Settings
        </button>
      </header>
      
      <main className="App-main">
        {error && (
          <div className="error-message">
            <p>{error}</p>
            <button onClick={() => setError('')}>Dismiss</button>
          </div>
        )}
        
        <div className="form-container">
          <form onSubmit={extractReviews}>
            <div className="form-group">
              <label htmlFor="cid">Google Maps CID:</label>
              <input
                type="text"
                id="cid"
                value={cid}
                onChange={handleCidChange}
                placeholder="Enter CID (e.g., 2311597048265282150)"
                disabled={loading}
                required
              />
              <small>The CID is the unique identifier in Google Maps URL: https://maps.google.com/?cid=YOUR_CID_HERE</small>
            </div>
            
            <div className="form-actions">
              <button 
                type="submit" 
                disabled={loading || !cid}
                className="primary-button"
              >
                {loading ? 'Processing...' : 'Extract Reviews'}
              </button>
              
              {loading && (
                <button 
                  type="button" 
                  onClick={resetForm}
                  className="secondary-button"
                >
                  Cancel
                </button>
              )}
            </div>
          </form>
        </div>
        
        {loading && (
          <div className="status-container">
            <div className="loader"></div>
            <p>{statusMessage}</p>
            
            {step >= 1 && apiResponse && (
              <div className="api-response">
                <h3>API Response:</h3>
                <p>Job ID: {apiResponse.job_id}</p>
                <p>Batch ID: {apiResponse.batch_id}</p>
                <p>Queries Left: {apiResponse.queries_left}</p>
              </div>
            )}
          </div>
        )}
        
        {step === 2 && !loading && (
          <div className="results-container">
            <h2>Results Ready!</h2>
            <p>Successfully extracted {reviewCount} reviews.</p>
            <p>The results have been saved to an Excel file.</p>
            
            <button 
              onClick={downloadFile}
              className="download-button"
            >
              Download Excel File
            </button>
            
            <button 
              onClick={resetForm}
              className="secondary-button"
            >
              Extract More Reviews
            </button>
          </div>
        )}
      </main>
      
      <footer className="App-footer">
        <p>&copy; {new Date().getFullYear()} Review Extractor</p>
      </footer>
    </div>
  );
}

export default App;
