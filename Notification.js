class NotificationManager {

    constructor(apiUrl, userManager) {
        this.apiUrl = apiUrl;
        this.userManager = userManager;
        // On cible le TBODY défini dans l'index.html
        this.tbody = document.getElementById("maintenanceList");
        
        if (this.tbody) {
            // On lance le polling (vérification périodique)
            this.initPolling();
            // On lance l'écoute des WebSockets pour le temps réel
            this.initSocket();
        }
    }

    initSocket() {
        if (typeof io !== 'undefined') {
            if (!window.appSocket) {
                const socketUrl = this.apiUrl.replace('/api', '');
                window.appSocket = io(socketUrl, { 
                    path: "/api/socket.io", 
                    transports: ['websocket', 'polling'] 
                });
            }

            this.socket = window.appSocket;
            
            // Dès qu'une prise passe en 'hs' (ou en 'libre'), on rafraîchit les alertes
            this.socket.on('status_update', () => this.fetchAlerts());

            // Si on supprime une prise, on veut qu'elle disparaisse des alertes
            this.socket.on('new_plug_added', () => this.fetchAlerts());
        }
    }

    initPolling() {
        // Essai immédiat (si déjà connecté)
        this.fetchAlerts();

        // Puis toutes les 10 secondes pour avoir du temps réel
        setInterval(() => this.fetchAlerts(), 10000);
    }

    async fetchAlerts() {
        // Si on n'est pas connecté, on ne spamme pas l'API pour rien
        if (!this.userManager || !this.userManager.token) return;

        try {
            const response = await fetch(`${this.apiUrl}/plugs/alerts`, {
                headers: {
                    "Authorization": `Bearer ${this.userManager.token}`
                }
            });

            if (response.ok) {
                const data = await response.json();

                // L'API renvoie { alert_count: ..., devices: [...] }
                this.updateUI(data.devices);
            }
        } catch (error) {
            console.error("Erreur Notification:", error);
        }
    }

    updateUI(alerts) {
        this.tbody.innerHTML = "";

        if (!alerts || alerts.length === 0) {
            this.tbody.innerHTML = `
                <tr>
                    <td colspan="2" style="text-align:center; color:#27ae60;">
                        Aucune alerte ✔
                    </td>
                </tr>
            `;
            return;
        }

        alerts.forEach(alert => {
            const tr = document.createElement("tr");

            // Date formatée (heure seulement pour gagner de la place)
            const dateObj = new Date(alert.last_ping);

            const timeStr = dateObj.toLocaleTimeString('fr-FR', {
                hour: '2-digit',
                minute: '2-digit'
            });

            // Colonne 1 : Appareil
            const tdDevice = document.createElement("td");
            tdDevice.innerHTML = `<b>${alert.id}</b>`;

            // Colonne 2 : Alerte (raison + heure)
            const tdAlert = document.createElement("td");

            // On met la raison en rouge et l'heure en petit gris
            tdAlert.innerHTML = `
                <span style="color:#c0392b;">
                    ${alert.alert_reason}
                </span>
                <small style="color:#7f8c8d">
                    (${timeStr})
                </small>
            `;

            tr.appendChild(tdDevice);
            tr.appendChild(tdAlert);

            this.tbody.appendChild(tr);
        });
    }
}

document.addEventListener("DOMContentLoaded", () => {
    // On passe l'URL réelle et l'instance userManager existante
    if (typeof userManager !== 'undefined') {
        new NotificationManager(
            "https://recharge.cielnewton.fr/api",
            userManager
        );
    }
});