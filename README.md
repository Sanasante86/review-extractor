<<<<<<< HEAD
# review-extractor
=======
# Google Reviews Extractor

A desktop application that extracts Google reviews using the Pleper API and exports them to an Excel file.

## Features

- Extract Google reviews using the Pleper API
- Process and format review data
- Generate Excel files with review information
- Simple and intuitive user interface
- Configurable API key
- Standalone executable - no installation required

## Using the Application

### Standalone Executable

1. Download the latest release from the `dist` folder
2. Run the `Google Reviews Extractor Setup.exe` file to install the application
3. Launch the application from your desktop or start menu
4. Enter a Google Maps CID in the input field and click "Extract Reviews"
5. Wait for the extraction process to complete
6. Download the Excel file containing the reviews

### CID Format

The CID is the unique identifier in Google Maps URL: `https://maps.google.com/?cid=YOUR_CID_HERE`

For example, in the URL `https://maps.google.com/?cid=2311597048265282150`, the CID is `2311597048265282150`.

### API Key Configuration

The application comes with a default API key, but you can change it:

1. Click the ⚙️ Settings button in the top-right corner
2. Enter your new API key in the input field
3. Click "Update API Key"
4. Return to the main screen by clicking "Back to Extractor"

## Excel File Format

The generated Excel file contains the following columns:

1. `review_link`: The link to the review on Google Maps
2. `time`: The date and time when the review was posted
3. `rating`: The rating given by the reviewer (1-5 stars)
4. `content`: The text content of the review

## For Developers

### Building from Source

1. Clone the repository:
   ```
   git clone <repository-url>
   cd review-extractor
   ```

2. Install dependencies:
   ```
   npm install
   cd client
   npm install
   cd ..
   ```

3. Build the React app:
   ```
   npm run build
   ```

4. Create the executable:
   ```
   npm run make-exe
   ```

The executable will be created in the `dist` folder.

### Development Mode

1. Start the development server and React client:
   ```
   npm run dev-full
   ```

2. Or run with Electron:
   ```
   npm run electron-dev
   ```

## License

This project is licensed under the MIT License.
>>>>>>> d5db7b4d (Initial commit)
