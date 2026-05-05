class UserManager {
    constructor(apiUrl) {
        this.apiUrl = apiUrl;
        this.token = null; // Stockera le Master Token Admin
        this.selectedUserId = null; // ID de l'utilisateur sélectionné
        
        // SÉCURITÉ DOM : On attend que la page soit chargée pour attacher les événements
        if (document.readyState === "loading") {
            document.addEventListener("DOMContentLoaded", () => {
                this.initDeleteButton();
                this.initSearch();
                this.initSocket();
            });
        } else {
            this.initDeleteButton();
            this.initSearch();
            this.initSocket();
        }
    }

    initSocket() {
        if (typeof io !== 'undefined') {
            if (!window.appSocket) {
                const socketUrl = this.apiUrl.replace('/api', '');
                window.appSocket = io(socketUrl, { path: "/api/socket.io", transports: ['websocket', 'polling'] });
            }
            this.socket = window.appSocket;
            
            // Mettre à jour le solde en direct dans la liste des utilisateurs
            this.socket.on('live_consumption', (data) => {
                const userRow = document.querySelector(`#userList li[data-id='${data.userId}']`);
                if (userRow) {
                    const balanceSpan = userRow.querySelector('.user-balance');
                    if (balanceSpan && data.newBalance !== undefined) {
                        // Petite animation visuelle de consommation
                        balanceSpan.textContent = data.newBalance.toFixed(2);
                        balanceSpan.style.color = "#e74c3c"; // Passe en rouge
                        setTimeout(() => balanceSpan.style.color = "", 500); // Revient à la normale
                    }
                }
            });

            // NOUVEAU: Rafraîchissement complet (création, suppression, recharge PayPal, arrêt charge)
            this.socket.on('user_data_updated', () => {
                this.fetchAllUsers();
            });
        }
    }

    // Connexion automatique pour récupérer le token Admin
    async loginAdmin() {
        // SÉCURITÉ : On demande les identifiants à l'utilisateur au lieu de les lire en dur
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

        if (!formValues) return false; // L'utilisateur a annulé

        try {
            const response = await fetch(`${this.apiUrl}/auth/login`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(formValues)
            });
            const data = await response.json();
            
            if (response.ok && data.token) {
                this.token = data.token;
                console.log("✅ Dashboard connecté en tant qu'Admin.");
                this.fetchAllUsers(); // <--- Une fois connecté, on charge la liste
                return true;
            }
            return false;
        } catch (error) {
            console.error("Erreur connexion admin:", error);
            return false;
        }
    }

    // Récupérer tous les utilisateurs depuis la BDD
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
                    // On réapplique le filtre de recherche s'il y en avait un
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
                    Swal.fire('Attention', 'Veuillez sélectionner un utilisateur à supprimer.', 'warning');
                    return;
                }

                const confirm = await Swal.fire({
                    title: 'Êtes-vous sûr ?',
                    text: "Cette action est irréversible !",
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
                Swal.fire('Supprimé !', 'L\'utilisateur a été supprimé.', 'success');
                this.selectedUserId = null;
                this.fetchAllUsers(); // Rafraîchir la liste
            } else {
                let message;
                try {
                    // On parse la réponse de l'API pour récupérer les données de l'erreur
                    const errorData = await response.json();
                    message = errorData.message || "Erreur lors de la suppression";
                } catch (e) {
                    // Si l'API renvoie du texte brut ou rien du tout, on tombe ici et on garde le message par défaut
                    console.error("Erreur lors de la lecture de la réponse de l'API", e);
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
            return { success: false, message: "Erreur réseau" };
        }
    }

    addUserToDashboard(id, username, creditAmount) {
        const userList = document.getElementById("userList");
        if (!userList) return;

        const li = document.createElement("li");
        li.dataset.id = id;
        li.dataset.username = username; // Pour le Graph
        
        // Structure flexbox pour aligner le bouton d'info à droite
        li.innerHTML = `
            <div style="display: flex; justify-content: space-between; align-items: center; width: 100%;">
                <span><b>${username}</b> - Crédit: <span class="user-balance">${parseFloat(creditAmount).toFixed(2)}</span>€</span>
                <div>
                    <button class="btn-edit-user" style="background: none; border: none; cursor: pointer; font-size: 1.2em; padding: 0; margin-left: 10px;" title="Modifier l'utilisateur">✏️</button>
                    <button class="btn-info-user" style="background: none; border: none; cursor: pointer; font-size: 1.2em; padding: 0; margin-left: 10px;" title="Voir les infos de l'utilisateur">ℹ️</button>
                </div>
            </div>
        `;
        
        // Maintenir la sélection visuelle lors du rechargement en temps réel
        if (this.selectedUserId == id) {
            li.style.backgroundColor = "#d0eaff";
        }

        li.addEventListener("click", (e) => {
            // Si on a cliqué sur le bouton info, on affiche la popup et on empêche la sélection de la ligne
            if (e.target.closest('.btn-info-user')) {
                e.stopPropagation();
                this.showUserDetails(id);
                return;
            }
            
            // Si on a cliqué sur le bouton d'édition
            if (e.target.closest('.btn-edit-user')) {
                e.stopPropagation();
                this.editUserDetails(id);
                return;
            }

            // Gestion de la sélection visuelle
            document.querySelectorAll("#userList li").forEach(el => el.style.backgroundColor = "");
            li.style.backgroundColor = "#d0eaff";
            this.selectedUserId = id;
        });

        userList.appendChild(li);
    }

    // Ouvre une fenêtre pour modifier un utilisateur
    async editUserDetails(userId) {
        if (!this.token) await this.loginAdmin();
        try {
            Swal.fire({ title: 'Chargement...', allowOutsideClick: false, didOpen: () => Swal.showLoading() });
            
            // Récupère les infos actuelles (via la route history)
            const response = await fetch(`${this.apiUrl}/auth/users/${userId}/history`, {
                headers: { "Authorization": `Bearer ${this.token}` }
            });
            if (!response.ok) throw new Error("Erreur de récupération");
            const data = await response.json();
            const user = data.user;

            const { value: formValues } = await Swal.fire({
                title: 'Modifier l\'utilisateur',
                html: `
                    <input id="edit-username" class="swal2-input" placeholder="Nom d'utilisateur" value="${user.username}">
                    <input id="edit-email" type="email" class="swal2-input" placeholder="Email" value="${user.email}">
                    <input id="edit-password" type="password" class="swal2-input" placeholder="Nouveau mot de passe (optionnel)">
                    <input id="edit-balance" type="number" step="0.01" class="swal2-input" placeholder="Solde (€)" value="${parseFloat(user.balance).toFixed(2)}">
                    <small style="color: #7f8c8d; display: block; margin-top: 5px;">Laissez le mot de passe vide pour ne pas le modifier.</small>
                `,
                focusConfirm: false,
                showCancelButton: true,
                confirmButtonText: '💾 Sauvegarder',
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
                        Swal.showValidationMessage('Le solde doit être compris entre 0€ et 100€.');
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
                    Swal.fire('Succès', 'Utilisateur mis à jour.', 'success');
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
            
            // On réutilise la route history qui renvoie maintenant aussi le profil et les transactions !
            const response = await fetch(`${this.apiUrl}/auth/users/${userId}/history`, {
                headers: { "Authorization": `Bearer ${this.token}` }
            });

            if (!response.ok) throw new Error("Erreur de récupération");
            
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
                        <td style="padding: 5px; border-bottom: 1px solid #eee; font-size: 0.9em;">${tx.description || tx.type}</td>
                        <td style="padding: 5px; border-bottom: 1px solid #eee; font-size: 0.9em; color: ${color}; font-weight: bold;">${sign}${parseFloat(tx.amount).toFixed(2)}€</td>
                    </tr>
                `;
            }).join('');

            if (transactions.length === 0) {
                trHtml = `<tr><td colspan="3" style="text-align: center; padding: 10px; color: #7f8c8d;">Aucune transaction récente</td></tr>`;
            }

            Swal.fire({
                title: `Profil de ${user.username}`,
                html: `
                    <div style="text-align: left; background: #f8f9fa; padding: 15px; border-radius: 8px; margin-bottom: 15px; font-size: 0.95em;">
                        <p style="margin: 5px 0;">📧 <b>Email:</b> ${user.email}</p>
                        <p style="margin: 5px 0;">💰 <b>Solde actuel:</b> <span style="color:#2980b9; font-weight:bold;">${parseFloat(user.balance).toFixed(2)}€</span></p>
                        <p style="margin: 5px 0;">📅 <b>Inscrit le:</b> ${dateInscr}</p>
                        <p style="margin: 5px 0; color: #7f8c8d;" title="${user.password}">🔑 <b>Mot de passe:</b> Haché et sécurisé en BDD (Survolez pour voir le hash)</p>
                    </div>
                    <h4 style="margin: 0 0 10px 0; text-align: left; border-bottom: 2px solid #3498db; display: inline-block;">Dernières Transactions</h4>
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

    attachToForm(btnId) {
        const btn = document.getElementById(btnId);
        
        // Sécurité : Si le bouton n'existe pas sur cette page, on ne fait rien (évite de planter le script)
        if (!btn) return;

        btn.addEventListener("click", async () => {
            // Affiche une fenêtre "Prompt" version formulaire complet
            const { value: formValues } = await Swal.fire({
                title: 'Ajouter un utilisateur',
                html:
                    '<input id="swal-input1" class="swal2-input" placeholder="Prénom">' +
                    '<input id="swal-input2" class="swal2-input" placeholder="Nom">' +
                    '<input id="swal-input3" type="email" class="swal2-input" placeholder="Email">' +
                    '<input id="swal-input4" type="password" class="swal2-input" placeholder="Mot de passe">' +
                    '<input id="swal-input5" type="number" class="swal2-input" placeholder="Crédit initial">',
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
                
                // Appel à l'API
                const result = await this.registerUser(
                    firstName, 
                    lastName, 
                    email, 
                    password, 
                    parseFloat(creditAmount)
                );

                if (result.success) {
                    Swal.fire('Succès !', 'Utilisateur créé.', 'success');
                    // On utilise l'ID retourné par l'API (result.data.userId)
                    const username = `${firstName} + " " + ${lastName}`;
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