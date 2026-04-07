import { useState, useEffect } from "react";
import { PulseLoader, SyncLoader } from "react-spinners";
import { useNavigate } from "react-router-dom"; // Pour la redirection
import "../styles/style_auth.css";

// On recupere la prop onLogin passee par App.jsx
export default function PageAuth({ onLogin }) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [server, setServer] = useState(localStorage.getItem("server") || "pm-serv16");
  const [error, setError] = useState("");
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const [SERVERS, setSERVERS] = useState([]);

  const navigate = useNavigate(); // Hook pour changer de page
  const BASE = import.meta.env.VITE_BASE_PATH || '/app2/';
  const API_BASE = `${BASE}api`;


 useEffect(() => {
    // A l'ouverture de la page : on bloque le scroll
    document.body.style.overflow = "hidden";

    // Fonction de nettoyage (cleanup)
    // React l'execute automatiquement quand le composant est detruit (ex: apres le login)
    return () => {
      document.body.style.overflow = "auto";
    };
  }, []);





  // Charger les serveurs pour le menu deroulant
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
  }, [API_BASE]);

  // LOGIN
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
        setError("Reponse serveur invalide");
        return;
      }

      if (!data || !data.servers) {
        setError("Session incomplete ou corrompue");
        return;
      }

      localStorage.setItem("hasLoggedOnce", "true");

      // 1. On met a jour l'etat global dans App.jsx avec les infos de l'API
      // Si l'API ne renvoie pas encore user_info, on met un fallback temporaire
      const userInfo = data.user_info || { nom: username, role: "etudiant" };
      onLogin(userInfo);

      // 2. On redirige vers la page principale des VMs
      navigate("/");

    } catch {
      setError("Erreur de connexion");
    } finally {
      setIsLoggingIn(false); 
    }
  }

  // L'interface ne contient plus que le formulaire
  return (
    <div className="pageAuth">
      <form onSubmit={handleSubmit}>
        <h2>Connexion</h2>

        <input
          id="username"
          name="username"
          type="text"
          autoComplete="username" 
          placeholder="Username"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
        />

        <input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password" 
          placeholder="Password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />

        {/* Affichage conditionnel : Spinner ou Menu déroulant */}
        {SERVERS.length === 0 ? (
          
          // État de chargement
          <div className="loading-servers-box" style={{ 
            display: "flex", 
            alignItems: "center", 
            justifyContent: "center", 
            padding: "10px", 
            background: "#7d8289", 
            border: "1px solid #ccc", 
            borderRadius: "5px",
            marginBottom: "15px"
          }}>
            <SyncLoader color="#3498db" size={8} />
            <span style={{ marginLeft: "10px", color: "#7f8c8d", fontSize: "0.9rem" }}>
              Recherche des serveurs
            </span>
          </div>

        ) : (
          
          // État chargé
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
          
        )}

        <button type="submit" disabled={isLoggingIn} className="login-btn">
          {isLoggingIn ? (<PulseLoader color="#ffffff" loading={isLoggingIn} size={10} aria-label="Loading Spinner" />) : ("Se connecter")}
        </button>

        {error && <p className="error">{error}</p>}
      </form>
    </div>
  );
}