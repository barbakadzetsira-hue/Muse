// Client-side Application State
let poetryDb = null;
let activeBookIndex = null; // null means 'All'
let activePoem = null;
let currentDraft = { title: "", content: "" };

// Settings State
let settings = {
    apiKey: localStorage.getItem('muse_gemini_api_key') || '',
    model: localStorage.getItem('muse_gemini_model') || 'gemini-2.5-flash',
    ragEnabled: localStorage.getItem('muse_rag_enabled') !== 'false' // default true
};

// DOM Elements
const elements = {
    poemsList: document.getElementById('poems-list'),
    bookTabs: document.getElementById('book-tabs-container'),
    searchInput: document.getElementById('search-input'),
    listSubtitle: document.getElementById('list-subtitle'),
    
    // Chat Elements
    chatHistory: document.getElementById('chat-history'),
    chatForm: document.getElementById('chat-form'),
    chatInput: document.getElementById('chat-input'),
    btnSend: document.getElementById('btn-send'),
    
    // Slate/Editor Elements
    slateTitle: document.getElementById('slate-title'),
    slateEditor: document.getElementById('slate-editor'),
    btnClearSlate: document.getElementById('btn-clear-slate'),
    btnUseInPrompt: document.getElementById('btn-use-in-prompt'),
    charCount: document.getElementById('char-count'),
    lineCount: document.getElementById('line-count'),
    
    // Settings Elements
    btnSettings: document.getElementById('btn-settings'),
    settingsDialog: document.getElementById('settings-dialog'),
    btnCloseSettings: document.getElementById('btn-close-settings'),
    apiKeyInput: document.getElementById('api-key-input'),
    modelSelect: document.getElementById('model-select'),
    ragEnabledInput: document.getElementById('rag-enabled'),
    btnSaveSettings: document.getElementById('btn-save-settings'),
    connectionStatus: document.getElementById('connection-status'),
    
    // Quick Prompts
    qp1: document.getElementById('qp-1'),
    qp2: document.getElementById('qp-2'),
    qp3: document.getElementById('qp-3'),
};

// Initialization
document.addEventListener('DOMContentLoaded', async () => {
    // 1. Set values from stored settings
    elements.apiKeyInput.value = settings.apiKey;
    elements.modelSelect.value = settings.model;
    elements.ragEnabledInput.checked = settings.ragEnabled;

    updateConnectionStatus();
    if (settings.apiKey) {
        fetchAndPopulateModels(settings.apiKey);
    }

    // 2. Fetch Poetry Database
    try {
        const response = await fetch('poetry_db.json');
        if (!response.ok) throw new Error('Database file not found');
        poetryDb = await response.json();
        
        initializeUI();
    } catch (err) {
        console.error('Error loading database:', err);
        elements.poemsList.innerHTML = `<div class="empty-placeholder">⚠️ მონაცემთა ბაზა ვერ ჩაიტვირთა. გთხოვთ, ჯერ გაუშვათ ტექსტის ექსტრაქციის სკრიპტი.</div>`;
    }

    // 3. Register Event Listeners
    registerEventListeners();
});

// UI Initialization
function initializeUI() {
    renderBookTabs();
    renderPoemsList();
}

// Render Book Filter Tabs
function renderBookTabs() {
    elements.bookTabs.innerHTML = '';
    
    // Add "All" Tab
    const allTab = document.createElement('button');
    allTab.className = `book-tab ${activeBookIndex === null ? 'active' : ''}`;
    allTab.textContent = 'ყველა კრებული';
    allTab.addEventListener('click', () => {
        activeBookIndex = null;
        updateActiveBookTab();
        renderPoemsList();
    });
    elements.bookTabs.appendChild(allTab);

    // Add individual Book Tabs
    poetryDb.books.forEach((book, index) => {
        const tab = document.createElement('button');
        tab.className = `book-tab ${activeBookIndex === index ? 'active' : ''}`;
        tab.textContent = `${book.title} (${book.year})`;
        tab.addEventListener('click', () => {
            activeBookIndex = index;
            updateActiveBookTab();
            renderPoemsList();
        });
        elements.bookTabs.appendChild(tab);
    });
}

function updateActiveBookTab() {
    const tabs = elements.bookTabs.querySelectorAll('.book-tab');
    tabs.forEach((tab, index) => {
        if (activeBookIndex === null) {
            tab.classList.toggle('active', index === 0);
        } else {
            tab.classList.toggle('active', index === activeBookIndex + 1);
        }
    });
}

// Render Poems List with Filters & Search
function renderPoemsList(searchTerm = '') {
    elements.poemsList.innerHTML = '';
    searchTerm = searchTerm.toLowerCase().trim();

    let filteredPoems = [];

    // Filter by book first
    if (activeBookIndex !== null) {
        const book = poetryDb.books[activeBookIndex];
        elements.listSubtitle.textContent = `კრებული: ${book.title}`;
        book.poems.forEach(poem => {
            filteredPoems.push({
                bookTitle: book.title,
                bookYear: book.year,
                ...poem
            });
        });
    } else {
        elements.listSubtitle.textContent = 'ყველა კრებულის ლექსები';
        poetryDb.books.forEach(book => {
            book.poems.forEach(poem => {
                filteredPoems.push({
                    bookTitle: book.title,
                    bookYear: book.year,
                    ...poem
                });
            });
        });
    }

    // Apply text search if search term exists
    if (searchTerm) {
        filteredPoems = filteredPoems.filter(poem => 
            poem.title.toLowerCase().includes(searchTerm) || 
            poem.content.toLowerCase().includes(searchTerm)
        );
    }

    if (filteredPoems.length === 0) {
        elements.poemsList.innerHTML = `<div class="empty-placeholder">ლექსები ვერ მოიძებნა</div>`;
        return;
    }

    // Populate list
    filteredPoems.forEach(poem => {
        const li = document.createElement('li');
        li.className = 'poem-item glass-hover';
        li.setAttribute('role', 'listitem');
        if (activePoem && activePoem.title === poem.title && activePoem.content === poem.content) {
            li.classList.add('active');
        }

        li.innerHTML = `
            <div class="poem-item-title">${poem.title}</div>
            <div class="poem-item-book">
                <span>📖 ${poem.bookTitle}</span>
                <span>${poem.bookYear}წ. (გვ. ${poem.pageNumber})</span>
            </div>
        `;

        li.addEventListener('click', () => {
            // Set active poem
            activePoem = poem;
            
            // Highlight active item
            const items = elements.poemsList.querySelectorAll('.poem-item');
            items.forEach(item => item.classList.remove('active'));
            li.classList.add('active');

            // Load into Slate Editor
            loadPoemToSlate(poem);
        });

        elements.poemsList.appendChild(li);
    });
}

// Load Selected Poem to Writing Slate
function loadPoemToSlate(poem) {
    elements.slateTitle.value = poem.title;
    elements.slateEditor.value = poem.content;
    updateSlateStats();
}

// Update Editor stats
function updateSlateStats() {
    const text = elements.slateEditor.value;
    const chars = text.length;
    const lines = text.split('\n').filter(l => l.trim().length > 0).length;
    
    elements.charCount.textContent = `${chars} სიმბოლო`;
    elements.lineCount.textContent = `${lines} სტრიქონი`;
}

// Status update
function updateConnectionStatus() {
    if (settings.apiKey) {
        elements.connectionStatus.innerHTML = `
            <span class="status-dot"></span>
            <span class="status-label">მზადაა საუბრისთვის</span>
        `;
        elements.connectionStatus.style.borderColor = 'rgba(0, 245, 212, 0.2)';
    } else {
        elements.connectionStatus.innerHTML = `
            <span class="status-dot" style="background-color: #ff007f; box-shadow: 0 0 8px #ff007f;"></span>
            <span class="status-label" style="color: #ff007f;">საჭიროებს API გასაღებს</span>
        `;
        elements.connectionStatus.style.borderColor = 'rgba(255, 0, 127, 0.2)';
    }
}

// Event Listeners registration
function registerEventListeners() {
    // Search
    elements.searchInput.addEventListener('input', (e) => {
        renderPoemsList(e.target.value);
    });

    // Slate Stats Listener
    elements.slateEditor.addEventListener('input', updateSlateStats);
    elements.slateTitle.addEventListener('input', updateSlateStats);

    // Clear Slate
    elements.btnClearSlate.addEventListener('click', () => {
        elements.slateTitle.value = '';
        elements.slateEditor.value = '';
        updateSlateStats();
    });

    // Use draft in chat prompt
    elements.btnUseInPrompt.addEventListener('click', () => {
        const title = elements.slateTitle.value.trim();
        const content = elements.slateEditor.value.trim();
        if (!title && !content) return;
        
        let quoteText = `\n\n--- [სახელოსნოს მონახაზი] ---\n`;
        if (title) quoteText += `სათაური: ${title}\n`;
        quoteText += content;
        
        elements.chatInput.value += quoteText;
        elements.chatInput.focus();
    });

    // Settings Modal controls
    elements.btnSettings.addEventListener('click', () => {
        elements.settingsDialog.showModal();
    });

    elements.btnCloseSettings.addEventListener('click', () => {
        elements.settingsDialog.close();
    });

    elements.btnSaveSettings.addEventListener('click', () => {
        settings.apiKey = elements.apiKeyInput.value.trim();
        settings.model = elements.modelSelect.value;
        settings.ragEnabled = elements.ragEnabledInput.checked;

        localStorage.setItem('muse_gemini_api_key', settings.apiKey);
        localStorage.setItem('muse_gemini_model', settings.model);
        localStorage.setItem('muse_rag_enabled', settings.ragEnabled);

        updateConnectionStatus();
        if (settings.apiKey) {
            fetchAndPopulateModels(settings.apiKey);
        }
        elements.settingsDialog.close();

        addChatMessage('assistant', '⚙️ პარამეტრები წარმატებით შეინახა. ჩვენ შეგვიძლია გავაგრძელოთ მუშაობა!');
    });

    // Quick Prompts click listeners
    elements.qp1.addEventListener('click', () => {
        elements.chatInput.value = "დამიწერე მოკლე ლექსი სინათლეზე ცირას სტილში";
        elements.chatForm.requestSubmit();
    });
    
    elements.qp2.addEventListener('click', () => {
        const currentContent = elements.slateEditor.value.trim();
        if (currentContent) {
            elements.chatInput.value = `გთხოვ, გამიგრძელო ეს პოეტური სტრიქონები ცირა ბარბაქაძის სტილით:\n\n${currentContent}`;
        } else {
            elements.chatInput.value = `დაიწყე ახალი ლექსი სტრიქონით: „მე ვხატავ შეუძლებელს...“ და დამეხმარე მის გაგრძელებაში.`;
        }
        elements.chatInput.focus();
    });
    
    elements.qp3.addEventListener('click', () => {
        elements.chatInput.value = "ამიხსენი, რა არის ცირა ბარბაქაძის პოეტური კრებულის „უცხოქალაქის“ ძირითადი თემატიკა და სათქმელი?";
        elements.chatForm.requestSubmit();
    });

    // Chat Form Submit
    elements.chatForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const promptText = elements.chatInput.value.trim();
        if (!promptText) return;

        // Clear input
        elements.chatInput.value = '';
        
        // Add User Message
        addChatMessage('user', promptText);

        // Check for API key
        if (!settings.apiKey) {
            addChatMessage('assistant', '⚠️ გთხოვთ, ჯერ შეიყვანოთ თქვენი **Gemini API გასაღები** ზედა მარჯვენა პარამეტრების მენიუში (⚙️), რათა შევძლოთ საუბარი.');
            elements.settingsDialog.showModal();
            return;
        }

        // Call Gemini
        await callGeminiAgent(promptText);
    });
}

// Add message to chat box
function addChatMessage(sender, text) {
    const messageDiv = document.createElement('div');
    messageDiv.className = `message ${sender}-message glass`;
    
    const senderAvatar = sender === 'user' ? '👤' : '✦';
    const senderName = sender === 'user' ? 'თქვენ' : 'მუზა';

    // Basic markdown replacement for visual layout
    let htmlContent = text
        // Replace code blocks or poem blocks
        .replace(/```(?:poetry|markdown)?\n([\s\S]+?)\n```/g, '<div class="poem-block">$1</div>')
        // Bold tags
        .replace(/\*\*([\s\S]+?)\*\*/g, '<strong>$1</strong>')
        // Italic tags
        .replace(/\*([\s\S]+?)\*/g, '<em>$1</em>')
        // Newlines to br
        .replace(/\n/g, '<br>');

    messageDiv.innerHTML = `
        <div class="message-sender">
            <span class="sender-avatar">${senderAvatar}</span>
            <span class="sender-name">${senderName}</span>
        </div>
        <div class="message-content">${htmlContent}</div>
    `;

    elements.chatHistory.appendChild(messageDiv);
    elements.chatHistory.scrollTop = elements.chatHistory.scrollHeight;

    return messageDiv;
}

// Keyword-based RAG matching algorithm
function retrievePoetryContext(userPrompt) {
    if (!poetryDb || !settings.ragEnabled) return '';

    const lowercasePrompt = userPrompt.toLowerCase();
    const matchedPoems = [];
    
    // Core Georgian poetic keywords to extract from user prompts
    const keywords = [
        'სინათლე', 'სიბნელე', 'დუმილი', 'თამაში', 'ქალაქი', 'უცხოქალაქი', 'შეუძლებელი', 
        'დღესასწაული', 'სიტყვა', 'ღამე', 'სიკვდილი', 'სიცოცხლე', 'სიყვარული', 'წყალი', 
        'ცრემლი', 'თვალები', 'სახლი', 'გზა', 'ხელი', 'ქარი', 'ცა', 'მიწა'
    ];

    const detectedKeywords = keywords.filter(kw => lowercasePrompt.includes(kw));

    // Search and rank poems based on keyword matches
    poetryDb.books.forEach(book => {
        book.poems.forEach(poem => {
            let score = 0;
            
            // Check keyword presence in content
            detectedKeywords.forEach(kw => {
                if (poem.content.toLowerCase().includes(kw)) score += 2;
                if (poem.title.toLowerCase().includes(kw)) score += 5; // title match yields higher score
            });

            if (score > 0) {
                matchedPoems.push({ poem, bookTitle: book.title, bookYear: book.year, score });
            }
        });
    });

    // Sort by relevance
    matchedPoems.sort((a, b) => b.score - a.score);

    // If no relevant poems found by keywords, fetch 2 random representative poems as style guides
    let selectedPoems = matchedPoems.slice(0, 3).map(m => m.poem);
    if (selectedPoems.length === 0) {
        const allPoems = [];
        poetryDb.books.forEach(book => {
            book.poems.forEach(poem => allPoems.push(poem));
        });
        
        // Pick 2 random poems
        if (allPoems.length > 0) {
            const index1 = Math.floor(Math.random() * allPoems.length);
            let index2 = Math.floor(Math.random() * allPoems.length);
            if (index1 === index2 && allPoems.length > 1) {
                index2 = (index1 + 1) % allPoems.length;
            }
            selectedPoems = [allPoems[index1], allPoems[index2]];
        }
    }

    if (selectedPoems.length === 0) return '';

    // Build markdown string for LLM Context
    let contextStr = `\n\nკონტექსტი (ცირა ბარბაქაძის ლექსები შთაგონებისთვის):\n`;
    selectedPoems.forEach((poem, idx) => {
        contextStr += `\n[ლექსი ${idx + 1}: „${poem.title}“]\n${poem.content}\n`;
    });
    
    return contextStr;
}

// Call Gemini API via Fetch
async function callGeminiAgent(promptText) {
    // Show Typing Indicator
    const typingIndicator = document.createElement('div');
    typingIndicator.className = 'message assistant-message glass';
    typingIndicator.innerHTML = `
        <div class="message-sender">
            <span class="sender-avatar">✦</span>
            <span class="sender-name">მუზა</span>
        </div>
        <div class="typing-indicator">
            <span class="dot"></span>
            <span class="dot"></span>
            <span class="dot"></span>
        </div>
    `;
    elements.chatHistory.appendChild(typingIndicator);
    elements.chatHistory.scrollTop = elements.chatHistory.scrollHeight;

    try {
        // 1. Retrieve RAG Context (Poetry styling guides)
        const ragContext = retrievePoetryContext(promptText);

        // 2. Build full prompt payload
        const systemInstruction = `შენ ხარ „მუზა“ — შემოქმედებითი პოეტური თანაშემწე, რომელიც სპეციალიზებულია ცნობილი თანამედროვე ქართველი პოეტის, ცირა ბარბაქაძის წერის სტილში.
შენი მიზანია დაეხმარო მომხმარებელს ახალი ლექსების წერაში, შემოქმედებით ძიებაში, ან გაუანალიზო ცირა ბარბაქაძის პოეზია.

ცირა ბარბაქაძის პოეტური სტილის მახასიათებლები:
- **მეტაფორულობა და ფილოსოფიურობა**: მისი პოეზია არის ღრმა, ეგზისტენციალური. ხშირად ეხება დუმილის, სინათლის, უხილავი ქალაქის („უცხოქალაქი“), შეუძლებლის ხატვის, ცხოვრების თამაშის („ყველაფერი თამაშშია“) თემებს.
- **სტრუქტურა**: ძირითადად თავისუფალი ლექსი (ვერლიბრი), სადაც რიტმი იქმნება არა მკაცრი რითმებით, არამედ სიტყვების განმეორებით, შინაგანი მელოდიით და ემოციური დაწნეხვით.
- **ტონი**: ნაზი, მედიტაციური, ხანდახან სევდიანი, მაგრამ ყოველთვის აღმოჩენებით სავსე.

წესები შენთვის:
1. ილაპარაკე და წერე მხოლოდ **ქართულ ენაზე**.
2. როდესაც მომხმარებელი გთხოვს ლექსის დაწერას ან გაგრძელებას, შექმენი ტექსტი ცირა ბარბაქაძის სტილით.
3. შენს პასუხში ლექსი აუცილებლად ჩასვი \`\`\`poetry და \`\`\` ბლოკებში (მაგალითად: \`\`\`poetry\\nლექსის სტრიქონები\\n\`\`\`). ეს საშუალებას მისცემს აპლიკაციას ლამაზად გამოაჩინოს ლექსი ეკრანზე.
4. იყავი მხარდამჭერი, შემოქმედებითი და შთამაგონებელი პარტნიორი.`;

        const requestBody = {
            contents: [
                {
                    role: "user",
                    parts: [
                        { text: `${systemInstruction}\n\n[შენიშვნა: ქვემოთ მოყვანილია პოეტის ლექსები RAG კონტექსტიდან შთაგონებისთვის]\n${ragContext}\n\n[მომხმარებლის შეკითხვა / დავალება]:\n${promptText}` }
                    ]
                }
            ],
            generationConfig: {
                temperature: 0.7,
                maxOutputTokens: 2048
            },
            safetySettings: [
                {
                    category: "HARM_CATEGORY_HARASSMENT",
                    threshold: "BLOCK_NONE"
                },
                {
                    category: "HARM_CATEGORY_HATE_SPEECH",
                    threshold: "BLOCK_NONE"
                },
                {
                    category: "HARM_CATEGORY_SEXUALLY_EXPLICIT",
                    threshold: "BLOCK_NONE"
                },
                {
                    category: "HARM_CATEGORY_DANGEROUS_CONTENT",
                    threshold: "BLOCK_NONE"
                }
            ]
        };


        const apiVersion = 'v1';
        const apiEndpoint = `https://generativelanguage.googleapis.com/${apiVersion}/models/${settings.model}:generateContent?key=${settings.apiKey}`;

        const response = await fetch(apiEndpoint, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(requestBody)
        });

        // Remove Typing Indicator
        elements.chatHistory.removeChild(typingIndicator);

        if (!response.ok) {
            const errData = await response.json();
            throw new Error(errData.error?.message || `HTTP Error ${response.status}`);
        }

        const data = await response.json();
        console.log('Gemini API response data:', data);
        const responseText = data.candidates?.[0]?.content?.parts?.[0]?.text;

        if (responseText) {
            addChatMessage('assistant', responseText);
        } else {
            addChatMessage('assistant', '⚠️ სამწუხაროდ, პასუხის მიღება ვერ მოხერხდა. გთხოვთ, კიდევ სცადოთ.');
        }

    } catch (err) {
        // Remove Typing Indicator if still present
        if (elements.chatHistory.contains(typingIndicator)) {
            elements.chatHistory.removeChild(typingIndicator);
        }
        console.error('API Error:', err);
        
        let diagMsg = `❌ შეცდომა Gemini API-სთან კავშირისას: ${err.message}`;
        if (err.message.includes('not found') || err.message.includes('not supported') || err.message.includes('404') || err.message.includes('Model')) {
            diagMsg += `\n\n🔍 **ავტომატური დიაგნოსტიკა:** როგორც ჩანს, თქვენს API გასაღებზე ეს კონკრეტული მოდელი (\`${settings.model}\`) არ არის აქტიური ან ნებადართული. მოდით, შევამოწმოთ რომელი მოდელებია ხელმისაწვდომი...`;
            
            try {
                const diagRes = await fetch(`https://generativelanguage.googleapis.com/v1/models?key=${settings.apiKey}`);
                if (diagRes.ok) {
                    const diagData = await diagRes.json();
                    const available = diagData.models
                        ?.filter(m => m.supportedGenerationMethods?.includes('generateContent'))
                        ?.map(m => m.name.replace('models/', '')) || [];
                        
                    if (available.length > 0) {
                        diagMsg += `\n\nთქვენს გასაღებს აქვს წვდომა შემდეგ მოდელებზე:\n` + 
                            available.map(name => `* \`${name}\``).join('\n') + 
                            `\n\nგთხოვთ, გახსნათ პარამეტრები (⚙️), აირჩიოთ ერთ-ერთი მათგანი სიიდან (ან გამოიყენოთ ნაგულისხმევი \`gemini-2.5-flash\`) და სცადოთ ხელახლა.`;
                        
                        // Dynamically update the dropdown in the background too
                        populateDropdown(diagData.models);
                    }
                }
            } catch (diagErr) {
                console.error('Diagnostic fetch failed:', diagErr);
            }
        }
        
        addChatMessage('assistant', diagMsg);
    }
}

// Fetch available models from Gemini API and populate the model dropdown
async function fetchAndPopulateModels(apiKey) {
    if (!apiKey) return;
    
    try {
        const response = await fetch(`https://generativelanguage.googleapis.com/v1/models?key=${apiKey}`);
        if (!response.ok) {
            // Try v1beta if v1 fails
            const fallbackResponse = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`);
            if (!fallbackResponse.ok) return;
            const data = await fallbackResponse.json();
            populateDropdown(data.models);
            return;
        }
        
        const data = await response.json();
        populateDropdown(data.models);
    } catch (err) {
        console.error('Error fetching models:', err);
    }
}

function populateDropdown(models) {
    if (!models || !Array.isArray(models)) return;
    
    // Filter models that support generateContent
    const validModels = models.filter(m => m.supportedGenerationMethods?.includes('generateContent'));
    
    if (validModels.length === 0) return;
    
    // Get currently selected model
    const currentModel = elements.modelSelect.value;
    
    // Clear and populate dropdown
    elements.modelSelect.innerHTML = '';
    
    validModels.forEach(m => {
        const cleanName = m.name.replace('models/', '');
        const option = document.createElement('option');
        option.value = cleanName;
        
        // Add a friendly name if we recognize it
        let friendlyName = cleanName;
        if (cleanName === 'gemini-2.5-flash') friendlyName = 'Gemini 2.5 Flash (რეკომენდებული)';
        else if (cleanName === 'gemini-1.5-flash') friendlyName = 'Gemini 1.5 Flash';
        else if (cleanName === 'gemini-1.5-pro') friendlyName = 'Gemini 1.5 Pro';
        else if (m.displayName) friendlyName = `${m.displayName} (${cleanName})`;
        
        option.textContent = friendlyName;
        elements.modelSelect.appendChild(option);
    });
    
    // Try to restore previous selection if it exists in the new list, otherwise select the first one
    const optionExists = Array.from(elements.modelSelect.options).some(opt => opt.value === currentModel);
    if (optionExists) {
        elements.modelSelect.value = currentModel;
    } else if (elements.modelSelect.options.length > 0) {
        elements.modelSelect.selectedIndex = 0;
        settings.model = elements.modelSelect.value;
        localStorage.setItem('muse_gemini_model', settings.model);
    }
}


