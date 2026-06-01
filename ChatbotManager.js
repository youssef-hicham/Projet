class ChatbotManager {
    constructor(apiUrl, userManager) {
        this.apiUrl = apiUrl;
        this.userManager = userManager;
        this.isOpen = false;

        // 1. Injecter le CSS Premium
        this.injectStyles();
        
        // 2. Créer l'interface HTML
        this.renderUI();
        
        // 3. Attacher les événements (clics, touche Entrée)
        this.setupEvents();

        // Message de bienvenue avec un petit délai pour faire plus naturel
        setTimeout(() => {
            this.addMessage('bot', "Bonjour Admin ! Je suis l'assistant Newton. Que puis-je faire pour vous ?");
        }, 1000);
    }

    injectStyles() {
        const style = document.createElement('style');
        style.innerHTML = `
            /* --- BOUTON FLOTTANT --- */
            .chatbot-fab {
                position: fixed;
                bottom: 30px;
                right: 30px;
                width: 60px;
                height: 60px;
                background-color: #000000;
                color: #ffffff;
                border-radius: 50%;
                display: flex;
                justify-content: center;
                align-items: center;
                box-shadow: 0 8px 30px rgba(0, 0, 0, 0.2);
                cursor: pointer;
                z-index: 9999;
                transition: transform 0.3s cubic-bezier(0.23, 1, 0.32, 1), box-shadow 0.3s;
            }
            .chatbot-fab:hover {
                transform: scale(1.05) translateY(-5px);
                box-shadow: 0 15px 40px rgba(0, 0, 0, 0.3);
            }
            .chatbot-fab svg {
                width: 28px;
                height: 28px;
                fill: currentColor;
            }

            /* --- FENÊTRE DU CHAT --- */
            .chatbot-window {
                position: fixed;
                bottom: 110px;
                right: 30px;
                width: 380px;
                height: 600px;
                max-height: 80vh;
                background: #ffffff;
                border-radius: 20px;
                box-shadow: 0 20px 50px rgba(0, 0, 0, 0.15);
                border: 1px solid #eaeaea;
                display: flex;
                flex-direction: column;
                z-index: 9998;
                overflow: hidden;
                transform: translateY(20px);
                opacity: 0;
                pointer-events: none;
                transition: all 0.4s cubic-bezier(0.23, 1, 0.32, 1);
                font-family: 'Inter', -apple-system, sans-serif;
            }
            .chatbot-window.open {
                transform: translateY(0);
                opacity: 1;
                pointer-events: auto;
            }

            /* --- HEADER --- */
            .chatbot-header {
                background: #000000;
                color: #ffffff;
                padding: 15px 20px;
                display: flex;
                justify-content: space-between;
                align-items: center;
                font-weight: 600;
                font-size: 1.1rem;
            }
            .chatbot-close {
                cursor: pointer;
                font-size: 1.5rem;
                line-height: 1;
                opacity: 0.7;
                transition: opacity 0.2s;
            }
            .chatbot-close:hover {
                opacity: 1;
            }

            /* --- CORPS DES MESSAGES --- */
            .chatbot-body {
                flex: 1;
                background: #fafafa;
                padding: 20px;
                overflow-y: auto;
                display: flex;
                flex-direction: column;
                gap: 15px;
            }

            /* --- BULLES DE MESSAGES --- */
            .chat-msg {
                max-width: 85%;
                padding: 12px 16px;
                font-size: 0.95rem;
                line-height: 1.4;
                animation: fadeUp 0.3s ease-out forwards;
            }
            .chat-msg.user {
                background: #000000;
                color: #ffffff;
                border-radius: 16px 16px 0 16px;
                align-self: flex-end;
            }
            .chat-msg.bot {
                background: #ffffff;
                color: #111111;
                border: 1px solid #eaeaea;
                border-radius: 16px 16px 16px 0;
                align-self: flex-start;
                box-shadow: 0 4px 15px rgba(0,0,0,0.03);
            }

            /* --- FOOTER INPUT --- */
            .chatbot-footer {
                padding: 15px;
                background: #ffffff;
                border-top: 1px solid #eaeaea;
                display: flex;
                gap: 10px;
            }
            .chatbot-input {
                flex: 1;
                border: 1px solid #eaeaea;
                border-radius: 12px;
                padding: 12px 15px;
                font-size: 0.95rem;
                outline: none;
                transition: border-color 0.2s;
            }
            .chatbot-input:focus {
                border-color: #000000;
            }
            .chatbot-send {
                background: #000000;
                color: #ffffff;
                border: none;
                border-radius: 12px;
                width: 45px;
                display: flex;
                justify-content: center;
                align-items: center;
                cursor: pointer;
                transition: transform 0.2s;
            }
            .chatbot-send:hover {
                transform: scale(0.95);
            }
            
            @keyframes fadeUp {
                from { opacity: 0; transform: translateY(10px); }
                to { opacity: 1; transform: translateY(0); }
            }
        `;
        document.head.appendChild(style);
    }

    renderUI() {
        const container = document.createElement('div');
        container.innerHTML = `
            <div class="chatbot-fab" id="chatbotFab" title="Assistant IA">
                <svg viewBox="0 0 24 24"><path d="M12 2C6.48 2 2 5.92 2 11c0 2.21 1.02 4.18 2.75 5.67C4.4 18.5 3.2 20.7 3.1 20.9c-.1.2.1.5.3.5.1 0 .2 0 .3-.1 2.3-1.1 4.3-1.4 5.3-1.5.9.3 2 .4 3 .4 5.52 0 10-3.92 10-9s-4.48-9-10-9zm0 16c-.9 0-1.8-.1-2.7-.3l-.4-.1-.4.1c-.8.2-2.3.6-3.8 1 1-1.3 1.7-2.9 2-4.1l.2-.7-.5-.5C5 12.3 4 10.7 4 9c0-3.9 3.6-7 8-7s8 3.1 8 7-3.6 7-8 7z"/><circle cx="8.5" cy="10.5" r="1.5"/><circle cx="15.5" cy="10.5" r="1.5"/></svg>
            </div>

            <div class="chatbot-window" id="chatbotWindow">
                <div class="chatbot-header">
                    <span>🤖 Copilote Newton</span>
                    <span class="chatbot-close" id="chatbotClose">&times;</span>
                </div>
                <div class="chatbot-body" id="chatbotBody"></div>
                <div class="chatbot-footer">
                    <input type="text" class="chatbot-input" id="chatbotInput" placeholder="Posez une question...">
                    <button class="chatbot-send" id="chatbotSend">
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="white"><path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z"/></svg>
                    </button>
                </div>
            </div>
        `;
        document.body.appendChild(container);

        this.fab = document.getElementById('chatbotFab');
        this.window = document.getElementById('chatbotWindow');
        this.closeBtn = document.getElementById('chatbotClose');
        this.body = document.getElementById('chatbotBody');
        this.input = document.getElementById('chatbotInput');
        this.sendBtn = document.getElementById('chatbotSend');
    }

    setupEvents() {
        this.fab.addEventListener('click', () => this.toggleChat());
        this.closeBtn.addEventListener('click', () => this.toggleChat());
        
        this.sendBtn.addEventListener('click', () => this.handleSend());
        this.input.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') this.handleSend();
        });
    }

    toggleChat() {
        this.isOpen = !this.isOpen;
        if (this.isOpen) {
            this.window.classList.add('open');
            this.input.focus();
        } else {
            this.window.classList.remove('open');
        }
    }

    async handleSend() {
        const text = this.input.value.trim();
        if (!text) return;

        // 1. Afficher le message de l'admin
        this.addMessage('user', text);
        this.input.value = '';

        // 2. Simuler l'indicateur "Entrain d'écrire..."
        const typingId = this.addMessage('bot', '<span style="opacity: 0.5;">En train d\'écrire...</span>', true);

        // 3. Appel API vers le Backend
        try {
            const token = this.userManager.token; // On s'assure d'utiliser le token Admin
            
            const response = await fetch(`${this.apiUrl}/chat`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({ message: text })
            });

            const data = await response.json();
            document.getElementById(typingId)?.remove();
            
            // Affichage de la réponse du serveur IA
            if (data.reply) {
                this.addMessage('bot', data.reply);
            } else {
                this.addMessage('bot', `⚠️ Erreur : ${data.error || "Je n'ai pas pu générer une réponse."}`);
            }
        } catch (error) {
            document.getElementById(typingId)?.remove();
            this.addMessage('bot', "❌ Impossible de contacter le serveur. Vérifiez que la route API est créée.");
        }
    }

    addMessage(sender, htmlContent, isTyping = false) {
        const msgDiv = document.createElement('div');
        msgDiv.className = `chat-msg ${sender}`;
        const msgId = 'msg-' + Math.random().toString(36).substr(2, 9);
        msgDiv.id = msgId;
        msgDiv.innerHTML = htmlContent;
        
        this.body.appendChild(msgDiv);
        
        // Scroller tout en bas
        this.body.scrollTop = this.body.scrollHeight;
        
        return msgId;
    }
}

// Instanciation automatique
document.addEventListener("DOMContentLoaded", () => {
    if (typeof userManager !== 'undefined') {
        new ChatbotManager("https://recharge.cielnewton.fr/api", userManager);
    }
});