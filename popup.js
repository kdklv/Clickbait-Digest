document.addEventListener('DOMContentLoaded', function() {
    const summaryTextArea = document.getElementById('summary');
    const errorDiv = document.getElementById('error');
    const refreshBtn = document.getElementById('refreshBtn');
    const settingsBtn = document.getElementById('settingsBtn');
    const tempButtons = document.querySelectorAll('.temp-buttons button');
    const lengthSlider = document.getElementById('length');
    const lengthValueSpan = document.getElementById('lengthValue');
    const loadingOverlay = document.querySelector('.loading-overlay');

    // Settings elements
    const apiKeyInput = document.getElementById('apiKey');
    const saveApiKeyBtn = document.getElementById('saveApiKeyBtn');
    const successMessageDiv = document.getElementById('success-message');
    const settingsDiv = document.getElementById('settings');
    const mainDiv = document.getElementById('main');
    const closeSettingsBtn = document.getElementById('closeSettingsBtn');

    // Add summarization state tracking
    let isSummarizing = false;

    let selectedLength = 50; // Default to 50 words
    let geminiApiKey = null;

    // --- Prompts ---
    const prompts = {
        low: (videoTitle, question, pageContent, length) => `Provide a concise summary (approximately ${length} words) of the following YouTube video page content, accepting most claims at face value.  Focus on summarizing the main points as presented, without critical analysis.

Title: ${videoTitle}
Question: ${question}

Page Content:
${pageContent}

Summary:`,

        medium: (videoTitle, question, pageContent, length) => `Analyze the following YouTube video page content and provide a concise summary (approximately ${length} words) addressing the core question or claim in the title.  Apply a moderate level of skepticism; consider potential biases or exaggerations, but don't be overly critical. Focus on the main points and arguments.

Title: ${videoTitle}
Question: ${question}

Page Content:
${pageContent}

Summary:`,

        high: (videoTitle, question, pageContent, length) => `Analyze the following YouTube video page content and provide a concise, *highly skeptical* summary (approximately ${length} words) addressing the core question or claim in the title.  Critically evaluate the information presented.  Identify any potential biases, exaggerations, logical fallacies, or unsubstantiated claims.  Focus on the core arguments, but question their validity.

Title: ${videoTitle}
Question: ${question}

Page Content:
${pageContent}

Summary:`,
    };

      // --- Load API Key ---
    chrome.storage.sync.get(['geminiApiKey'], function(result) {
        if (result.geminiApiKey) {
            geminiApiKey = result.geminiApiKey;
            // If API key is loaded, hide settings, show main content and start
            settingsDiv.classList.add('hidden');
            mainDiv.classList.remove('hidden');
            // Show loading overlay immediately
            loadingOverlay.classList.add('visible');
            startSummaryGeneration();
        } else {
            // Show settings if no API key
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
        tempButtons.forEach(btn => btn.classList.remove('selected'));
        this.classList.add('selected');
        console.log("Skepticism level set to:", this.dataset.promptType);
        });
    });

    // --- Button Click Handlers ---
    refreshBtn.addEventListener('click', function() {
        // Prevent re-triggering if already summarizing
        if (isSummarizing) {
            return;
        }
        
        errorDiv.textContent = ''; // Clear previous error
        loadingOverlay.classList.add('visible');
        
        // Disable buttons during summarization
        setButtonsState(true);
        
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
                    loadingOverlay.classList.add('visible'); // Show loading animation
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
            loadingOverlay.classList.remove('visible');
            setButtonsState(false); // Re-enable buttons
            return; // Stop execution if no API key
        }
        chrome.tabs.query({ active: true, currentWindow: true }, function(tabs) {
            const tab = tabs[0];
            if (tab.url && tab.url.includes('youtube.com/watch')) {
                const videoId = new URL(tab.url).searchParams.get('v');
                getVideoTranscript(videoId, tab.title, tab.id);
            } else {
                displayMessage('Not a YouTube video page.', 'red');
                loadingOverlay.classList.remove('visible');
                setButtonsState(false); // Re-enable buttons
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
                await generateSummary(videoTitle, transcriptText, selectedLength); // Pass only length
                return;
            }

            // Try 2: Scrape ytInitialPlayerResponse (more reliable)
            transcriptText = await scrapeTranscript(tabId);
            if (transcriptText) {
                console.log("Transcript found via scrapeTranscript");
                await generateSummary(videoTitle, transcriptText, selectedLength); // Pass only length
                return;
            }

            // Try 3: Fallback to Gemini with page content (last resort)
            console.log("Falling back to page content summarization.");
            const pageContent = await getPageContent(tabId); // Get page content directly
            if (pageContent) {
              await generateSummaryFromPageContent(videoTitle, pageContent, selectedLength); // Pass only length
            } else {
                throw new Error('Could not retrieve transcript or page content.');
            }

        } catch (error) {
            console.error("Error in getVideoTranscript:", error);
            displayMessage(error.message, 'red');
            loadingOverlay.classList.remove('visible');
            setButtonsState(false); // Re-enable buttons
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
    async function generateSummaryFromPageContent(videoTitle, pageContent, length) {
        console.log("generateSummaryFromPageContent called");
        try {
            const question = extractQuestionFromTitle(videoTitle);
            const selectedPromptType = document.querySelector('.temp-buttons .selected').dataset.promptType;
            const prompt = prompts[selectedPromptType](videoTitle, question, pageContent, length);

            const response = await fetch(
                "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=" + geminiApiKey,
                {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json",
                    },
                    body: JSON.stringify({
                        contents: [
                            {
                                parts: [
                                    {
                                        text: prompt,
                                    },
                                ],
                            },
                        ],
                        generationConfig: {
                            temperature: 0.5, // Fixed temperature
                        },
                    }),
                }
            );

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(`Gemini API error: ${errorData.error.message}`);
            }

            const data = await response.json();
            if (
                data.candidates &&
                data.candidates[0] &&
                data.candidates[0].content &&
                data.candidates[0].content.parts &&
                data.candidates[0].content.parts[0]
            ) {
                const summary = data.candidates[0].content.parts[0].text;
                typewriterEffect(summaryTextArea, summary);
            } else {
                console.error("Unexpected response structure:", data);
                throw new Error(
                    "Gemini API returned an unexpected response structure."
                );
            }
        } catch (error) {
            displayMessage(error.message, 'red');
            summaryTextArea.value = "";
            loadingOverlay.classList.remove('visible');
            setButtonsState(false); // Re-enable buttons on error
        } finally {
            loadingOverlay.classList.remove('visible');
            // Remove setButtonsState here as it will be called after typewriter effect
        }
    }

     async function generateSummary(videoTitle, transcript, length) {
        console.log("generateSummary called with transcript");
        try {
            const question = extractQuestionFromTitle(videoTitle);
            const selectedPromptType = document.querySelector('.temp-buttons .selected').dataset.promptType;
            const prompt = prompts[selectedPromptType](videoTitle, question, transcript, length);

            const response = await fetch(
                "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=" + geminiApiKey,
                {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json",
                    },
                    body: JSON.stringify({
                        contents: [
                            {
                                parts: [
                                    {
                                        text: prompt,
                                    },
                                ],
                            },
                        ],
                        generationConfig: {
                            temperature: 0.5, // Fixed temperature
                        },
                    }),
                }
            );

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(`Gemini API error: ${errorData.error.message}`);
            }

            const data = await response.json();
            if (
                data.candidates &&
                data.candidates[0] &&
                data.candidates[0].content &&
                data.candidates[0].content.parts &&
                data.candidates[0].content.parts[0]
            ) {
                const summary = data.candidates[0].content.parts[0].text;
                typewriterEffect(summaryTextArea, summary);
            } else {
                console.error("Unexpected response structure:", data);
                throw new Error(
                    "Gemini API returned an unexpected response structure."
                );
            }
        } catch (error) {
            displayMessage(error.message, 'red');
            summaryTextArea.value = "";
            loadingOverlay.classList.remove('visible');
            setButtonsState(false); // Re-enable buttons on error
        } finally {
            loadingOverlay.classList.remove('visible');
            // Remove setButtonsState here as it will be called after typewriter effect
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
            /this is a game changer/i,
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

    function typewriterEffect(element, text, speed = 10) {
        let i = 0;
        element.value = '';
        element.classList.add('typing');
        
        function type() {
            if (i < text.length) {
                element.value += text.charAt(i);
                i++;
                element.scrollTop = element.scrollHeight;
                setTimeout(type, speed);
            } else {
                element.classList.remove('typing');
                setButtonsState(false); // Only re-enable buttons after typing is complete
            }
        }
        
        type();
    }

    // Helper function to enable/disable buttons
    function setButtonsState(disabled) {
        isSummarizing = disabled;
        
        // Disable/enable refresh button
        if (disabled) {
            refreshBtn.classList.add('disabled');
            refreshBtn.setAttribute('title', 'Summarization in progress...');
        } else {
            refreshBtn.classList.remove('disabled');
            refreshBtn.setAttribute('title', 'Refresh');
        }
        
        // Disable/enable temperature buttons
        tempButtons.forEach(button => {
            if (disabled) {
                button.classList.add('disabled');
            } else {
                button.classList.remove('disabled');
            }
        });
    }

});