// PageVMs.jsx
// Page principale affichant la liste des machines virtuelles (VM list page).
// Récupère les VMs depuis un ou tous les serveurs Proxmox
// selon la préférence sauvegardée de l'utilisateur.
// Includes an activity log console at the bottom of the page.
// Updated : gère maintenant les erreurs 401 ET 403 (session expirée ou supprimée).

import { useState, useEffect, useCallback } from "react";
import { Navigate } from "react-router-dom";
import { PulseLoader } from "react-spinners";
import ListVM from "./ListVM.jsx";
import PropTypes from 'prop-types';

import "../styles/style_auth.css";

// Props:
//   - user : l'utilisateur connecté (the logged-in user object)
export default function PageVMs({ user }) {
  const [allServersVMs, setAllServersVMs] = useState(null); // Données des VMs groupées par serveur
  const [loading, setLoading] = useState(true);

  // État de la console d'activité — stores log entries displayed at the bottom
  const [logs, setLogs] = useState([]);
  const [logsOpen, setLogsOpen] = useState(true);

  const BASE = import.meta.env.VITE_BASE_PATH || '/app2/';
  const API_BASE = `${BASE}api`;

  // Ajoute une entrée dans la console d'activité (max 50 entrées conservées)
  const addLog = (message, type = "info") => {
    const newLog = {
      id: Date.now(),
      time: new Date().toLocaleTimeString(),
      message,
      type
    };
    setLogs(prev => [newLog, ...prev].slice(0, 50));
  };

  // Récupère les VMs du ou des serveurs sélectionnés
  const loadAllVMs = useCallback(async () => {
    if (!user) return;

    setLoading(true);
    try {
      const savedServer = localStorage.getItem("server") || "all";
      let targetServers = [];

      if (savedServer === "all") {
        // Récupère la liste complète des serveurs depuis le backend
        const resServers = await fetch(`${API_BASE}/servers`, { credentials: "include" });
        if (!resServers.ok) throw new Error("Impossible de récupérer la liste des serveurs");
        const dataServers = await resServers.json();
        targetServers = dataServers.map(s => s.host);
      } else {
        // Uses the single saved server directly
        targetServers = [savedServer];
      }

      // Fetch VMs from all target servers in parallel (requêtes parallèles)
      const fetchPromises = targetServers.map(async (srv) => {
        try {
          const res = await fetch(`${API_BASE}/server/${srv}/vm`, { credentials: "include" });

          // Gère les erreurs 401 (session expirée) ET 403 (accès refusé / session supprimée)
          if (res.status === 401 || res.status === 403) {
            console.warn(`Access denied (${res.status}). Session may be deleted or expired. Redirecting.`);
            sessionStorage.removeItem("user_session");
            // Redirection complète pour vider le state React — uses BASE path for correctness
            globalThis.location.href = `${BASE}auth`.replace(/\/+/g, '/');
            return null;
          }
          if (res.ok) {
            const data = await res.json();
            return { server: srv, vms: data };
          }
        } catch (error) {
          console.error(`Erreur sur ${srv}:`, error);
          addLog(`Erreur de connexion au serveur ${srv}`, "error");
        }
        return null;
      });

      const rawResults = await Promise.all(fetchPromises);
      // Filtre les requêtes qui ont échoué
      const validResults = rawResults.filter(result => result !== null);
      setAllServersVMs(validResults);

    } catch (error) {
      console.error("Erreur globale :", error);
      addLog(error.message, "error");
    } finally {
      setLoading(false);
    }
  }, [user, API_BASE]);

  // Chargement au montage du composant and whenever the user changes
  useEffect(() => {
    if (user) {
      loadAllVMs();
    } else {
      setLoading(false);
    }
  }, [user, loadAllVMs]);

  // Callback passé à ListVM pour déclencher un refresh des données
  const refreshVMs = async () => {
    await loadAllVMs();
  };

  // --- RENDUS CONDITIONNELS (CONDITIONAL RENDERS) ---

  // 1. Non connecté — redirect to auth page (using BASE path)
  if (!user) {
    return <Navigate to={`${BASE}/auth`} replace />;
  }

  // 2. Chargement en cours — show spinner
  if (loading && !allServersVMs) {
    return (
      <div className="pageAuth" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
        <p>Connexion aux serveurs Proxmox...</p>
        <PulseLoader color="#3498db" size={15} />
      </div>
    );
  }

  // 3. Affichage principal — VM list + activity log console
  const isMulti = localStorage.getItem("server") === "all";

  return (
    <div className="page-auth-connected">
      {/* SECTION LISTE DES VMs */}
      {isMulti ? (
        // Vue multi-serveurs — pass all servers' data at once
        <ListVM
          server={null}
          vms={[]}
          allServersData={allServersVMs}
          isMulti={true}
          onRefresh={refreshVMs}
          addLog={addLog}
          user={user}
        />
      ) : (
        // Vue mono-serveur — render one ListVM per server
        allServersVMs?.map((srv) => (
          <ListVM
            key={srv.server}
            server={srv.server}
            vms={srv.vms}
            isMulti={false}
            onRefresh={refreshVMs}
            addLog={addLog}
            user={user}
          />
        ))
      )}

      {/* CONSOLE D'ACTIVITÉ (ACTIVITY LOG) */}
      <div className="console-container">
        <div className="console-header">
          <span>Logs d'activites Proxmox</span>
          <div className="console-actions">
            <button
              className="toggle-logs"
              onClick={() => setLogsOpen(!logsOpen)}
            >
              {logsOpen ? "Réduire ▼" : "Afficher ▲"}
            </button>
            <button
              className="clear-logs"
              onClick={() => setLogs([])}
            >
              Effacer
            </button>
          </div>
        </div>

        {logsOpen && (
          <div className="console-body">
            {logs.length === 0 && (
              <p className="empty-log">En attente d'actions...</p>
            )}
            {logs.map((log) => (
              <div key={log.id} className={`log-entry ${log.type}`}>
                <span className="log-time">[{log.time}]</span> {log.message}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

PageVMs.propTypes = {
  user: PropTypes.object
};
