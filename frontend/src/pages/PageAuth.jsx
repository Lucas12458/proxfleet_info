import { useState, useEffect } from "react";
import ListVM from "./ListVM.jsx";
import "../styles/style_auth.css";

export default function Login() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [server, setServer] = useState(
    localStorage.getItem("server") || "pm-serv16"
  );

  const [error, setError] = useState("");
  const [vms, setVms] = useState(null);
  const [isLogged, setIsLogged] = useState(false);
  const [checkingSession, setCheckingSession] = useState(true);

    const API_BASE = `${import.meta.env.VITE_BASE_PATH}api`;


  /**
   * Vérification automatique de session
   * uniquement si l'utilisateur s'est déjà connecté.
   */
  useEffect(() => {
    const hasLoggedOnce = localStorage.getItem("hasLoggedOnce");

    // Première ouverture → pas de check session inutile
    if (!hasLoggedOnce) {
      setCheckingSession(false);
      return;
    }

    let cancelled = false;

    async function checkSession() {
      setCheckingSession(true);

      try {
        const res = await fetch(
          `${API_BASE}/server/${server}/vm`,
          { credentials: "include" }
        );

        if (!res.ok) throw new Error("No session");

        const data = await res.json();

        if (cancelled) return;

        setIsLogged(true);
        setVms(data);
      } catch {
        if (cancelled) return;

        setIsLogged(false);
        setVms(null);
        localStorage.removeItem("hasLoggedOnce");
      } finally {
        if (!cancelled) setCheckingSession(false);
      }
    }

    checkSession();

    return () => {
      cancelled = true;
    };
  }, [server]);

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");

    try {
      const res = await fetch(`${API_BASE}/auth/token`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          username,
          password,
          realm: "pam",
          hosts: [server]
        }),
        credentials: "include"
      });

      const data = await res.json();

      if (data.message !== "Logged in") {
        setError("Login incorrect");
        return;
      }

      // Login OK → charger les VM
      const vmRes = await fetch(
        `${API_BASE}/server/${server}/vm`,
        { credentials: "include" }
      );

      const vmData = await vmRes.json();

      setIsLogged(true);
      setVms(vmData);

      // Marque qu'une session a déjà existé
      localStorage.setItem("hasLoggedOnce", "true");
    } catch (err) {
      console.error(err);
      setError("Erreur de connexion");
    }
  }

  async function handleLogout() {
    await fetch(`${API_BASE}/auth/logout`, {
      method: "POST",
      credentials: "include"
    });

    setIsLogged(false);
    setVms(null);
    localStorage.removeItem("hasLoggedOnce");
  }

  /**
   * Pendant la vérification de session :
   * on évite d'afficher le login
   */
  if (checkingSession) {
    return (
      <div className="pageAuth">
        <p>Chargement...</p>
      </div>
    );
  }

  /**
   * Utilisateur connecté
   */
  if (isLogged && vms) {
    return (
      <ListVM
        server={server}
        vms={vms}
        onLogout={handleLogout}
      />
    );
  }

  /**
   * Page login
   */
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
          <option value="pm-serv16">Serveur 16</option>
          <option value="pm-serv17">Serveur 17</option>
          <option value="pm-serv18">Serveur 18</option>
          <option value="pm-serv19">Serveur 19</option>
          <option value="pm-serv20">Serveur 20</option>
          <option value="pm-serv21">Serveur 21</option>
        </select>

        <button type="submit">Login</button>

        {error && <p className="error">{error}</p>}
      </form>
    </div>
  );
}
