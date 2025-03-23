document.addEventListener('DOMContentLoaded', function() {
    const summaryTextArea = document.getElementById('summary');
    const errorDiv = document.getElementById('error');
    const refreshBtn = document.getElementById('refreshBtn');
    const settingsBtn = document.getElementById('settingsBtn');
    const tempButtons = document.querySelectorAll('.temp-buttons button');
    const lengthSlider = document.getElementById('length');
    const lengthValueSpan = document.getElementById('lengthValue');

    // Settings elements
    const apiKeyInput = document.getElementById('apiKey');
    const saveApiKeyBtn = document.getElementById('saveApiKeyBtn');
    const successMessageDiv = document.getElementById('success-message');
    const settingsDiv = document.getElementById('settings');
    const mainDiv = document.getElementById('main');
    const closeSettingsBtn = document.getElementById('closeSettingsBtn');



    let selectedTemperature = 0.5; // Default temperature: Medium
    let selectedLength = 250; // Default length: 250 words
    let geminiApiKey = null;

      // --- Load API Key ---
    chrome.storage.sync.get(['geminiApiKey'], function(result) {
        if (result.geminiApiKey) {
            geminiApiKey = result.geminiApiKey;
            // If API key is loaded, hide settings, show main content and start
            settingsDiv.classList.add('hidden');
            mainDiv.classList.remove('hidden');
            startSummaryGeneration();
        } else {
            // Show settigns if no API key
            settingsDiv.classList.remove('hidden');
            mainDiv.classList.add('hidden');
        }
    });

      // --- Length Slider Event Listener ---
    lengthSlider.addEventListener('input', function() {
        selectedLength = parseInt(this.value);
        lengthValueSpan.textContent = selectedLength + " words";
    });

    // --- Temperature Button Click Handlers ---
    tempButtons.forEach(button => {
        button.addEventListener('click', function() {
            // Remove 'selected' class from all buttons
            tempButtons.forEach(btn => btn.classList.remove('selected'));
            // Add 'selected' class to the clicked button
            this.classList.add('selected');
            // Update selectedTemperature
            selectedTemperature = parseFloat(this.dataset.temp);
            console.log("Skepticism level set to:", selectedTemperature); // Debugging
        });
    });

    // --- Button Click Handlers ---
    refreshBtn.addEventListener('click', function() {
        errorDiv.textContent = ''; // Clear previous error
        summaryTextArea.value = 'Loading...'; // Set loading text
        summaryTextArea.classList.add('loading'); // Show spinner
        summaryTextArea.innerHTML = '<div class="spinner"></div>';
        startSummaryGeneration(); // Call the main function
    });
    // --- Save API Key Button ---
    saveApiKeyBtn.addEventListener('click', function() {
        const apiKey = apiKeyInput.value.trim();
        if (apiKey) {
            chrome.storage.sync.set({ geminiApiKey: apiKey }, function() {
                console.log('API Key saved:', apiKey);
                successMessageDiv.classList.remove('hidden'); //Show message
                geminiApiKey = apiKey; // Update the global variable
                setTimeout(() => {
                    successMessageDiv.classList.add('hidden'); // Hide message
                     settingsDiv.classList.add('hidden'); // Hide settings
                    mainDiv.classList.remove('hidden'); // Show main content
                    startSummaryGeneration();// and start
                }, 2000);

            });
        } else {
            displayMessage('Please enter an API key.', 'red');
        }
    });
     settingsBtn.addEventListener('click', function() {
        // Placeholder for settings functionality.
        settingsDiv.classList.toggle('hidden');

    });
      closeSettingsBtn.addEventListener('click', function() {
          settingsDiv.classList.add('hidden');
    });

    // --- Main Function ---
    function startSummaryGeneration() {
         // Check if API key is loaded before proceeding
        if (!geminiApiKey) {
            displayMessage('API key not set. Please enter your Gemini API key in the settings.', 'red');
             summaryTextArea.classList.remove('loading');
            summaryTextArea.value = '';
            return; // Stop execution if no API key
        }
        chrome.tabs.query({ active: true, currentWindow: true }, function(tabs) {
            const tab = tabs[0];
            if (tab.url && tab.url.includes('youtube.com/watch')) {
                const videoId = new URL(tab.url).searchParams.get('v');
                getVideoTranscript(videoId, tab.title, tab.id);
            } else {
                displayMessage('Not a YouTube video page.', 'red');
                summaryTextArea.value = '';
                summaryTextArea.classList.remove('loading'); //remove loading
            }
        });
    }

    // --- Transcript Retrieval and Summarization Logic --- (Remains largely the same)
   async function getVideoTranscript(videoId, videoTitle, tabId) {
        console.log("getVideoTranscript called with videoId:", videoId, "title:", videoTitle, "tabId:", tabId);
        try {
            // Try 1: get_video_info (often fails, but fast when it works)
            let transcriptText = await fetchTranscriptFromVideoInfo(videoId);
            if (transcriptText) {
                console.log("Transcript found via get_video_info");
                await generateSummary(videoTitle, transcriptText, selectedTemperature, selectedLength); // Pass temp and length
                return;
            }

            // Try 2: Scrape ytInitialPlayerResponse (more reliable)
            transcriptText = await scrapeTranscript(tabId);
            if (transcriptText) {
                console.log("Transcript found via scrapeTranscript");
                await generateSummary(videoTitle, transcriptText, selectedTemperature, selectedLength); // Pass temp and length
                return;
            }

            // Try 3: Fallback to Gemini with page content (last resort)
            console.log("Falling back to page content summarization.");
            const pageContent = await getPageContent(tabId); // Get page content directly
            if (pageContent) {
              await generateSummaryFromPageContent(videoTitle, pageContent, selectedTemperature, selectedLength); // Pass temp and length
            } else {
                throw new Error('Could not retrieve transcript or page content.');
            }

        } catch (error) {
            console.error("Error in getVideoTranscript:", error);
            displayMessage(error.message, 'red');
            summaryTextArea.value = '';
            summaryTextArea.classList.remove('loading'); // Remove spinner
        }
    }

     async function getPageContent(tabId) {
        return new Promise((resolve, reject) => {
            chrome.scripting.executeScript({
                target: { tabId: tabId },
                func: function() {
                    // Get all text content from the page and preprocess
                    let pageText = document.body.innerText;
                      // Remove likely irrelevant sections (comments, recommendations, etc.)
                    pageText = pageText.replace(/Comments\s*(\n.*)*/g, ''); // Remove "Comments" and everything after
                    pageText = pageText.replace(/Up next\s*Autoplay.*/g, '');  // Remove "Up next" section
                    pageText = pageText.replace(/People also watched\s*(\n.*)*/g, ''); // Remove "People also watched"

                    // Remove excessive whitespace and newlines
                    pageText = pageText.replace(/\s+/g, ' ').trim();
                    return pageText;
                }
            }, (results) => {
                if (chrome.runtime.lastError || !results || results.length === 0 || !results[0]?.result) {
                    console.error("Error getting page content:", chrome.runtime.lastError);
                    resolve(null);
                    return;
                }
                resolve(results[0].result);
            });
        });
    }

    async function fetchTranscriptFromVideoInfo(videoId) {
        console.log("Attempting to fetch transcript from get_video_info...");
        try {
            const response = await fetch(`https://www.youtube.com/get_video_info?video_id=${videoId}&hl=en`); // No el=embedded

            if (!response.ok) {
                console.warn(`get_video_info failed: ${response.status}`);
                return null; // Don't throw, try the fallback
            }

            const videoInfo = await response.text();
            const parsedVideoInfo = parseQueryString(videoInfo);

            if (!parsedVideoInfo.player_response) {
                console.warn('No player_response in get_video_info.');
                return null;
            }
            const playerResponse = JSON.parse(parsedVideoInfo.player_response);

            if (!playerResponse.captions) {
                console.warn('No captions in get_video_info player_response.');
                return null;
            }

            const captionTracks = playerResponse.captions.playerCaptionsTracklistRenderer.captionTracks;

            if (!captionTracks || captionTracks.length === 0) {
                console.warn('No caption tracks found in get_video_info.');
                return null;
            }

            // Find English caption track
            let baseUrl = null;
            for (const track of captionTracks) {
                if (track.languageCode === 'en') {
                    baseUrl = track.baseUrl;
                    break;
                }
            }

            if (!baseUrl) {
                console.warn('No English caption track found in get_video_info.');
                return null;
            }

            console.log("Fetching transcript from:", baseUrl);
            const transcriptResponse = await fetch(baseUrl);
            if (!transcriptResponse.ok) {
                console.warn(`Failed to download transcript from get_video_info: ${transcriptResponse.status}`);
                return null;
            }
            const transcriptXml = await transcriptResponse.text();
            console.log("Transcript XML fetched successfully.");
            return parseTranscriptXml(transcriptXml);


        } catch (error) {
            console.warn('Error in fetchTranscriptFromVideoInfo:', error);
            return null; // Try fallback
        }
    }
async function scrapeTranscript(tabId) {
        console.log("Attempting to scrape transcript...");
        return new Promise((resolve, reject) => {
            chrome.scripting.executeScript({
                target: { tabId: tabId },
                func: function() {
                    function getTranscriptData() {
                        // Corrected path:
                        if (window.ytInitialPlayerResponse && window.ytInitialPlayerResponse.playerCaptionsTracklistRenderer) {
                            const captionTracks = window.ytInitialPlayerResponse.playerCaptionsTracklistRenderer.captionTracks;
                            if (!captionTracks || captionTracks.length === 0) {
                                return null;
                            }
                            let baseUrl = null;
                            for (const track of captionTracks) {
                                if (track.languageCode === 'en') {
                                    baseUrl = track.baseUrl;
                                    break;
                                }
                            }
                            if (baseUrl) {
                                return baseUrl;
                            }
                        }
                        return null;
                    }

                    let attempts = 0;
                    const maxAttempts = 5;
                    const interval = 200; // milliseconds

                    const intervalId = setInterval(() => {
                        attempts++;
                        const data = getTranscriptData();
                        if (data || attempts >= maxAttempts) {
                            clearInterval(intervalId);
                            resolve(data);
                        }
                    }, interval);
                }
            }, async (results) => {
                if (chrome.runtime.lastError) {
                    console.error("scrapeTranscript content script error:", chrome.runtime.lastError);
                    resolve(null);
                    return;
                }
                if (!results || results.length === 0 || !results[0]?.result) {
                    console.warn('No transcript URL from content script.');
                    resolve(null);
                    return;
                }
                const transcriptUrl = results[0].result;
                console.log("Transcript URL found:", transcriptUrl);

                try {
                    const transcriptResponse = await fetch(transcriptUrl);
                    if (!transcriptResponse.ok) {
                        console.warn(`Failed to download transcript from scraped URL: ${transcriptResponse.status}`);
                        resolve(null);
                    }
                    const transcriptXml = await transcriptResponse.text();
                    console.log("Transcript XML fetched successfully (scrape).");
                    resolve(parseTranscriptXml(transcriptXml));
                } catch (error) {
                    console.warn('Error in scrapeTranscript fetching XML:', error);
                    resolve(null);
                }
            });
        });
    }
    async function generateSummaryFromPageContent(videoTitle, pageContent, temperature, length) {
        console.log("generateSummaryFromPageContent called");
        try {
            const question = extractQuestionFromTitle(videoTitle);
            // --- IMPROVED PROMPT ---
            const prompt = `Analyze the following YouTube video page content and provide a concise, skeptical summary addressing the core question or claim in the title.  The summary should be approximately ${length} words long. Ignore irrelevant chatter, promotional text, comments, and recommendations. Focus on factual information directly related to the video's main topic.

Title: ${videoTitle}
Question: ${question}

Page Content:
${pageContent}

Summary (Skeptical, Concise, Approximately ${length} words):`;
            // --- END IMPROVED PROMPT ---
            const response = await fetch('https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=' + geminiApiKey, {
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
                        temperature: temperature,
                    }
                })
            });

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(`Gemini API error: ${errorData.error.message}`);
            }

            const data = await response.json();
             if (data.candidates && data.candidates[0] && data.candidates[0].content && data.candidates[0].content.parts && data.candidates[0].content.parts[0]) {
                const summary = data.candidates[0].content.parts[0].text;
                await typeText(summaryTextArea, summary);
            } else {
                console.error("Unexpected response structure:", data);
                throw new Error("Gemini API returned an unexpected response structure.");
            }

        } catch (error) {
            displayMessage(error.message, 'red');
             summaryTextArea.value = '';
        } finally {
             summaryTextArea.classList.remove('loading');
        }
    }

     async function generateSummary(videoTitle, transcript, temperature, length) {
      console.log("generateSummary called with transcript");
        try {
            const question = extractQuestionFromTitle(videoTitle);

            // --- IMPROVED PROMPT (Transcript Version) ---
            const prompt = `Provide a concise and skeptical summary of the following YouTube video transcript. The summary should be approximately ${length} words long. Focus on the main points and arguments related to the question: "${question}".

Title: ${videoTitle}
Transcript:
${transcript}

Summary (Skeptical, Concise, Approximately ${length} words):`;
            // --- END IMPROVED PROMPT ---

            const response = await fetch('https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=' + geminiApiKey, {
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
                        temperature: temperature,
                    }
                })
            });

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(`Gemini API error: ${errorData.error.message}`);
            }

            const data = await response.json();
            if (data.candidates && data.candidates[0] && data.candidates[0].content && data.candidates[0].content.parts && data.candidates[0].content.parts[0]) {
                const summary = data.candidates[0].content.parts[0].text;
                await typeText(summaryTextArea, summary);
            } else {
                console.error("Unexpected response structure:", data);
                throw new Error("Gemini API returned an unexpected response structure.");
            }
        } catch (error) {
            displayMessage(error.message, 'red');
             summaryTextArea.value = '';
        } finally {
          summaryTextArea.classList.remove('loading');
        }
    }

    async function typeText(element, text, speed = 1) {
        element.value = '';
        for (let i = 0; i < text.length; i++) {
            element.value += text[i];
            await new Promise(resolve => setTimeout(resolve, speed));
        }
    }

    function parseTranscriptXml(xmlString) {
        console.log("Parsing transcript XML...");
        const parser = new DOMParser();
        const xmlDoc = parser.parseFromString(xmlString, "text/xml");
        const textNodes = xmlDoc.getElementsByTagName("text");
        let transcript = "";

        for (let i = 0; i < textNodes.length; i++) {
            transcript += textNodes[i].textContent.replace(/'/g, "'") + " "; // Replace HTML entity with apostrophe
        }

        console.log("Parsed transcript:", transcript); // Log the parsed transcript
        return transcript.trim();
    }

    function extractQuestionFromTitle(title) {
        // Improved clickbait detection
        const clickbaitPatterns = [
            /you won't believe/i,
            /the real reason/i,
            /what happened next/i,
            /this is why/i,
            /truth/i,
            /exposed/i,
            /revealed/i,
            /reality/i,
            /shocking/i,
            /unbelievable/i,
            /secret/i,
            /they don't want you to know/i,
            /this changes everything/i,
            /biggest mistake/i,
            /nobody talks about this/i,
            /hidden secrets/i,
            /wait until you see/i,
            /i was wrong about/i,
            /you need to see this/i,
            /don't do this/i,
            /it finally happened/i,
            /\?$/ //Ends with question mark
        ];

        for (const pattern of clickbaitPatterns) {
            if (pattern.test(title)) {
                if (title.includes("?")) {
                    const endIndex = title.lastIndexOf("?");
                    return title.substring(0, endIndex + 1); //extract question
                }
                return title;
            }
        }
        return title;
    }


    function displayMessage(message, color = 'black') {
        errorDiv.textContent = message;
        errorDiv.style.color = color;
        setTimeout(() => { errorDiv.textContent = '' }, 5000);
    }

    function parseQueryString(queryString) {
        const queryParams = {};
        const pairs = queryString.split('&');

        for (const pair of pairs) {
            const [key, value] = pair.split('=').map(decodeURIComponent);
            queryParams[key] = value;
        }

        return queryParams;
    }

});