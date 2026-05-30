class UserManager {
    constructor(apiUrl) {
        this.apiUrl = apiUrl;
        this.token = null; // Stockera le Master Token Admin
        this.sanitizer = (str) => {
            if (!str) return '';
            const temp = document.createElement('div');
            temp.textContent = str;
            return temp.innerHTML;
        };
        this.selectedUserId = null; // ID de l'utilisateur sÃ©lectionnÃ©
        
        // SÃ‰CURITÃ‰ DOM : On attend que la page soit chargÃ©e pour attacher les Ã©vÃ©nements
        if (document.readyState === "loading") {
            document.addEventListener("DOMContentLoaded", () => {
                this.initDeleteButton();
                this.initSearch();
                this.initSocket();
                this.initPendingRequestsUI(); // <-- NOUVEAU
            });
        } else {
            this.initDeleteButton();
            this.initSearch();
            this.initSocket();
            this.initPendingRequestsUI(); // <-- NOUVEAU
        }
    }

    initSocket() {
        if (typeof io !== 'undefined') {
            if (!window.appSocket) {
                const socketUrl = this.apiUrl.replace('/api', '');
                window.appSocket = io(socketUrl, { transports: ['websocket', 'polling'] });
            }
            this.socket = window.appSocket;
            
            // Mettre Ã  jour le solde en direct dans la liste des utilisateurs
            this.socket.on('live_consumption', (data) => {
                const userRow = document.querySelector(`#userList li[data-id='${data.userId}']`);
                if (userRow) {
                    const balanceSpan = userRow.querySelector('.user-balance');
                    if (balanceSpan && data.newBalance !== undefined) {
                        // Petite animation visuelle de consommation
                        balanceSpan.textContent = data.newBalance.toFixed(2);
                        balanceSpan.style.color = "#e74c3c"; // Passe en rouge
                        setTimeout(() => balanceSpan.style.color = "", 500); // Revient Ã  la normale
                    }
                }
            });

            // NOUVEAU: RafraÃ®chissement complet (crÃ©ation, suppression, recharge PayPal, arrÃªt charge)
            this.socket.on('user_data_updated', () => {
                this.fetchAllUsers();
            });

            // NOUVEAU: Alertes Salles d'attente
            this.socket.on('new_registration_request', (data) => {
                Swal.fire({
                    toast: true, position: 'top-end', icon: 'info',
                    title: `Nouvelle demande : ${data.username}`,
                    showConfirmButton: false, timer: 5000
                });
                this.fetchPendingRequests(true); // Met Ã  jour la pastille rouge
            });

            this.socket.on('registration_request_handled', () => {
                this.fetchPendingRequests(true);
            });
        }
    }

    // Connexion automatique pour rÃ©cupÃ©rer le token Admin
    async loginAdmin() {
        // SÃ‰CURITÃ‰ : On demande les identifiants Ã  l'utilisateur au lieu de les lire en dur
        const { value: formValues } = await Swal.fire({
            title: 'Authentification Admin Requise',
            html:
                '<input id="login-email" class="swal2-input" placeholder="Email Admin">' +
                '<input id="login-pass" type="password" class="swal2-input" placeholder="Mot de passe">',
            focusConfirm: false,
            preConfirm: () => {
                return {
                    email: document.getElementById('login-email').value,
                    password: document.getElementById('login-pass').value
                };
            }
        });

        if (!formValues) return false; // L'utilisateur a annulÃ©

        try {
            const response = await fetch(`${this.apiUrl}/auth/login`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(formValues)
            });
            const data = await response.json();
            
            if (response.ok && data.token) {
                this.token = data.token;
                console.log("âœ… Dashboard connectÃ© en tant qu'Admin.");
                this.fetchAllUsers(); // <--- Une fois connectÃ©, on charge la liste
                this.fetchPendingRequests(true); // <--- Charge la cloche de notification
                return true;
            }
            return false;
        } catch (error) {
            console.error("Erreur connexion admin:", error);
            return false;
        }
    }

    // RÃ©cupÃ©rer tous les utilisateurs depuis la BDD
    async fetchAllUsers() {
        try {
            const response = await fetch(`${this.apiUrl}/auth/users`, {
                method: "GET",
                headers: { 
                    "Authorization": `Bearer ${this.token}`
                }
            });
            
            if (response.ok) {
                const users = await response.json();
                const userList = document.getElementById("userList");
                if(userList) {
                    userList.innerHTML = ""; // On vide la liste actuelle
                    users.forEach(user => {
                        if (user.username === 'Admin') return; // Masquer l'utilisateur Admin
                        this.addUserToDashboard(user.id, user.username, user.balance);
                    });
                    // On rÃ©applique le filtre de recherche s'il y en avait un
                    this.applySearchFilter();
                }
            }
        } catch (error) {
            console.error("Erreur chargement utilisateurs:", error);
        }
    }

    applySearchFilter() {
        const searchInput = document.querySelector(".search-bar input");
        if (searchInput) {
            const term = searchInput.value.toLowerCase();
            const items = document.querySelectorAll("#userList li");
            
            items.forEach(li => {
                const username = li.dataset.username.toLowerCase();
                if (username.includes(term)) {
                    li.style.display = "";
                } else {
                    li.style.display = "none";
                }
            });
        }
    }

    initSearch() {
        const searchInput = document.querySelector(".search-bar input");
        if (searchInput) {
            searchInput.addEventListener("input", () => this.applySearchFilter());
        }
    }

    initDeleteButton() {
        this.btnDeleteUser = document.getElementById("btnDeleteUser");
        if (this.btnDeleteUser) {
            this.btnDeleteUser.addEventListener("click", async () => {
                if (!this.selectedUserId) {
                    Swal.fire('Attention', 'Veuillez sÃ©lectionner un utilisateur Ã  supprimer.', 'warning');
                    return;
                }

                const confirm = await Swal.fire({
                    title: 'ÃŠtes-vous sÃ»r ?',
                    text: "Cette action est irrÃ©versible !",
                    icon: 'warning',
                    showCancelButton: true,
                    confirmButtonColor: '#d33',
                    confirmButtonText: 'Oui, supprimer'
                });

                if (confirm.isConfirmed) {
                    await this.deleteUser(this.selectedUserId);
                }
            });
        }
    }

    async deleteUser(userId) {
        try {
            const response = await fetch(`${this.apiUrl}/auth/users/${userId}`, {
                method: "DELETE",
                headers: { "Authorization": `Bearer ${this.token}` }
            });

            if (response.ok) {
                Swal.fire('SupprimÃ© !', 'L\'utilisateur a Ã©tÃ© supprimÃ©.', 'success');
                this.selectedUserId = null;
                this.fetchAllUsers(); // RafraÃ®chir la liste
            } else {
                let message;
                try {
                    // On parse la rÃ©ponse de l'API pour rÃ©cupÃ©rer les donnÃ©es de l'erreur
                    const errorData = await response.json();
                    message = errorData.message || "Erreur lors de la suppression";
                } catch (e) {
                    // Si l'API renvoie du texte brut ou rien du tout, on tombe ici et on garde le message par dÃ©faut
                    console.error("Erreur lors de la lecture de la rÃ©ponse de l'API", e);
                }

                // On affiche l'erreur dans SweetAlert
                Swal.fire('Erreur', message, 'error');
            }
        } catch (error) {
            console.error("Erreur suppression:", error);
        }
    }

    async registerUser(firstName, lastName, email, password, creditAmount) {
        // 1. Si on n'a pas de token, on se connecte d'abord
        if (!this.token) await this.loginAdmin();

        const username = firstName + " " + lastName;
        const payload = { username, email, password, balance: creditAmount };

        try {
            const response = await fetch(`${this.apiUrl}/auth/register`, {
                method: "POST",
                headers: { 
                    "Content-Type": "application/json",
                    "Authorization": `Bearer ${this.token}` // Ajout du token d'autorisation
                },
                body: JSON.stringify(payload)
            });

            const data = await response.json();

            if (!response.ok) {
                return { success: false, message: data.message || "Erreur lors de l'inscription" };
            }

            return { success: true, data, firstName, lastName, creditAmount };
        } catch (error) {
            return { success: false, message: "Erreur rÃ©seau" };
        }
    }

    addUserToDashboard(id, username, creditAmount) {
        const userList = document.getElementById("userList");
        if (!userList) return;

        const li = document.createElement("li");
        li.dataset.id = id;
        li.dataset.username = username; // Pour le Graph
        
        // Structure flexbox pour aligner le bouton d'info Ã  droite
        li.innerHTML = `
            <div style="display: flex; justify-content: space-between; align-items: center; width: 100%;">
                <span><b>${this.sanitizer(username)}</b> - CrÃ©dit: <span class="user-balance">${parseFloat(creditAmount).toFixed(2)}</span>â‚¬</span>
                <div>
                    <button class="btn-edit-user" style="background: none; border: none; cursor: pointer; font-size: 1.2em; padding: 0; margin-left: 10px;" title="Modifier l'utilisateur">âœï¸</button>
                    <button class="btn-info-user" style="background: none; border: none; cursor: pointer; font-size: 1.2em; padding: 0; margin-left: 10px;" title="Voir les infos de l'utilisateur">â„¹ï¸</button>
                </div>
            </div>
        `;
        
        // Maintenir la sÃ©lection visuelle lors du rechargement en temps rÃ©el
        if (this.selectedUserId == id) {
            li.style.backgroundColor = "#d0eaff";
        }

        li.addEventListener("click", (e) => {
            // Si on a cliquÃ© sur le bouton info, on affiche la popup et on empÃªche la sÃ©lection de la ligne
            if (e.target.closest('.btn-info-user')) {
                e.stopPropagation();
                this.showUserDetails(id);
                return;
            }
            
            // Si on a cliquÃ© sur le bouton d'Ã©dition
            if (e.target.closest('.btn-edit-user')) {
                e.stopPropagation();
                this.editUserDetails(id);
                return;
            }

            // Gestion de la sÃ©lection visuelle
            document.querySelectorAll("#userList li").forEach(el => el.style.backgroundColor = "");
            li.style.backgroundColor = "#d0eaff";
            this.selectedUserId = id;
        });

        userList.appendChild(li);
    }

    // Ouvre une fenÃªtre pour modifier un utilisateur
    async editUserDetails(userId) {
        if (!this.token) await this.loginAdmin();
        try {
            Swal.fire({ title: 'Chargement...', allowOutsideClick: false, didOpen: () => Swal.showLoading() });
            
            // RÃ©cupÃ¨re les infos actuelles (via la route history)
            const response = await fetch(`${this.apiUrl}/auth/users/${userId}/history`, {
                headers: { "Authorization": `Bearer ${this.token}` }
            });
            if (!response.ok) throw new Error("Erreur de rÃ©cupÃ©ration");
            const data = await response.json();
            const user = data.user;

            const { value: formValues } = await Swal.fire({
                title: 'Modifier l\'utilisateur',
                html: `
                    <input id="edit-username" class="swal2-input" placeholder="Nom d'utilisateur" value="${this.sanitizer(user.username)}">
                    <input id="edit-email" type="email" class="swal2-input" placeholder="Email" value="${this.sanitizer(user.email)}">
                    <input id="edit-password" type="password" class="swal2-input" placeholder="Nouveau mot de passe (optionnel)">
                    <input id="edit-balance" type="number" step="0.01" class="swal2-input" placeholder="Solde (â‚¬)" value="${this.sanitizer(parseFloat(user.balance).toFixed(2))}">
                    <small style="color: #7f8c8d; display: block; margin-top: 5px;">Laissez le mot de passe vide pour ne pas le modifier.</small>
                `,
                focusConfirm: false,
                showCancelButton: true,
                confirmButtonText: 'ðŸ’¾ Sauvegarder',
                cancelButtonText: 'Annuler',
                preConfirm: () => {
                    const username = document.getElementById('edit-username').value;
                    const email = document.getElementById('edit-email').value;
                    const password = document.getElementById('edit-password').value;
                    const balance = parseFloat(document.getElementById('edit-balance').value);
                    
                    if (!username || !email || isNaN(balance)) {
                        Swal.showValidationMessage('Veuillez remplir le nom, l\'email et le solde.');
                        return false;
                    }
                    if (balance < 0 || balance > 100) {
                        Swal.showValidationMessage('Le solde doit Ãªtre compris entre 0â‚¬ et 100â‚¬.');
                        return false;
                    }
                    return { username, email, password, balance };
                }
            });

            if (formValues) {
                Swal.fire({ title: 'Sauvegarde...', allowOutsideClick: false, didOpen: () => Swal.showLoading() });
                const updateResponse = await fetch(`${this.apiUrl}/auth/users/${userId}`, {
                    method: "PUT",
                    headers: { "Content-Type": "application/json", "Authorization": `Bearer ${this.token}` },
                    body: JSON.stringify(formValues)
                });
                const updateData = await updateResponse.json();
                if (updateResponse.ok) {
                    Swal.fire('SuccÃ¨s', 'Utilisateur mis Ã  jour.', 'success');
                    // Le WebSocket rechargera la liste tout seul
                } else {
                    Swal.fire('Erreur', updateData.error || "Impossible de modifier l'utilisateur.", 'error');
                }
            }
        } catch (e) {
            Swal.fire('Erreur', 'Impossible de charger ou modifier les informations.', 'error');
        }
    }

    // Affiche une popup avec toutes les infos de l'utilisateur
    async showUserDetails(userId) {
        if (!this.token) await this.loginAdmin();
        try {
            Swal.fire({ title: 'Chargement des informations...', allowOutsideClick: false, didOpen: () => Swal.showLoading() });
            
            // On rÃ©utilise la route history qui renvoie maintenant aussi le profil et les transactions !
            const response = await fetch(`${this.apiUrl}/auth/users/${userId}/history`, {
                headers: { "Authorization": `Bearer ${this.token}` }
            });

            if (!response.ok) throw new Error("Erreur de rÃ©cupÃ©ration");
            
            const data = await response.json();
            const user = data.user;
            const transactions = data.transactions || [];

            const dateInscr = new Date(user.created_at).toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' });

            let trHtml = transactions.map(tx => {
                const dateTx = new Date(tx.created_at).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
                const color = tx.amount >= 0 ? '#27ae60' : '#e74c3c';
                const sign = tx.amount > 0 ? '+' : '';
                return `
                    <tr>
                        <td style="padding: 5px; border-bottom: 1px solid #eee; font-size: 0.9em;">${dateTx}</td>
                        <td style="padding: 5px; border-bottom: 1px solid #eee; font-size: 0.9em;">${this.sanitizer(tx.description || tx.type)}</td>
                        <td style="padding: 5px; border-bottom: 1px solid #eee; font-size: 0.9em; color: ${color}; font-weight: bold;">${sign}${parseFloat(tx.amount).toFixed(2)}â‚¬</td>
                    </tr>
                `;
            }).join('');

            if (transactions.length === 0) {
                trHtml = `<tr><td colspan="3" style="text-align: center; padding: 10px; color: #7f8c8d;">Aucune transaction rÃ©cente</td></tr>`;
            }

            Swal.fire({
                title: `Profil de ${this.sanitizer(user.username)}`,
                html: `
                    <div style="text-align: left; background: #f8f9fa; padding: 15px; border-radius: 8px; margin-bottom: 15px; font-size: 0.95em;">
                        <p style="margin: 5px 0;">ðŸ“§ <b>Email:</b> ${this.sanitizer(user.email)}</p>
                        <p style="margin: 5px 0;">ðŸ’° <b>Solde actuel:</b> <span style="color:#2980b9; font-weight:bold;">${this.sanitizer(parseFloat(user.balance).toFixed(2))}â‚¬</span></p>
                        <p style="margin: 5px 0;">ðŸ“… <b>Inscrit le:</b> ${this.sanitizer(dateInscr)}</p>
                        <p style="margin: 5px 0; color: #7f8c8d;">ðŸ”‘ <b>Mot de passe:</b> HachÃ© et sÃ©curisÃ© en BDD</p>
                    </div>
                    <h4 style="margin: 0 0 10px 0; text-align: left; border-bottom: 2px solid #3498db; display: inline-block;">DerniÃ¨res Transactions</h4>
                    <div style="max-height: 200px; overflow-y: auto; border: 1px solid #eee; border-radius: 5px;">
                        <table style="width: 100%; border-collapse: collapse; text-align: left;">
                            <thead style="background: #ecf0f1; position: sticky; top: 0;">
                                <tr>
                                    <th style="padding: 5px;">Date</th>
                                    <th style="padding: 5px;">Description</th>
                                    <th style="padding: 5px;">Montant</th>
                                </tr>
                            </thead>
                            <tbody>
                                ${trHtml}
                            </tbody>
                        </table>
                    </div>
                `,
                width: '600px',
                showConfirmButton: true,
                confirmButtonText: 'Fermer',
                confirmButtonColor: '#3498db'
            });

        } catch (e) {
            console.error(e);
            Swal.fire('Erreur', 'Impossible de charger les informations de l\'utilisateur.', 'error');
        }
    }

    // --- NOUVEAU : GESTION DES DEMANDES EN ATTENTE ---
    
    initPendingRequestsUI() {
        const bellBtn = document.getElementById('btnPendingRequests');
        if (bellBtn) {
            bellBtn.addEventListener('click', async () => {
                // Si l'admin n'est pas authentifiÃ©, on force la connexion
                if (!this.token) {
                    const logged = await this.loginAdmin();
                    if (!logged) return;
                }
                // On interroge la base de donnÃ©es en direct avant d'afficher la fenÃªtre
                this.fetchPendingRequests(false);
            });
        }
    }

    async fetchPendingRequests(silent = false) {
        if (!this.token) return;
        try {
            const response = await fetch(`${this.apiUrl}/auth/pending-requests`, {
                headers: { "Authorization": `Bearer ${this.token}` }
            });
            if (response.ok) {
                this.pendingRequests = await response.json();
                const badge = document.getElementById('reqBadge');
                if (badge) {
                    badge.textContent = this.pendingRequests.length;
                    badge.style.display = this.pendingRequests.length > 0 ? 'inline-block' : 'none';
                }
                if (!silent) this.showPendingRequestsModal();
            }
        } catch (e) {
            console.error("Erreur chargement des demandes:", e);
        }
    }

    async showPendingRequestsModal() {
        if (!this.pendingRequests || this.pendingRequests.length === 0) {
            Swal.fire('Info', 'Aucune demande de crÃ©ation de compte en attente.', 'info');
            return;
        }

        let html = '<ul style="list-style:none; padding:0; text-align:left;">';
        this.pendingRequests.forEach(req => {
            const dateStr = new Date(req.created_at).toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
            html += `
                <li style="margin-bottom: 10px; padding: 10px; border: 1px solid #ddd; border-radius: 8px; display: flex; justify-content: space-between; align-items: center; background:#f9f9f9;">
                    <div>
                        <strong style="color:#2c3e50; font-size:1.1em;">${this.sanitizer(req.username)}</strong><br/>
                        <span style="color:#7f8c8d; font-size:0.9em;">${this.sanitizer(req.email)}</span><br/>
                        <small style="color:#bdc3c7;">Le ${dateStr}</small>
                    </div>
                    <div>
                        <button onclick="userManager.approveRequest(${req.id}, '${this.sanitizer(req.username).replace(/'/g, "\\'")}')" style="background:#27ae60; color:white; border:none; padding:8px 12px; border-radius:5px; cursor:pointer; font-weight:bold; margin-right:5px;">âœ… Valider</button>
                        <button onclick="userManager.rejectRequest(${req.id}, '${this.sanitizer(req.username).replace(/'/g, "\\'")}')" style="background:#e74c3c; color:white; border:none; padding:8px 12px; border-radius:5px; cursor:pointer; font-weight:bold;">âŒ Refuser</button>
                    </div>
                </li>
            `;
        });
        html += '</ul>';

        Swal.fire({
            title: 'Salles d\'attente',
            html: html,
            width: '600px',
            showConfirmButton: true,
            confirmButtonText: 'Fermer',
            confirmButtonColor: '#3498db'
        });
    }

    async approveRequest(id, username) {
        Swal.close(); // Ferme la liste pour ouvrir la popup de validation
        
        const { value: initialBalance } = await Swal.fire({
            title: `Valider le compte de ${username}`,
            input: 'number',
            inputLabel: 'Attribuer un solde initial (â‚¬) :',
            inputValue: 67.00,
            showCancelButton: true,
            confirmButtonText: 'CrÃ©er le compte',
            cancelButtonText: 'Annuler',
            confirmButtonColor: '#27ae60',
            inputValidator: (value) => {
                if (!value || value < 0) return 'Veuillez entrer un montant valide.';
            }
        });

        if (initialBalance) {
            Swal.fire({ title: 'Validation...', allowOutsideClick: false, didOpen: () => Swal.showLoading() });
            try {
                const response = await fetch(`${this.apiUrl}/auth/pending-requests/${id}/approve`, {
                    method: 'POST',
                    headers: { 
                        "Content-Type": "application/json",
                        "Authorization": `Bearer ${this.token}`
                    },
                    body: JSON.stringify({ initialBalance: parseFloat(initialBalance) })
                });
                
                if (response.ok) {
                    Swal.fire('SuccÃ¨s !', 'L\'Ã©lÃ¨ve a Ã©tÃ© validÃ© et son compte est crÃ©Ã©.', 'success');
                } else {
                    const err = await response.json();
                    Swal.fire('Erreur', err.error || 'Erreur lors de la validation.', 'error');
                }
            } catch (e) {
                Swal.fire('Erreur', 'Erreur rÃ©seau.', 'error');
            }
        } else {
            // S'il annule, on rouvre la liste
            this.showPendingRequestsModal();
        }
    }

    async rejectRequest(id, username) {
        Swal.close();
        const confirm = await Swal.fire({
            title: 'Refuser la demande ?',
            text: `Rejeter et supprimer dÃ©finitivement l'inscription de ${username} ?`,
            icon: 'warning',
            showCancelButton: true,
            confirmButtonColor: '#e74c3c',
            confirmButtonText: 'Oui, refuser',
            cancelButtonText: 'Annuler'
        });

        if (confirm.isConfirmed) {
            try {
                const response = await fetch(`${this.apiUrl}/auth/pending-requests/${id}/reject`, {
                    method: 'DELETE',
                    headers: { "Authorization": `Bearer ${this.token}` }
                });
                
                if (response.ok) {
                    Swal.fire('RefusÃ©', 'La demande a Ã©tÃ© rejetÃ©e.', 'success');
                } else {
                    Swal.fire('Erreur', 'Erreur lors du rejet de la demande.', 'error');
                }
            } catch (e) {
                Swal.fire('Erreur', 'Erreur rÃ©seau.', 'error');
            }
        } else {
            this.showPendingRequestsModal();
        }
    }

    attachToForm(btnId) {
        const btn = document.getElementById(btnId);
        
        // SÃ©curitÃ© : Si le bouton n'existe pas sur cette page, on ne fait rien (Ã©vite de planter le script)
        if (!btn) return;

        btn.addEventListener("click", async () => {
            // Affiche une fenÃªtre "Prompt" version formulaire complet
            const { value: formValues } = await Swal.fire({
                title: 'Ajouter un utilisateur',
                html:
                    '<input id="swal-input1" class="swal2-input" placeholder="PrÃ©nom">' +
                    '<input id="swal-input2" class="swal2-input" placeholder="Nom">' +
                    '<input id="swal-input3" type="email" class="swal2-input" placeholder="Email">' +
                    '<input id="swal-input4" type="password" class="swal2-input" placeholder="Mot de passe">' +
                    '<input id="swal-input5" type="number" class="swal2-input" placeholder="CrÃ©dit initial">',
                focusConfirm: false,
                confirmButtonText: 'Enregistrer',
                showCancelButton: true,
                cancelButtonText: 'Annuler',
                preConfirm: () => {
                    const values = [
                        document.getElementById('swal-input1').value,
                        document.getElementById('swal-input2').value,
                        document.getElementById('swal-input3').value,
                        document.getElementById('swal-input4').value,
                        document.getElementById('swal-input5').value
                    ];
                    if (values.some(v => !v)) {
                        Swal.showValidationMessage('Veuillez remplir tous les champs');
                    }
                    return values;
                }
            });

            if (formValues) {
                const [firstName, lastName, email, password, creditAmount] = formValues;
                
                // Appel Ã  l'API
                const result = await this.registerUser(
                    firstName, 
                    lastName, 
                    email, 
                    password, 
                    parseFloat(creditAmount)
                );

                if (result.success) {
                    Swal.fire('SuccÃ¨s !', 'Utilisateur crÃ©Ã©.', 'success');
                    // On utilise l'ID retournÃ© par l'API (result.data.userId)
                    const username = `${firstName} ${lastName}`;
                    this.addUserToDashboard(result.data.userId, username, creditAmount);
                } else {
                    Swal.fire('Erreur', result.message, 'error');
                }
            }
        });
    }
}

const userManager = new UserManager("https://recharge.cielnewton.fr/api");

document.addEventListener("DOMContentLoaded", () => {
    userManager.attachToForm("btnAddUser");
});