import { useState, useEffect } from "react";
import { PulseLoader } from "react-spinners";
import ListVM from "./ListVM.jsx";
import "../styles/style_auth.css";

export default function PageAuth() {

  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [server, setServer] = useState(localStorage.getItem("server") || "pm-serv16");
  const [error, setError] = useState("");
  const [allServersVMs, setAllServersVMs] = useState(null);
  const [isLogged, setIsLogged] = useState(false);
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const [checkingSession, setCheckingSession] = useState(true);

  const BASE = import.meta.env.VITE_BASE_PATH || '/app2/';
  const API_BASE = `${BASE}api`;

  const [logs, setLogs] = useState([]);
  const [logsOpen, setLogsOpen] = useState(true);

  const addLog = (message, type = "info") => {
    const newLog = {
      id: Date.now(),
      time: new Date().toLocaleTimeString(),
      message,
      type
    };
    setLogs(prev => [newLog, ...prev].slice(0, 50));
  };

  const [SERVERS, setSERVERS] = useState([]);

  // Charger les serveurs
  useEffect(() => {
    async function fetchServers() {
      try {
        const res = await fetch(`${API_BASE}/servers`, { credentials: "include" });
        if (!res.ok) return;
        const data = await res.json();
        setSERVERS(data.map(s => s.host));
      } catch {}
    }
    fetchServers();
  }, []);

  // Charger les VMs
  async function loadAllVMs(selectedServer) {
    const selected = selectedServer === "all" ? SERVERS : [selectedServer];
    const results = [];

    for (const srv of selected) {
    try {
      const res = await fetch(`${API_BASE}/server/${srv}/vm`, {
        credentials: "include"
      });
      
        if (!res.ok) continue;
      
      const data = await res.json();
        results.push({ server: srv, vms: data });

      } catch {
        continue;
    }
    }

    return results;
}

  // FIX REFRESH ICI (le seul vrai fix)
  useEffect(() => {
    const hasLoggedOnce = localStorage.getItem("hasLoggedOnce");

    if (!hasLoggedOnce) {
      setCheckingSession(false);
      return;
    }

    let cancelled = false;

    async function checkSession() {

      // attendre SERVERS si "all"
      if (server === "all" && SERVERS.length === 0) {
        setCheckingSession(false);
        return;
      }

      setCheckingSession(true);

      try {
        const results = await loadAllVMs(server);
        if (cancelled) return;

        if (results.length > 0) {
          setIsLogged(true);
          setAllServersVMs(results);
        } else {
          setIsLogged(false);
          setAllServersVMs(null);
          localStorage.removeItem("hasLoggedOnce");
        }
      } catch {
        if (!cancelled) {
          setIsLogged(false);
          setAllServersVMs(null);
        }
      } finally {
        if (!cancelled) setCheckingSession(false);
      }
    }

    checkSession();

    return () => { cancelled = true; };

  }, [server, SERVERS]);

  // LOGIN (inchangé)
  async function handleSubmit(e) {
    e.preventDefault();
    setIsLoggingIn(true); 
    setError("");

    const selected = server === "all" ? SERVERS : [server];

    try {
      const res = await fetch(`${API_BASE}/auth/token`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          username,
          password,
          realm: "pam",
          hosts: selected
        })
      });
      
      if (!res.ok) {
       const errorData = await res.json().catch(() => ({}));
       setIsLoggingIn(false); 
       setError(errorData.detail || "Login incorrect");
      return;
      }

      let data;
      try {
        data = await res.json();
      } catch {
        setError("Réponse serveur invalide");
        return;
      }

      if (!data || !data.servers) {
        setError("Session incomplète ou corrompue");
        return;
      }

      const results = await loadAllVMs(server);
      setIsLogged(true);
      setAllServersVMs(results);
      localStorage.setItem("hasLoggedOnce", "true");

    } catch {
      setError("Erreur de connexion");
    }
    finally {
        // Le bloc 'finally' s'exécute quoi qu'il arrive (succès ou erreur)
        setIsLoggingIn(false); // <--- ÉTAPE 2 : On arrête le chargement
    }
  }

  async function handleLogout() {
    setIsLoggingOut(true); // 1. On lance le chargement
    try {
      await fetch(`${API_BASE}/auth/logout`, {
        method: "POST",
        credentials: "include"
      });
    } catch {}
    
    finally {
    // Si on n'est pas encore redirigé, on arrête le spinner
    setIsLoggingOut(false); 
  }

    setIsLogged(false);
    setAllServersVMs(null);
    localStorage.removeItem("hasLoggedOnce");
  }

  async function refreshVMs() {
    const results = await loadAllVMs(server);
    setAllServersVMs(results);
  }

  // Chargement
  if (checkingSession) {
    return <div className="pageAuth"><p>Chargement...</p></div>;
  }

  // CONNECTÉ
  if (isLogged && allServersVMs) {
    const isMulti = server === "all";

    return (
      <div className="page-auth-connected">

        {isMulti ? (
          <ListVM
            server={null}
            vms={[]}
            allServersData={allServersVMs}
            isMulti={true}
            onLogout={handleLogout}
            onRefresh={refreshVMs}
            addLog={addLog}
          />
        ) : (
          allServersVMs.map((srv) => (
            <ListVM
              key={srv.server}
              server={srv.server}
              vms={srv.vms}
              isMulti={false}
              onLogout={handleLogout}
              onRefresh={refreshVMs}
              addLog={addLog}
            />
          ))
        )}

        {/* SECTION CONSOLE CORRIGÉE AVEC LES CLASSES */}
        <div className="console-container">
          <div className="console-header">
            <span>Logs d'activités Proxmox</span>

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
        {/* FIN SECTION CONSOLE */}

      </div>
    );
  }

  // LOGIN
  return (
    <div className="pageAuth">
      <form onSubmit={handleSubmit}>
        <h2>Connexion</h2>

        <input
          placeholder="Username"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
        />

        <input
          type="password"
          placeholder="Password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />

        <select
          value={server}
          onChange={(e) => {
            setServer(e.target.value);
            localStorage.setItem("server", e.target.value);
          }}
        >
          <option value="all">Tous les serveurs</option>
          {SERVERS.map(s => (
            <option key={s} value={s}>{s}</option>
          ))}
        </select>

        <button type="submit" disabled={isLoggingIn} className="login-btn">
        {isLoggingIn ? (<PulseLoader color="#ffffff" loading={isLoggingIn} size={10} aria-label="Loading Spinner" />) : ("Se connecter")}
        </button>

        {error && <p className="error">{error}</p>}
      </form>
    </div>
  );
}