import { useState, useEffect } from "react";
import ListVM from "./ListVM.jsx";
import "../styles/style_auth.css";

export default function PageAuth() {

  // Champs du formulaire
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");

  // Serveur sélectionné (ou "all")
  const [server, setServer] = useState(
    localStorage.getItem("server") || "pm-serv16"
  );

  // Gestion des erreurs
  const [error, setError] = useState("");

  // Liste des VM de tous les serveurs sélectionnés
  const [allServersVMs, setAllServersVMs] = useState(null);

  // État de connexion
  const [isLogged, setIsLogged] = useState(false);

  // Pour afficher "Chargement..." pendant la vérification de session
  const [checkingSession, setCheckingSession] = useState(true);

  // Base API
  const BASE = import.meta.env.VITE_BASE_PATH || '/app2/';
  const API_BASE = `${BASE}api`;

  // Liste des serveurs disponibles
  const SERVERS = [
    "pm-serv16",
    "pm-serv17",
    "pm-serv18",
    "pm-serv19",
    "pm-serv20",
    "pm-serv21"
  ];

  // Retourne la liste des serveurs sélectionnés
  function getSelectedServers() {
    return server === "all" ? SERVERS : [server];
  }

  // Charge les VM de tous les serveurs sélectionnés
  async function loadAllVMs() {
    const selected = getSelectedServers();
    const results = [];

    for (const srv of selected) {

      // Appel API pour récupérer les VM du serveur
      const res = await fetch(`${API_BASE}/server/${srv}/vm`, {
        credentials: "include"
      });

      // Si le serveur renvoie une erreur → on passe au suivant
      if (!res.ok) continue;

      let data;
      try {
        // On tente de parser le JSON
        data = await res.json();
      } catch {
        // Si JSON invalide → on ignore ce serveur
        continue;
      }

      // On stocke les VM de ce serveur
      results.push({ server: srv, vms: data });
    }

    return results;
  }

  // Vérifie si une session existe déjà
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
        const results = await loadAllVMs();
        if (cancelled) return;

        if (results.length > 0) {
          setIsLogged(true);
          setAllServersVMs(results);
        } else {
          setIsLogged(false);
          setAllServersVMs(null);
          localStorage.removeItem("hasLoggedOnce");
        }
      } finally {
        if (!cancelled) setCheckingSession(false);
      }
    }

    checkSession();

    return () => (cancelled = true);
  }, [server]);

  // Connexion utilisateur
  async function handleSubmit(e) {
    e.preventDefault();
    setError("");

    const selected = getSelectedServers();

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

      // Si login incorrect
      if (!res.ok) {
        setError("Login incorrect");
        return;
      }

      let data;
      try {
        // On parse le JSON proprement
        data = await res.json();
      } catch {
        setError("Réponse serveur invalide");
        return;
      }

      // Vérification du message
      if (!data || data.message !== "Logged in") {
        setError("Login incorrect");
        return;
      }

      // On charge les VM
      const results = await loadAllVMs();
      setIsLogged(true);
      setAllServersVMs(results);

      // On garde la session
      localStorage.setItem("hasLoggedOnce", "true");

    } catch (err) {
      setError("Erreur de connexion");
    }
  }

  // Déconnexion
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

  // Affichage "Chargement..."
  if (checkingSession) {
    return <div className="pageAuth"><p>Chargement...</p></div>;
  }

  // Si connecté → afficher les VM
  if (isLogged && allServersVMs) {
    return (
      <>
        {allServersVMs.map((srv) => (
          <ListVM
            key={srv.server}
            server={srv.server}
            vms={srv.vms}
            onLogout={handleLogout}
          />
        ))}
      </>
    );
  }

  // Formulaire de connexion
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
