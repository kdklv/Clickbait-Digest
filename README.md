# Clickbait Digest

**Your AI-Powered Defense Against Clickbait: Smart YouTube Video Summarization**

A Chrome extension that uses AI to analyze YouTube videos and provide concise, factual summaries, saving you from clickbait and lengthy content.

## 🎯 Key Functions

- **Intelligent Title Analysis**: Detects clickbait patterns using regex-based pattern matching.
- **Multi-Source Transcript Retrieval**: Employs three fallback methods for transcript extraction:
  1. YouTube's `get_video_info` API
  2. Page scraping for `ytInitialPlayerResponse`
  3. Direct page content analysis
- **Customizable AI Analysis**: Offers user control over:
  - Skepticism levels (temperature: 0.2 - 0.8)
  - Summary length (100-400 words)
  - Refresh functionality for alternative summaries.

## 🚀 Features

- **Smart Processing Pipeline**:
  ```javascript
  YouTube Video → Transcript Extraction → AI Analysis → Concise Summary
  ```

- **Transcript Extraction Methods**:
  - Primary: Direct API access
  - Backup: DOM scraping
  - Fallback: Page content analysis

- **User Controls**:
  - Skepticism Level Adjustment (Low/Medium/High)
  - Summary Length Customization
  - One-Click Refresh
  - Secure API Key Management

## 💻 Installation

1. Clone the repository:
   ```bash
   git clone https://github.com/yourusername/clickbait-digest.git
   ```

2. Enable Chrome Developer Mode:
   - Navigate to `chrome://extensions`
   - Toggle "Developer mode" on
   - Click "Load unpacked"
   - Select the extension directory

3. Configure the Extension:
   - Obtain your Gemini API key from Google Cloud Console
   - Click the extension icon
   - Enter your API key in Settings

## 🎮 Usage

1. Navigate to any YouTube video.
2. Click the Clickbait Digest icon.
3. Choose your skepticism level:
   - Low (0.2): More accepting
   - Medium (0.5): Balanced analysis
   - High (0.8): Highly critical
4. Adjust summary length (100-400 words).
5. Read the AI-generated summary.
6. Use refresh for alternative perspectives.

## 🛠️ Technical Stack

- **Frontend**: HTML5, CSS3, Modern JavaScript
- **APIs**:
  - Google's Gemini API (AI processing)
  - Chrome Extension API
  - YouTube Data API
- **Security**:
  - Secure API key storage
  - CORS handling
  - Error management

## 🔐 Privacy & Security

- API keys stored securely using Chrome's Storage API.
- No data collection or tracking.
- Local processing where possible.
- Transparent error handling.

