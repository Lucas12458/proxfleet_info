import { useState, useEffect, useCallback } from "react";
import { Navigate } from "react-router-dom";
import { PulseLoader } from "react-spinners";
import ListVM from "./ListVM.jsx";
import PropTypes from 'prop-types';

import "../styles/style_auth.css"; // A renommer plus tard en style_vms.css si tu veux

export default function PageVMs({ user }) {
  const [allServersVMs, setAllServersVMs] = useState(null);
  const [loading, setLoading] = useState(true);
  
  // Console state
  const [logs, setLogs] = useState([]);
  const [logsOpen, setLogsOpen] = useState(true);

  const BASE = import.meta.env.VITE_BASE_PATH || '/app2/';
  const API_BASE = `${BASE}api`;

  // Fonction pour ajouter un log dans la console
  const addLog = (message, type = "info") => {
    const newLog = {
      id: Date.now(),
      time: new Date().toLocaleTimeString(),
      message,
      type
    };
    setLogs(prev => [newLog, ...prev].slice(0, 50));
  };

  // Fonction principale de chargement des VMs
const loadAllVMs = useCallback(async () => {
  if (!user) return;
  
  setLoading(true);
  try {
    // 1. On regarde d'abord le choix de l'utilisateur
    const savedServer = localStorage.getItem("server") || "all";
    let targetServers = [];

    if (savedServer === "all") {
      // SI "all" : On doit demander la liste des serveurs au backend
      const resServers = await fetch(`${API_BASE}/servers`, { credentials: "include" });
      if (!resServers.ok) throw new Error("Impossible de récupérer la liste des serveurs");
      const dataServers = await resServers.json();
      targetServers = dataServers.map(s => s.host);
    } else {
      // SI un serveur précis : Pas besoin d'appeler /servers, on utilise directement le nom
      targetServers = [savedServer];
    }

    // 2. PARALLELISATION : On ne lance les requêtes que pour les serveurs cibles
    const fetchPromises = targetServers.map(async (srv) => {
      try {
        const res = await fetch(`${API_BASE}/server/${srv}/vm`, { credentials: "include" });
        if (res.status === 401) {
          console.warn("Session expired or unauthorized. Redirecting to login.");
      
          // 1. Clear the frontend state
          sessionStorage.removeItem("user_session");
      
          // 2. Force a full page redirect to the auth page
          // Using window.location guarantees the React state is wiped clean
          globalThis.location.href = "/auth"; 
          return; 
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
    const validResults = rawResults.filter(result => result !== null);

    setAllServersVMs(validResults);

  } catch (error) {
    console.error("Erreur globale :", error);
    addLog(error.message, "error");
  } finally {
    setLoading(false);
  }
}, [user, API_BASE]);

  // Chargement initial au montage du composant
  useEffect(() => {
    if (user) {
      loadAllVMs();
    } else {
      setLoading(false); // Si pas de user, on arrete de charger pour afficher le message d'erreur
    }
  }, [user, loadAllVMs]);

  // Fonction appelee par le bouton de rafraichissement dans ListVM
  const refreshVMs = async () => {
    await loadAllVMs();
  };

  // --- RENDUS CONDITIONNELS ---

  // 1. Utilisateur non connecte
  if (!user) {
    
    return <Navigate to="/auth" replace />;
  }

  // 2. Chargement des donnees en cours
  if (loading && !allServersVMs) {
    return (
      <div className="pageAuth" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
        <p>Connexion aux serveurs Proxmox...</p>
        <PulseLoader color="#3498db" size={15} />
      </div>
    );
  }

  // 3. Affichage principal (Connecte + Donnees chargees)
  const isMulti = localStorage.getItem("server") === "all";

  return (
    <div className="page-auth-connected">
      {/* SECTION LISTE DES VMs */}
      {isMulti ? (
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
        allServersVMs?.map((srv) => (
          <ListVM
            key={srv.server}
            server={srv.server}
            vms={srv.vms}
            isMulti={false}
            onRefresh={refreshVMs}
            addLog={addLog}
            user = {user}
          />
        ))
      )}

      {/* SECTION CONSOLE */}
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
}