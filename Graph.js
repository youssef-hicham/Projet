class ConsumptionGraph{
    constructor(apiUrl, userManager){
        this.apiUrl=apiUrl;
        this.userManager = userManager;
        this.chart=null;
        this.socket = null;
        
        // SÃ‰CURITÃ‰ DOM : Attendre que le HTML soit chargÃ© pour trouver <canvas> et <ul>
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
            
            // DÃ©lÃ©gation d'Ã©vÃ©nement sur la liste des utilisateurs
            userList.addEventListener("click", (event) => {
                const li = event.target.closest("li");
                if (li && li.dataset.id) {
                    const userId = li.dataset.id;
                    this.loadUserConsumption(userId);
                }
            });

            this.initSocket();
        } else {
            console.warn("Graph.js : Ã‰lÃ©ments 'consoChart' ou 'userList' introuvables.");
        }
    }

    initSocket() {
        if (typeof io !== 'undefined') {
            if (!window.appSocket) {
                const socketUrl = this.apiUrl.replace('/api', '');
                window.appSocket = io(socketUrl, { path: "/api/socket.io", transports: ['websocket', 'polling'] });
            }
            this.socket = window.appSocket;

            this.socket.on('user_data_updated', (data) => {
                // On vÃ©rifie si un utilisateur est sÃ©lectionnÃ© ET si c'est le bon
                if (this.userManager && this.userManager.selectedUserId && this.userManager.selectedUserId == data.userId) {
                    console.log(`ðŸ“Š Mise Ã  jour du graphique pour l'utilisateur ${data.userId}...`);
                    this.loadUserConsumption(data.userId);
                }
            });

            // NOUVEAU : Ã‰coute de l'Ã©nergie en temps rÃ©el
            this.socket.on('live_consumption', (data) => {
                console.log(`âš¡ [WS] live_consumption reÃ§u :`, data);

                if (this.userManager && this.userManager.selectedUserId == data.userId) {
                    // On met Ã  jour uniquement le dernier point du graphique si l'ID de session correspond
                    if (this.chart && this.lastSessionId == data.sessionId) {
                        console.log(`ðŸ“ˆ Mise Ã  jour du graphique en direct : ${data.energyWh} Wh`);
                        const dataArray = this.chart.data.datasets[0].data;
                        dataArray[dataArray.length - 1] = data.energyWh;
                        this.chart.update(); // FORCE LA MISE A JOUR VISUELLE
                    } else {
                        console.log(`âš ï¸ IgnorÃ© : Session Actuelle (${this.lastSessionId}) != Session ReÃ§ue (${data.sessionId})`);
                    }
                } else {
                    const currentId = this.userManager ? this.userManager.selectedUserId : 'Aucun';
                    console.log(`âš ï¸ IgnorÃ© : User Actuel (${currentId}) != User ReÃ§u (${data.userId})`);
                }
            });
        }
    }

    async loadUserConsumption(userId){
        try{
            // On vÃ©rifie le token avant d'appeler
            if (!this.userManager.token) {
                const logged = await this.userManager.loginAdmin();
                if (!logged) return; // Si l'utilisateur annule
            }

            // Appel de la route API correcte avec l'ID
            const response=await fetch(`${this.apiUrl}/auth/users/${userId}/history`, {
                headers: { "Authorization": `Bearer ${this.userManager.token}` }
            }); 
            
            if (!response.ok) {
                console.error("Erreur API Graphique :", response.status);
                if (response.status === 401 || response.status === 403) {
                    Swal.fire('Erreur', 'Session expirÃ©e. Veuillez recharger la page.', 'error');
                } else {
                    // On affiche le code d'erreur pour aider au dÃ©bogage
                    Swal.fire('Erreur', `Impossible de rÃ©cupÃ©rer l'historique. (Erreur ${response.status})`, 'error');
                }
                return;
            }

            const responseData=await response.json();
            // L'API renvoie maintenant { history: [], transactions: [], user: {} }
            const data = responseData.history !== undefined ? responseData.history : responseData;

            // Transformation des donnÃ©es (Array d'objets SQL -> Arrays pour Chart.js)
            // On suppose que data est un tableau : [{ start_time: "...", energy_kwh: 0.5 }, ...]
            const dates = [];
            const values = [];

            if (Array.isArray(data)) {
                // On enregistre l'ID de la derniÃ¨re session pour la mise Ã  jour en temps rÃ©el
                this.lastSessionId = null;
                const reversedData = [...data].reverse();
                
                if (reversedData.length > 0) {
                    this.lastSessionId = reversedData[reversedData.length - 1].id;
                }

                reversedData.forEach(session => {
                    // Formatage simple de la date (ex: "12/05 14:30")
                    const dateObj = new Date(session.start_time);
                    // Utilisation de toLocaleString pour inclure l'heure correctement
                    const formattedDate = dateObj.toLocaleString('fr-FR', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' });
                    
                    dates.push(formattedDate);
                    
                    // Conversion kWh -> Wh pour plus de lisibilitÃ©
                    const energyWh = (session.energy_kwh || 0) * 1000; 
                    values.push(energyWh);
                });
            }

            this.updateGraph(dates, values);

        }catch(error){
            console.error("Erreur chargement consommation :",error);
        }
    }

    updateGraph(labels,values){
        if (typeof Chart === 'undefined') {
            console.error("La librairie Chart.js n'est pas chargÃ©e !");
            return;
        }

        if(this.chart)this.chart.destroy();

        this.chart=new Chart(this.ctx,{
            type:"line",
            data:{
                labels:labels,
                datasets:[{
                    label:"Consommation (Wh)",
                    data:values,
                    borderColor:"#27ae60",
                    backgroundColor:"rgba(39,174,96,0.2)",
                    tension:0.3,
                    fill:true
                }]
            },
            options:{
                responsive:true,
                maintainAspectRatio: true, // On garde les proportions pour Ã©viter qu'il ne s'Ã©tire trop
                aspectRatio: 2, // Format rectangulaire standard (2x plus large que haut)
                scales:{y:{beginAtZero:true}}
            }
        });
    }
}

const graph=new ConsumptionGraph("https://recharge.cielnewton.fr/api", userManager);