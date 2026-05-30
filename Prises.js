class PriseManager {

    constructor(apiUrl, userManager) {
        this.apiUrl = apiUrl;
        this.userManager = userManager; // Pour rÃ©cupÃ©rer le token
        this.prises = []
        this.sanitizer = (str) => {
            if (!str) return '';
            const temp = document.createElement('div');
            temp.textContent = str;
            return temp.innerHTML;
        };
        this.tableBody = document.getElementById("priseTableBody")
        this.btnAddPrise = document.getElementById("btnAddPrise")
        this.btnDeletePrise = document.getElementById("btnDeletePrise")
        this.selectedPrise = null
        this.init()
        this.initSocket() // DÃ©marrage des WebSockets
    }

    init() {

        // --- NOUVEAU BOUTON : PROVISIONNEMENT LOCAL ---
        if (this.btnAddPrise && this.btnAddPrise.parentNode) {
            const btnProvision = document.createElement("button");
            btnProvision.textContent = "ðŸš€ Config. Initiale (Local)";
            btnProvision.className = "btn-primary";
            btnProvision.style.marginLeft = "10px";
            btnProvision.style.backgroundColor = "#8e44ad"; // Couleur violette pour le diffÃ©rencier
            btnProvision.style.border = "none";
            
            this.btnAddPrise.parentNode.insertBefore(btnProvision, this.btnAddPrise.nextSibling);
            btnProvision.addEventListener("click", () => this.provisionLocalPlug());
        }

        this.btnAddPrise.addEventListener("click", async () => {
            const { value: nom } = await Swal.fire({
                title: 'Ajouter une prise',
                input: 'text',
                inputLabel: 'Identifiant de la prise (ex: Prise1)',
                showCancelButton: true,
                inputValidator: (value) => {
                    if (!value) return 'Veuillez entrer un identifiant !'
                }
            });
            if (nom) {
                this.addPrise(nom);
            }
        })

        // Gestion du bouton Supprimer
        if (this.btnDeletePrise) {
            this.btnDeletePrise.addEventListener("click", () => {
                if (this.selectedPrise) {
                    this.deletePrise(this.selectedPrise);
                } else {
                    Swal.fire('Attention', 'Veuillez sÃ©lectionner une prise dans la liste.', 'warning');
                }
            });
        }

        // Gestion du clic sur le nom d'utilisateur pour le sÃ©lectionner dans la liste
        if (this.tableBody) {
            this.tableBody.addEventListener("click", (e) => {
                if (e.target.classList.contains("clickable-username")) {
                    e.stopPropagation(); // Ã‰vite de sÃ©lectionner la ligne de la prise
                    const username = e.target.dataset.username;
                    this.selectUserInDashboard(username);
                }
            });
        }

        this.loadPrises()
    }

    // Fonction qui recherche l'utilisateur dans la liste et dÃ©clenche son graphique
    selectUserInDashboard(username) {
        const userItems = document.querySelectorAll("#userList li");
        let found = false;
        
        for (let li of userItems) {
            if (li.dataset.username === username) {
                // Si l'utilisateur est masquÃ© par une recherche, on rÃ©initialise le champ de recherche
                const searchInput = document.querySelector(".search-bar input");
                if (searchInput && li.style.display === "none") {
                    searchInput.value = "";
                    this.userManager.applySearchFilter();
                }

                li.click(); // DÃ©clenche le clic (qui charge le graph via UserManager)
                li.scrollIntoView({ behavior: 'smooth', block: 'center' }); // Fait dÃ©filer la liste jusqu'Ã  lui
                
                // Petit effet visuel (flash jaune court) pour attirer l'oeil de l'admin
                li.style.backgroundColor = "#ffeaa7";
                setTimeout(() => { li.style.backgroundColor = "#d0eaff"; }, 500); // Revient au bleu "sÃ©lectionnÃ©"
                
                found = true;
                break;
            }
        }
        
        if (!found) {
            Swal.fire('Information', `L'utilisateur ${username} est introuvable dans la liste actuelle.`, 'info');
        }
    }

    // --- GESTION WEBSOCKETS (Temps rÃ©el) ---
    initSocket() {
        // On suppose que socket.io est chargÃ© globalement via le script HTML
        if (typeof io !== 'undefined') {
            if (!window.appSocket) {
                const socketUrl = this.apiUrl.replace('/api', '');
                window.appSocket = io(socketUrl, { transports: ['websocket', 'polling'] });
            }
            this.socket = window.appSocket;

            console.log("ðŸ“¡ Ã‰coute WebSocket initialisÃ©e pour les prises");
            
            // DEBUG : VÃ©rifier la connexion
            this.socket.on('connect', () => console.log("âœ… WebSocket connectÃ© avec ID:", this.socket.id));
            this.socket.on('connect_error', (err) => console.error("âŒ Erreur connexion WebSocket:", err));

            // ðŸ“¢ Ã‰COUTE ABSOLUE : Affiche TOUS les messages reÃ§us du serveur
            this.socket.onAny((eventName, ...args) => {
                console.log(`ðŸ“¥ [SOCKET REÃ‡U] Ã‰vÃ©nement: ${eventName}`, args);
            });

            // 1. Mise Ã  jour de la puissance ou de l'Ã©tat
            this.socket.on('power_update', (data) => this.updateRowUI(data.plugId, { power: data.power }));
            this.socket.on('voltage_update', (data) => this.updateRowUI(data.plugId, { voltage: data.voltage }));
            this.socket.on('state_update', (data) => this.updateRowUI(data.plugId, { state: data.state }));
            this.socket.on('status_update', (data) => {
                this.updateRowUI(data.plugId, { status: data.status, username: data.username });
            });

            // 1.5. Afficher la consommation en direct sur la ligne de la prise
            this.socket.on('live_consumption', (data) => {
                this.updateRowUI(data.plugId, { energyWh: data.energyWh, cost: data.cost, username: data.username });
            });
            
            // 2. Nouvelle prise dÃ©tectÃ©e
            this.socket.on('new_plug_added', () => {
                console.log("Nouvelle prise dÃ©tectÃ©e, rechargement...");
                this.loadPrises();
            });
        } else {
            console.warn("Socket.io non chargÃ©. Le temps rÃ©el est dÃ©sactivÃ©.");
        }
    }

    // --- NOUVELLE FONCTION : PROVISIONNEMENT LOCAL ---
    async provisionLocalPlug() {
        const { value: formValues } = await Swal.fire({
            title: 'Provisionnement Prise Neuve',
            width: '600px',
            html: `
                <div style="text-align: left; font-size: 0.9em;">
                    <div style="background-color: #fdf2e9; padding: 10px; border-radius: 5px; margin-bottom: 15px; border-left: 4px solid #e67e22;">
                        <span style="color:#d35400; font-weight:bold;">âš ï¸ Ã‰TAPE 1 :</span><br>
                        Connectez le Wi-Fi de cet ordinateur au rÃ©seau de la prise (ex: <i>ShellyPlusPlugS-XXXX</i>). Laissez ce tableau de bord ouvert.
                    </div>
                    
                    <h4 style="margin: 0 0 10px 0;">1. RÃ©seau Wi-Fi du LycÃ©e</h4>
                    <input id="swal-wifi-ssid" class="swal2-input" style="width: 85%; margin-top: 5px;" placeholder="Nom du Wi-Fi (SSID)">
                    <input id="swal-wifi-pass" type="password" class="swal2-input" style="width: 85%; margin-top: 5px;" placeholder="Mot de passe Wi-Fi">
                    
                    <h4 style="margin: 15px 0 10px 0;">2. Serveur MQTT</h4>
                    <input id="swal-mqtt-server" class="swal2-input" style="width: 85%; margin-top: 5px;" placeholder="Serveur (ex: broker.hivemq.com:1883)">
                    <input id="swal-mqtt-user" class="swal2-input" style="width: 85%; margin-top: 5px;" placeholder="Utilisateur (Optionnel)">
                    <input id="swal-mqtt-pass" type="password" class="swal2-input" style="width: 85%; margin-top: 5px;" placeholder="Mot de passe (Optionnel)">
                </div>
            `,
            focusConfirm: false,
            showCancelButton: true,
            confirmButtonText: 'ðŸš€ Envoyer Ã  la prise',
            cancelButtonText: 'Annuler',
            preConfirm: () => {
                const wifiSsid = document.getElementById('swal-wifi-ssid').value;
                const mqttServer = document.getElementById('swal-mqtt-server').value;
                if (!wifiSsid || !mqttServer) {
                    Swal.showValidationMessage('Le nom du Wi-Fi et le serveur MQTT sont obligatoires.');
                    return false;
                }
                return {
                    wifiSsid,
                    wifiPass: document.getElementById('swal-wifi-pass').value,
                    mqttServer,
                    mqttUser: document.getElementById('swal-mqtt-user').value,
                    mqttPass: document.getElementById('swal-mqtt-pass').value
                };
            }
        });

        if (formValues) {
            try {
                Swal.fire({ title: 'Configuration en cours...', text: 'Envoi des donnÃ©es vers 192.168.33.1...', allowOutsideClick: false, didOpen: () => Swal.showLoading() });

                // 1. Envoi configuration MQTT (On le fait en premier avant que le Wi-Fi ne coupe la connexion)
                await fetch('http://192.168.33.1/rpc/Mqtt.SetConfig', {
                    method: 'POST',
                    mode: 'no-cors', // EmpÃªche le navigateur de bloquer la requÃªte pour des raisons de CORS
                    body: JSON.stringify({
                        config: { server: formValues.mqttServer, user: formValues.mqttUser, pass: formValues.mqttPass, enable: true }
                    })
                });

                // 2. Envoi configuration Wi-Fi
                // On n'attend pas la rÃ©ponse finale (await) car la prise va redÃ©marrer son antenne Wi-Fi et couper notre connexion
                fetch('http://192.168.33.1/rpc/Wifi.SetConfig', {
                    method: 'POST',
                    mode: 'no-cors',
                    body: JSON.stringify({
                        config: { sta1: { ssid: formValues.wifiSsid, pass: formValues.wifiPass, enable: true } }
                    })
                }).catch(() => {}); 

                Swal.fire({
                    icon: 'success',
                    title: 'Configuration envoyÃ©e !',
                    text: "La prise va redÃ©marrer. Veuillez reconnecter votre ordinateur au Wi-Fi habituel. DÃ¨s que la prise aura accÃ¨s Ã  Internet, elle apparaÃ®tra toute seule dans cette liste !"
                });
            } catch (e) {
                console.error("Erreur de communication avec la prise:", e);
                
                // Plan B : Le navigateur bloque l'envoi, on donne un bouton pour le faire manuellement
                Swal.fire({
                    icon: 'warning',
                    title: 'Configuration auto bloquÃ©e',
                    html: `
                        <p style="text-align:left; font-size: 0.9em; margin-bottom:10px;">Votre navigateur (ou un cÃ¢ble rÃ©seau) bloque l'envoi automatique. <b>Ne vous inquiÃ©tez pas, vous pouvez le faire en un clic :</b></p>
                        <div style="background: #f8f9fa; padding: 15px; border-radius: 5px; text-align: left; font-size: 0.9em; border-left: 4px solid #3498db;">
                            <b>1.</b> Cliquez sur le bouton ci-dessous pour ouvrir la prise.<br><br>
                            <b>2.</b> Dans le menu <b>Wi-Fi</b>, connectez la prise au rÃ©seau : <b style="color:#d35400;">${formValues.wifiSsid}</b><br><br>
                            <b>3.</b> Dans le menu <b>MQTT</b>, ajoutez le serveur : <b style="color:#d35400;">${formValues.mqttServer}</b>
                        </div>
                    `,
                    showCancelButton: true,
                    confirmButtonText: 'ðŸŒ Ouvrir l\'interface de la prise',
                    confirmButtonColor: '#3498db',
                    cancelButtonText: 'Annuler'
                }).then((result) => {
                    if (result.isConfirmed) {
                        // Ouvre la page de la prise directement dans un nouvel onglet
                        window.open('http://192.168.33.1', '_blank');
                    }
                });
            }
        }
    }

    // Met Ã  jour une ligne spÃ©cifique sans tout recharger
    updateRowUI(plugId, data) {
        const row = document.getElementById(`row-${plugId}`);
        if (row) {
            const cellState = row.querySelector(".state-cell");
            
            // 1. Mise Ã  jour des donnÃ©es en mÃ©moire (data-attributes)
            if (data.state !== undefined) row.dataset.state = data.state;
            if (data.power !== undefined) row.dataset.power = data.power;
            if (data.voltage !== undefined) row.dataset.voltage = data.voltage;
            if (data.status !== undefined) row.dataset.status = data.status;
            if (data.energyWh !== undefined) row.dataset.energyWh = data.energyWh;
            if (data.cost !== undefined) row.dataset.cost = data.cost;
            if (data.username !== undefined) row.dataset.username = data.username;

            // RÃ©initialiser l'Ã©nergie et le coÃ»t si la prise redevient libre ou en maintenance
            if (data.status === 'libre' || data.status === 'hs') {
                row.dataset.energyWh = 0;
                row.dataset.cost = 0;
                row.dataset.username = "";
            }

            // 2. RÃ©cupÃ©ration de l'Ã©tat actuel pour affichage
            // CORRECTION CRITIQUE : MySQL renvoie 1/0, le WebSocket renvoie true/false.
            const rawState = row.dataset.state;
            const currentState = rawState === "true" || rawState === true || rawState === "1" || rawState == 1;
            
            let currentPower = parseFloat(row.dataset.power);
            if (isNaN(currentPower)) currentPower = 0;
            
            const currentVoltage = parseFloat(row.dataset.voltage) || 0;
            const currentEnergy = parseFloat(row.dataset.energyWh) || 0;
            const currentCost = parseFloat(row.dataset.cost) || 0;
            const currentUsername = row.dataset.username || "";
            
            if (cellState) {
                // 3. Construction du texte d'Ã©tat
                const textState = currentState ? "âš¡ ALLUMÃ‰E" : "Ã‰TEINTE";
                const rawStatus = row.dataset.status || "Inconnu";
                
                // Traduction propre pour l'affichage
                let displayStatus = rawStatus === 'occupied' ? "OccupÃ©e" : (rawStatus === 'libre' ? "Libre" : (rawStatus === 'hs' ? "ðŸ”´ Maintenance" : rawStatus));
                let htmlContent = "";

                if (rawStatus === 'occupied' && currentUsername) {
                    // On remplace le texte simple par un span cliquable (lien bleu soulignÃ©)
                    const sanitizedUsername = this.sanitizer(currentUsername);
                    htmlContent = `OccupÃ©e par <span class="clickable-username" data-username="${sanitizedUsername}" style="color: #ffffff !important; background-color: #3498db; padding: 3px 10px; border-radius: 12px; cursor: pointer; font-size: 0.9em; font-weight: bold; display: inline-block; margin: 0 5px; box-shadow: 0 1px 3px rgba(0,0,0,0.2);" title="Cliquer pour voir l'historique de ${sanitizedUsername}">${sanitizedUsername}</span> (${textState})`;
                } else {
                    htmlContent = `${displayStatus} (${textState})`;
                }
                
                // Si on a la tension (voltage), on l'ajoute Ã  l'affichage
                if (currentState && currentVoltage > 0) {
                    htmlContent += ` (${currentVoltage} V)`;
                }

                // Si c'est allumÃ©, on affiche la puissance mÃªme si elle est Ã  0W (Ã©vite null W ou 0WW)
                if (currentState && currentPower >= 0) {
                    htmlContent += ` - ${currentPower} W`;
                }
                
                // Si la prise est occupÃ©e, on ajoute l'Ã©nergie et le coÃ»t accumulÃ©s
                if (rawStatus === 'occupied' && currentEnergy > 0) {
                    htmlContent += ` | ðŸ“ˆ ${currentEnergy.toFixed(1)} Wh`;
                }

                cellState.innerHTML = htmlContent;
                
                // Changement de couleur dynamique
                cellState.style.color = currentState ? "#27ae60" : "#7f8c8d";
                cellState.style.fontWeight = currentState ? "bold" : "normal";

                // Mise Ã  jour de l'icÃ´ne/texte du bouton maintenance
                const btnMaint = row.querySelector(".btn-maint");
                if (btnMaint) {
                    btnMaint.textContent = rawStatus === 'hs' ? "âœ… RÃ©tablir" : "ðŸ”§ Maint.";
                }

                // Mise Ã  jour de la visibilitÃ© du bouton Stop
                const btnStop = row.querySelector(".btn-stop");
                if (btnStop) {
                    btnStop.style.display = rawStatus === 'occupied' ? "inline-block" : "none";
                }
            }
        }
    }

    async loadPrises() {
        // S'assurer qu'on est connectÃ© avant de charger les prises (Route protÃ©gÃ©e)
        if (!this.userManager.token) {
            const logged = await this.userManager.loginAdmin();
            if (!logged) return; // Si l'utilisateur annule, on arrÃªte
        }

        try {
            // ROUTE API : RECUPERER LES PRISES
            const response = await fetch(`${this.apiUrl}/plugs`, {
                headers: {
                    "Authorization": `Bearer ${this.userManager.token}`
                }
            })
            const data = await response.json()
            
            if (Array.isArray(data)) {
                this.prises = data
                this.render()
            } else {
                console.error("Format de donnÃ©es invalide reÃ§u pour les prises:", data);
            }
        } catch (error) {
            console.error("Erreur chargement prises :", error)
        }
    }

    async addPrise(nom) {
        // On s'assure d'Ãªtre connectÃ©
        if (!this.userManager.token) await this.userManager.loginAdmin();

        try {
            // ROUTE API : AJOUTER UNE PRISE
            const response = await fetch(`${this.apiUrl}/plugs`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "Authorization": `Bearer ${this.userManager.token}`
                },
                // L'API attend "plugId"
                body: JSON.stringify({ plugId: nom })
            })

            if (response.ok) {
                Swal.fire('SuccÃ¨s !', 'Prise ajoutÃ©e !', 'success');
                this.loadPrises(); // Recharger la liste
            } else {
                Swal.fire('Erreur', "Erreur lors de l'ajout (ID dÃ©jÃ  existant ?)", 'error');
            }
        } catch (error) {
            console.error("Erreur ajout prise :", error)
        }
    }

    async toggleMaintenance(plugId) {
        if (!this.userManager.token) {
            const logged = await this.userManager.loginAdmin();
            if (!logged) return;
        }

        try {
            // Ajout d'un visuel de chargement pendant la requÃªte
            Swal.fire({
                title: 'Changement d\'Ã©tat...',
                allowOutsideClick: false,
                didOpen: () => Swal.showLoading()
            });

            const response = await fetch(`${this.apiUrl}/plugs/${plugId}/maintenance`, {
                method: "POST",
                headers: { "Authorization": `Bearer ${this.userManager.token}` }
            });

            if (response.ok) {
                Swal.close(); // SuccÃ¨s : l'UI sera mise Ã  jour via le WebSocket
            } else {
                // SÃ©curisation : si la rÃ©ponse n'est pas du JSON (ex: erreur 404)
                const data = await response.json().catch(() => ({})); 
                Swal.fire('Erreur', data.error || `Erreur serveur (${response.status}). La route API existe-t-elle ?`, 'error');
            }
        } catch (error) {
            console.error("Erreur maintenance :", error);
            Swal.fire('Erreur rÃ©seau', "Impossible de joindre le serveur.", 'error');
        }
    }

    async forceStop(plugId) {
        const result = await Swal.fire({
            title: 'Forcer l\'arrÃªt ?',
            text: `Voulez-vous vraiment arrÃªter la session sur la prise ${plugId} ? L'utilisateur en cours sera facturÃ©.`,
            icon: 'warning',
            showCancelButton: true,
            confirmButtonColor: '#d33',
            confirmButtonText: 'Oui, arrÃªter'
        });

        if (!result.isConfirmed) return;

        if (!this.userManager.token) {
            const logged = await this.userManager.loginAdmin();
            if (!logged) return;
        }

        try {
            Swal.fire({
                title: 'ArrÃªt en cours...',
                allowOutsideClick: false,
                didOpen: () => Swal.showLoading()
            });

            const response = await fetch(`${this.apiUrl}/plugs/${plugId}/force-stop`, {
                method: "POST",
                headers: { "Authorization": `Bearer ${this.userManager.token}` }
            });

            if (response.ok) {
                Swal.fire('SuccÃ¨s !', 'La session a Ã©tÃ© arrÃªtÃ©e proprement.', 'success');
            } else {
                const data = await response.json().catch(() => ({})); 
                Swal.fire('Erreur', data.error || `Erreur serveur (${response.status}).`, 'error');
            }
        } catch (error) {
            console.error("Erreur force-stop :", error);
            Swal.fire('Erreur rÃ©seau', "Impossible de joindre le serveur.", 'error');
        }
    }

    async deletePrise(plugId) {
        const result = await Swal.fire({
            title: 'ÃŠtes-vous sÃ»r ?',
            text: `Voulez-vous vraiment supprimer la prise ${plugId} ?`,
            icon: 'warning',
            showCancelButton: true,
            confirmButtonColor: '#d33',
            confirmButtonText: 'Oui, supprimer'
        });
        if (!result.isConfirmed) return;

        // On s'assure d'Ãªtre connectÃ©
        if (!this.userManager.token) await this.userManager.loginAdmin();

        try {
            const response = await fetch(`${this.apiUrl}/plugs/${plugId}`, {
                method: "DELETE",
                headers: { "Authorization": `Bearer ${this.userManager.token}` }
            });

            const data = await response.json();
            if (response.ok) {
                this.selectedPrise = null; // Reset sÃ©lection
                this.loadPrises(); // Recharger la liste
            } else {
                Swal.fire('Erreur', data.error || "Impossible de supprimer.", 'error');
            }
        } catch (error) {
            console.error("Erreur suppression prise :", error);
        }
    }

    async openSettings(plugId) {
        if (!this.userManager.token) await this.userManager.loginAdmin();

        Swal.fire({
            title: `ParamÃ¨tres - ${plugId}`,
            html: `
                <div style="text-align: left; margin-top: 15px;">
                    <label for="power-limit"><b>Limite de sÃ©curitÃ© (Watts) :</b></label>
                    <input type="number" id="power-limit" class="swal2-input" placeholder="Ex: 2500" style="margin-top:5px; width: 90%;">
                    <small style="color: #7f8c8d; display: block; margin-top: 5px;">La prise se coupera automatiquement si un appareil dÃ©passe cette puissance.</small>
                </div>
                <div style="margin-top: 25px; border-top: 1px solid #eee; padding-top: 20px;">
                    <button id="btn-reboot-plug" style="width: 100%; background-color:#e67e22; border:none; padding:12px; color:white; font-weight:bold; border-radius:5px; cursor:pointer;">ðŸ”„ RedÃ©marrer physiquement la prise</button>
                </div>
            `,
            showCancelButton: true,
            confirmButtonText: 'ðŸ’¾ Sauvegarder',
            cancelButtonText: 'Annuler',
            didOpen: () => {
                document.getElementById('btn-reboot-plug').addEventListener('click', async () => {
                    const conf = await Swal.fire({
                        title: 'RedÃ©marrer ?',
                        text: 'La prise va se couper et redÃ©marrer (15 secondes).',
                        icon: 'warning',
                        showCancelButton: true,
                        confirmButtonColor: '#e67e22',
                        confirmButtonText: 'Oui, redÃ©marrer'
                    });
                    if (conf.isConfirmed) {
                        try {
                            await fetch(`${this.apiUrl}/plugs/${plugId}/reboot`, { method: 'POST', headers: { "Authorization": `Bearer ${this.userManager.token}` } });
                            Swal.fire('SuccÃ¨s', 'Ordre de redÃ©marrage envoyÃ©.', 'success');
                        } catch(e) { Swal.fire('Erreur', 'Erreur rÃ©seau.', 'error'); }
                    }
                });
            },
            preConfirm: () => {
                return document.getElementById('power-limit').value;
            }
        }).then(async (result) => {
            if (result.isConfirmed && result.value) {
                try {
                    const response = await fetch(`${this.apiUrl}/plugs/${plugId}/configure`, {
                        method: "POST",
                        headers: { "Content-Type": "application/json", "Authorization": `Bearer ${this.userManager.token}` },
                        body: JSON.stringify({ powerLimit: result.value })
                    });
                    if (response.ok) Swal.fire('SuccÃ¨s', 'Limite de puissance enregistrÃ©e !', 'success');
                    else Swal.fire('Erreur', 'Impossible de modifier la prise.', 'error');
                } catch (e) { Swal.fire('Erreur', 'Erreur rÃ©seau.', 'error'); }
            }
        });
    }

    render() {
        this.tableBody.innerHTML = ""

        this.prises.forEach(prise => {

            const tr = document.createElement("tr")
            // Ajout d'un ID unique et de data-attributes pour le WebSocket
            tr.id = `row-${prise.id}`;
            tr.dataset.status = prise.status;
            tr.dataset.state = prise.state; // Pour le suivi WebSocket
            tr.dataset.power = 0; // Init Ã  0
            tr.dataset.energyWh = 0;
            tr.dataset.cost = 0;
            tr.dataset.username = prise.username || "";

            // Gestion de la sÃ©lection (Click sur la ligne)
            tr.style.cursor = "pointer";
            tr.addEventListener("click", () => {
                // Retirer la surbrillance des autres
                document.querySelectorAll("#priseTableBody tr").forEach(row => row.style.backgroundColor = "");
                // SÃ©lectionner celle-ci
                tr.style.backgroundColor = "#d0eaff";
                this.selectedPrise = prise.id;
            });

            // Colonne ID
            const tdNom = document.createElement("td")
            tdNom.textContent = prise.id

            // Colonne Ã‰tat
            const tdEtat = document.createElement("td")
            tdEtat.className = "state-cell"; // Classe pour ciblage facile
            // On affiche le status (libre/occupied) et l'Ã©tat Ã©lectrique (ALLUMÃ‰E/Ã‰TEINTE)
            let displayStatus = prise.status === 'occupied' ? "OccupÃ©e" : (prise.status === 'libre' ? "Libre" : (prise.status === 'hs' ? "ðŸ”´ Maintenance" : prise.status));
            const elecState = prise.state ? "âš¡ ALLUMÃ‰E" : "Ã‰TEINTE";
            
            if (prise.status === 'occupied' && tr.dataset.username) {
                const sanitizedUsername = this.sanitizer(tr.dataset.username);
                tdEtat.innerHTML = `OccupÃ©e par <span class="clickable-username" data-username="${sanitizedUsername}" style="color: #ffffff !important; background-color: #3498db; padding: 3px 10px; border-radius: 12px; cursor: pointer; font-size: 0.9em; font-weight: bold; display: inline-block; margin: 0 5px; box-shadow: 0 1px 3px rgba(0,0,0,0.2);" title="Cliquer pour voir l'historique de ${sanitizedUsername}">${sanitizedUsername}</span> (${elecState})`;
            } else {
                tdEtat.textContent = `${displayStatus} (${elecState})`;
            }
            
            if(prise.state) {
                tdEtat.style.color = "#27ae60";
                tdEtat.style.fontWeight = "bold";
            }
            
            // Colonne Actions (QR Code)
            const tdAction = document.createElement("td")
            const btnQr = document.createElement("button")
            btnQr.textContent = "ðŸ–¨ï¸ QR";
            btnQr.className = "btn-qr"; // Pour le CSS si besoin
            btnQr.onclick = (e) => {
                e.stopPropagation();
                // Ouvre une fenÃªtre d'impression propre avec le QR Code
                const url = `${this.apiUrl}/plugs/${prise.id}/qrcode`;
                const printWindow = window.open('', '_blank', 'width=500,height=600');
                if (printWindow) {
                    printWindow.document.write(`
                        <html>
                            <head><title>QR Code - ${this.sanitizer(prise.id)}</title></head>
                            <body style="text-align:center; font-family:sans-serif; margin-top:50px;">
                                <h1>Prise : ${this.sanitizer(prise.id)}</h1>
                                <img src="${url}" style="width:300px; height:300px; border:2px solid #333;" onload="window.print();">
                                <p>Scannez ce code pour dÃ©marrer la recharge.</p>
                            </body>
                        </html>
                    `);
                    printWindow.document.close();
                }
            };
            tdAction.appendChild(btnQr);
            
            // Bouton de maintenance
            const btnMaint = document.createElement("button");
            btnMaint.textContent = prise.status === 'hs' ? "âœ… RÃ©tablir" : "ðŸ”§ Maint.";
            btnMaint.className = "btn-maint"; 
            btnMaint.style.marginLeft = "10px";
            btnMaint.onclick = (e) => {
                e.stopPropagation();
                this.toggleMaintenance(prise.id);
            };
            tdAction.appendChild(btnMaint);
            
            // Bouton de Forcer l'arrÃªt (visible uniquement si occupÃ©e)
            const btnStop = document.createElement("button");
            btnStop.textContent = "ðŸ›‘ Stop";
            btnStop.className = "btn-stop";
            btnStop.style.marginLeft = "10px";
            btnStop.style.display = prise.status === 'occupied' ? "inline-block" : "none";
            btnStop.onclick = (e) => {
                e.stopPropagation();
                this.forceStop(prise.id);
            };
            tdAction.appendChild(btnStop);
            
            // Bouton de ParamÃ¨tres
            const btnSettings = document.createElement("button");
            btnSettings.textContent = "âš™ï¸ ParamÃ¨tres";
            btnSettings.className = "btn-settings";
            btnSettings.style.marginLeft = "10px";
            btnSettings.onclick = (e) => {
                e.stopPropagation();
                this.openSettings(prise.id);
            };
            tdAction.appendChild(btnSettings);

            tr.appendChild(tdNom)
            tr.appendChild(tdEtat)
            tr.appendChild(tdAction)

            this.tableBody.appendChild(tr)
        })
    }
}

//instanciation
document.addEventListener("DOMContentLoaded", () => {
    // On passe l'URL et l'instance userManager existante (crÃ©Ã©e dans UserManager.js)
    // Assure-toi que userManager est accessible globalement ou passÃ© ici
    if (typeof userManager !== 'undefined') {
        new PriseManager("https://recharge.cielnewton.fr/api", userManager);
    } else {
        console.error("UserManager non trouvÃ©. L'ordre des scripts dans index.html est important.");
    }
})