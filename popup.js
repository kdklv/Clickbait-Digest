document.addEventListener('DOMContentLoaded', function() {
    const summaryTextArea = document.getElementById('summary');
    const refreshBtn = document.getElementById('refreshBtn');
    const settingsBtn = document.getElementById('settingsBtn');
    const settingsDiv = document.getElementById('settings');
    const youtubeApiKeyInput = document.getElementById('youtubeApiKey');
    const geminiApiKeyInput = document.getElementById('geminiApiKey');
    const temperatureSlider = document.getElementById('temperature');
    const tempValueSpan = document.getElementById('tempValue');
    const saveSettingsBtn = document.getElementById('saveSettingsBtn');
    const closeSettingsBtn = document.getElementById('closeSettingsBtn');
    const errorDiv = document.getElementById('error');
    const successMessageDiv = document.getElementById('success-message');
  
  
    // Load saved settings on startup
    chrome.storage.sync.get(['youtubeApiKey', 'geminiApiKey', 'temperature'], function(data) {
      if (data.youtubeApiKey) {
        youtubeApiKeyInput.value = data.youtubeApiKey;
      }
        if (data.geminiApiKey) {
        geminiApiKeyInput.value = data.geminiApiKey;
      }
      if (data.temperature) {
        temperatureSlider.value = data.temperature;
        tempValueSpan.textContent = data.temperature;
      }
    });
  
    // Update temperature display
    temperatureSlider.addEventListener('input', function() {
      tempValueSpan.textContent = temperatureSlider.value;
    });
  
    // Save settings
    saveSettingsBtn.addEventListener('click', function() {
      const youtubeApiKey = youtubeApiKeyInput.value;
      const geminiApiKey = geminiApiKeyInput.value;
      const temperature = parseFloat(temperatureSlider.value);
  
      chrome.storage.sync.set({ youtubeApiKey, geminiApiKey, temperature }, function() {
         successMessageDiv.style.display = 'block'; // Show success message
          setTimeout(() => {
              successMessageDiv.style.display = 'none'; // Hide after a few seconds
               settingsDiv.classList.add('hidden');
          }, 3000);
      });
    });
  
      closeSettingsBtn.addEventListener('click', function() {
          settingsDiv.classList.add('hidden');
    });
  
    // Toggle settings visibility
    settingsBtn.addEventListener('click', function() {
      settingsDiv.classList.toggle('hidden');
    });
  
    // Refresh button click handler
    refreshBtn.addEventListener('click', function() {
        errorDiv.textContent = ''; // Clear previous error
        summaryTextArea.value = 'Loading...';
      chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
        const tab = tabs[0];
        if (tab.url && tab.url.includes('youtube.com/watch')) {
          const videoId = new URL(tab.url).searchParams.get('v');
          getVideoTranscript(videoId, tab.title);
        } else {
          displayMessage('Not a YouTube video page.', 'red');
            summaryTextArea.value = '';
        }
      });
    });
  
  
  async function getVideoTranscript(videoId, videoTitle) {
    try {
      const youtubeApiKey = await getSetting('youtubeApiKey');
        if (!youtubeApiKey) {
          throw new Error("Youtube API key not set. Please enter in settings.");
        }
      const response = await fetch(`https://www.googleapis.com/youtube/v3/captions?part=snippet&videoId=${videoId}&key=${youtubeApiKey}`);
      const data = await response.json();
  
      if (data.error) {
        throw new Error(`YouTube API Error: ${data.error.message}`);
      }
  
      if (!data.items || data.items.length === 0) {
        throw new Error('No transcripts found for this video.');
      }
  
      // Find the transcript with 'en' language, prefer manually created
        let transcriptId = null;
        for (const item of data.items) {
            if (item.snippet.language === 'en') {
                transcriptId = item.id;
                if (item.snippet.trackKind !== 'ASR') { //ASR = auto-generated
                     break; // Use this one unless we find a better.
                }
            }
        }
  
  
      if (!transcriptId) {
        throw new Error('No English transcript found.');
      }
  
        const transcriptResponse = await fetch(`https://www.googleapis.com/youtube/v3/captions/${transcriptId}?key=${youtubeApiKey}&tfmt=srt`);
  
      if (!transcriptResponse.ok) {
          const errorText = await transcriptResponse.text();
          throw new Error(`Failed to download transcript: ${transcriptResponse.status} - ${errorText}`);
      }
      const transcriptText = await transcriptResponse.text();
        const plainTextTranscript = srtToPlainText(transcriptText);
        console.log(plainTextTranscript)
  
      generateSummary(videoTitle, plainTextTranscript);
  
    } catch (error) {
      displayMessage(error.message, 'red');
         summaryTextArea.value = '';
    }
  }
  
    function srtToPlainText(srtText) {
      // Remove timecodes and sequence numbers, keeping only the text
       return srtText
          .replace(/\d+\n/g, '')  // Remove sequence numbers
          .replace(/\d{2}:\d{2}:\d{2},\d{3} --> \d{2}:\d{2}:\d{2},\d{3}\n/g, '') // Remove timecodes
          .trim(); // Remove leading/trailing whitespace
  
  }
  
  async function generateSummary(videoTitle, transcript) {
    try {
       const geminiApiKey = await getSetting('geminiApiKey');
        if (!geminiApiKey) {
          throw new Error("Gemini API key not set. Please enter in settings.");
        }
      const temperature = await getSetting('temperature');
      const question = extractQuestionFromTitle(videoTitle);
      const prompt = `Title: ${videoTitle}\nTranscript: ${transcript}\nQuestion: ${question}\nAnswer in a concise summary:`;
        console.log(prompt);
  
     const response = await fetch('https://generativelanguage.googleapis.com/v1beta/models/gemini-pro:generateContent?key=' + geminiApiKey, {
          method: 'POST',
          headers: {
              'Content-Type': 'application/json',
          },
          body: JSON.stringify({
              contents: [{
                  parts: [{
                      text: prompt
                  }]
              }],
             generationConfig: {
                temperature: parseFloat(temperature),
              }
          })
     });
  
        if (!response.ok) {
          const errorData = await response.json();
          throw new Error(`Gemini API error: ${errorData.error.message}`);
        }
  
      const data = await response.json();
        console.log(data);
      const summary = data.candidates[0].content.parts[0].text;
      summaryTextArea.value = summary;
  
    } catch (error) {
        displayMessage(error.message, 'red');
        summaryTextArea.value = '';
    }
  }
  
  function extractQuestionFromTitle(title) {
    // Basic clickbait detection and question extraction (can be improved)
    const clickbaitPatterns = [
      /you won't believe/i,
      /the real reason/i,
      /what happened next/i,
      /this is why/i,
      /\?$/ //Ends with question mark
    ];
  
    for (const pattern of clickbaitPatterns) {
      if (pattern.test(title)) {
          if (title.includes("?")) {
                const endIndex = title.lastIndexOf("?");
              return title.substring(0, endIndex + 1); //extract question
          }
          return title; // Return the whole title if it's a clickbait statement
      }
    }
  
    return title; // Default to the full title if no clear question is found
  }
  
  
    function displayMessage(message, color = 'black') {
        errorDiv.textContent = message;
        errorDiv.style.color = color;
        setTimeout(()=>{errorDiv.textContent=''}, 5000) // clear after 5 seconds
  }
  
    // Helper function to get settings from storage
    function getSetting(key) {
      return new Promise(resolve => {
        chrome.storage.sync.get([key], result => {
          resolve(result[key]);
        });
      });
    }
  });