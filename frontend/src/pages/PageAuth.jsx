import { useState, useEffect } from "react";
import ListVM from "./ListVM.jsx";
import "../styles/style_auth.css";

export default function PageAuth() {

  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [server, setServer] = useState(localStorage.getItem("server") || "pm-serv16");
  const [error, setError] = useState("");
  const [allServersVMs, setAllServersVMs] = useState(null);
  const [isLogged, setIsLogged] = useState(false);
  const [checkingSession, setCheckingSession] = useState(true);

  const BASE = import.meta.env.VITE_BASE_PATH || '/app2/';
  const API_BASE = `${BASE}api`;

  /*const SERVERS = [
    "pm-serv16", "pm-serv17", "pm-serv18",
    "pm-serv19", "pm-serv20", "pm-serv21"
  ];
  */
  // Remplace le state SERVERS hardcodé par :
  const [SERVERS, setSERVERS] = useState([]);

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
  // Prend server en paramètre pour éviter les problèmes de closure
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

  // Vérifie session existante
  useEffect(() => {
    const hasLoggedOnce = localStorage.getItem("hasLoggedOnce");

    if (!hasLoggedOnce) {
      setCheckingSession(false);
      return;
    }

    let cancelled = false;

    async function checkSession() {
      setCheckingSession(true);
      try {
        const results = await loadAllVMs(server); // on passe server explicitement
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
  }, [server]);

  async function handleSubmit(e) {
    e.preventDefault();
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
        setError("Login incorrect");
        return;
      }

      let data;
      try {
        data = await res.json();
      } catch {
        setError("Réponse serveur invalide");
        return;
      }

      if (!data || data.message !== "Logged in") {
        setError("Login incorrect");
        return;
      }

      const results = await loadAllVMs(server);
      setIsLogged(true);
      setAllServersVMs(results);
      localStorage.setItem("hasLoggedOnce", "true");

    } catch {
      setError("Erreur de connexion");
    }
  }

  async function handleLogout() {
    try {
      await fetch(`${API_BASE}/auth/logout`, {
        method: "POST",
        credentials: "include"
      });
    } catch {}

    setIsLogged(false);
    setAllServersVMs(null);
    localStorage.removeItem("hasLoggedOnce");
  }

  // Chargement
  if (checkingSession) {
    return <div className="pageAuth"><p>Chargement...</p></div>;
  }

  // Connecté → affichage des VM
  if (isLogged && allServersVMs) {
    const isMulti = server === "all";

    return isMulti ? (
      <ListVM
        server={null}
        vms={[]}
        allServersData={allServersVMs}
        isMulti={true}
        onLogout={handleLogout}
      />
    ) : (
      <>
        {allServersVMs.map((srv) => (
          <ListVM
            key={srv.server}
            server={srv.server}
            vms={srv.vms}
            isMulti={false}
            onLogout={handleLogout}
          />
        ))}
      </>
    );
  }

  // Formulaire login
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

        <button type="submit">Login</button>

        {error && <p className="error">{error}</p>}
      </form>
    </div>
  );
}