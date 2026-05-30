class ConsumptionGraph {
    constructor(apiUrl, userManager) {
        this.apiUrl = apiUrl;
        this.userManager = userManager;
        this.chart = null;
        this.socket = null;

        // SÉCURITÉ DOM : Attendre que le HTML soit chargé pour trouver <canvas> et <ul>
        if (document.readyState === "loading") {
            document.addEventListener("DOMContentLoaded", () => this.init());
        } else {
            this.init();
        }
    }

    init() {
        const canvas = document.getElementById("consoChart");
        const userList = document.getElementById("userList");

        if (canvas && userList) {
            this.ctx = canvas.getContext("2d");

            // Délégation d'événement sur la liste des utilisateurs
            userList.addEventListener("click", (event) => {
                const li = event.target.closest("li");
                if (li && li.dataset.id) {
                    const userId = li.dataset.id;
                    this.loadUserConsumption(userId);
                }
            });

            this.initSocket();
        } else {
            console.warn("Graph.js : Éléments 'consoChart' ou 'userList' introuvables.");
        }
    }

    initSocket() {
        if (typeof io !== 'undefined') {
            if (!window.appSocket) {
                const socketUrl = this.apiUrl.replace('/api', '');
                window.appSocket = io(socketUrl, {
                    transports: ['websocket', 'polling']
                });
            }

            this.socket = window.appSocket;

            this.socket.on('user_data_updated', (data) => {
                // On vérifie si un utilisateur est sélectionné ET si c'est le bon
                if (this.userManager &&
                    this.userManager.selectedUserId &&
                    this.userManager.selectedUserId == data.userId) {

                    console.log(`📈 Mise à jour du graphique pour l'utilisateur ${data.userId}...`);
                    this.loadUserConsumption(data.userId);
                }
            });

            // Écoute de l'énergie en temps réel
            this.socket.on('live_consumption', (data) => {
                console.log(`⚡ [WS] live_consumption reçu :`, data);

                if (this.userManager &&
                    this.userManager.selectedUserId == data.userId) {

                    // Mise à jour uniquement du dernier point si même session
                    if (this.chart && this.lastSessionId == data.sessionId) {
                        console.log(`📊 Mise à jour du graphique en direct : ${data.energyWh} Wh`);

                        const dataArray = this.chart.data.datasets[0].data;
                        dataArray[dataArray.length - 1] = data.energyWh;

                        this.chart.update();
                    } else {
                        console.log(`⚠️ Ignoré : Session actuelle (${this.lastSessionId}) != session reçue (${data.sessionId})`);
                    }
                } else {
                    const currentId = this.userManager
                        ? this.userManager.selectedUserId
                        : 'Aucun';

                    console.log(`⚠️ Ignoré : User actuel (${currentId}) != user reçu (${data.userId})`);
                }
            });
        }
    }

    async loadUserConsumption(userId) {
        try {
            // Vérifie le token avant appel API
            if (!this.userManager.token) {
                const logged = await this.userManager.loginAdmin();
                if (!logged) return;
            }

            const response = await fetch(
                `${this.apiUrl}/auth/users/${userId}/history`,
                {
                    headers: {
                        "Authorization": `Bearer ${this.userManager.token}`
                    }
                }
            );

            if (!response.ok) {
                console.error("Erreur API Graphique :", response.status);

                if (response.status === 401 || response.status === 403) {
                    Swal.fire(
                        'Erreur',
                        'Session expirée. Veuillez recharger la page.',
                        'error'
                    );
                } else {
                    Swal.fire(
                        'Erreur',
                        `Impossible de récupérer l'historique. (Erreur ${response.status})`,
                        'error'
                    );
                }
                return;
            }

            const responseData = await response.json();

            const data = responseData.history !== undefined
                ? responseData.history
                : responseData;

            const dates = [];
            const values = [];

            if (Array.isArray(data)) {

                this.lastSessionId = null;

                const reversedData = [...data].reverse();

                if (reversedData.length > 0) {
                    this.lastSessionId =
                        reversedData[reversedData.length - 1].id;
                }

                reversedData.forEach(session => {
                    const dateObj = new Date(session.start_time);

                    const formattedDate = dateObj.toLocaleString('fr-FR', {
                        month: 'numeric',
                        day: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit'
                    });

                    dates.push(formattedDate);

                    const energyWh = (session.energy_kwh || 0) * 1000;
                    values.push(energyWh);
                });
            }

            this.updateGraph(dates, values);

        } catch (error) {
            console.error("Erreur chargement consommation :", error);
        }
    }

    updateGraph(labels, values) {
        if (typeof Chart === 'undefined') {
            console.error("La librairie Chart.js n'est pas chargée !");
            return;
        }

        if (this.chart) this.chart.destroy();

        this.chart = new Chart(this.ctx, {
            type: "line",
            data: {
                labels: labels,
                datasets: [{
                    label: "Consommation (Wh)",
                    data: values,
                    borderColor: "#27ae60",
                    backgroundColor: "rgba(39,174,96,0.2)",
                    tension: 0.3,
                    fill: true
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: true,
                aspectRatio: 2,
                scales: {
                    y: {
                        beginAtZero: true
                    }
                }
            }
        });
    }
}

const graph = new ConsumptionGraph(
    "https://recharge.cielnewton.fr/api",
    userManager
);