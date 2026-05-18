// PageAuth.jsx
// Page de connexion (Login page).
// Affiche un formulaire avec username, password et sélecteur de serveur.
// On successful login, appelle onLogin() depuis App.jsx pour mettre à jour l'auth global.

import { useState, useEffect } from "react";
import { PulseLoader, SyncLoader } from "react-spinners";
import { useNavigate } from "react-router-dom";
import PropTypes from 'prop-types';

import "../styles/style_auth.css";

// Props:
//   - onLogin : callback depuis App.jsx pour stocker les infos de l'utilisateur connecté
export default function PageAuth({ onLogin }) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [server, setServer] = useState(localStorage.getItem("server") || "pm-serv16"); // Dernier serveur utilisé
  const [error, setError] = useState("");
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const [SERVERS, setSERVERS] = useState([]); // Liste des serveurs Proxmox disponibles

  const navigate = useNavigate();
  const BASE = import.meta.env.VITE_BASE_PATH || '/app2/';
  const API_BASE = `${BASE}api`;

  // Désactive le scroll de la page quand la modale est ouverte — restored on unmount
  useEffect(() => {
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = "auto";
    };
  }, []);

  // Récupère la liste des serveurs Proxmox disponibles pour le menu déroulant
  useEffect(() => {
    async function fetchServers() {
      try {
        const res = await fetch(`${API_BASE}/servers`, { credentials: "include" });
        if (!res.ok) return;
        const data = await res.json();
        setSERVERS(data.map(s => s.host));
      } catch(error) { console.error("Erreur d'authentification :", error); }
    }
    fetchServers();
  }, [API_BASE]);

  // Gère la soumission du formulaire de connexion
  async function handleSubmit(e) {
    e.preventDefault();
    setIsLoggingIn(true); 
    setError("");

    // Si "all" est sélectionné, envoie les credentials à tous les serveurs
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

      // Sauvegarde le serveur sélectionné pour la prochaine fois
      localStorage.setItem("server", server);

      // Extract user info returned by the backend (rôle, permissions, etc.)
      const userInfo = data.user_info || { nom: username, role: "etudiant" };
      
      // Met à jour l'auth global dans App.jsx
      onLogin(userInfo);

      // Redirect to the main page
      navigate("/");

    } catch {
      setError("Erreur de connexion");
    } finally {
      setIsLoggingIn(false); 
    }
  }

  return (
    <div className="pageAuth">
      <form onSubmit={handleSubmit} autoComplete="on">
        <h2>Connexion</h2>

        <input
          id="username"
          name="username"
          type="text"
          autoComplete="username" 
          placeholder="Username"
          required
          value={username}
          onChange={(e) => setUsername(e.target.value)}
        />

        <input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password" 
          placeholder="Password"
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />

        {/* Affiche un spinner pendant le chargement des serveurs, puis le menu déroulant */}
        {SERVERS.length === 0 ? (
          // État de chargement — servers not yet fetched
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
          // État chargé — show server selector
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

        {/* Bouton de connexion — shows a spinner while login is in progress */}
        <button type="submit" disabled={isLoggingIn} className="login-btn">
          {isLoggingIn ? (<PulseLoader color="#ffffff" loading={isLoggingIn} size={10} aria-label="Loading Spinner" />) : ("Se connecter")}
        </button>

        {/* Affiche le message d'erreur si le login échoue */}
        {error && <p className="error">{error}</p>}
      </form>
    </div>
  );
}

PageAuth.propTypes = {
  onLogin: PropTypes.func
};
