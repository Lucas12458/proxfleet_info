// NavBar.jsx
// Barre de navigation principale de l'application (top navigation bar).
// Affiche les liens selon le rôle et les permissions de l'utilisateur,
// un bouton de toggle thème (dark/light), and a login/logout button.

import { Link, useNavigate, useLocation } from "react-router-dom";
import { useState, useEffect } from "react";
import PropTypes from 'prop-types';
import "../styles/navbar.css";

// ThemeToggle : composant bouton standalone pour basculer entre dark et light mode.
// Persists the user's preference in localStorage.
export function ThemeToggle() {
  const [isDark, setIsDark] = useState(localStorage.getItem("theme") === "dark");

  // Applique le thème sur l'élément HTML racine à chaque changement
  useEffect(() => {
    const theme = isDark ? "dark" : "light";
    document.documentElement.dataset.theme = theme;
    localStorage.setItem("theme", theme);
  }, [isDark]);

  return (
    <button 
      onClick={() => setIsDark(!isDark)}
      className="theme-toggle-btn"
      title={isDark ? "Passer au mode clair" : "Passer au mode sombre"}
    >
      {isDark ? (
        // Icône Soleil — shown when in dark mode to switch back to light
        <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/>
        </svg>
      ) : (
        // Icône Lune — shown when in light mode to switch to dark
        <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>
        </svg>
      )}
    </button>
  );
}

// Navbar : composant de navigation principal.
// Props:
//   - user : l'utilisateur connecté (ou null si non connecté)
//   - onLogout : callback pour réinitialiser l'auth state dans App.jsx
export default function Navbar({ user, onLogout }) {
  const navigate = useNavigate();
  const location = useLocation();

  // Vérifie si l'utilisateur courant a les droits admin
  const isAdmin = user?.role === "admin"

  // Gère la déconnexion : appel backend, clear localStorage, then redirect
  const handleLogout = async () => {
    const base = import.meta.env.VITE_BASE_PATH || '/app2';
    const routerBase = base.endsWith('/') && base.length > 1 ? base.slice(0, -1) : base;

    try {
      await fetch(`${routerBase}/api/auth/logout`, {
        method: "POST",
        credentials: "include" 
      });
    } catch (error) {
      console.error("Erreur lors de la deconnexion serveur :", error);
    } finally {
      navigate("/");
      localStorage.removeItem("server");
      onLogout(); // Resets user state in App.jsx
    }
  };

  return (
    // Classe spéciale sur la page /auth pour centrer le contenu de la navbar
    <nav className={`navbar ${location.pathname === '/auth' ? 'navbar-center-only' : ''}`}>
      <div className="navbar-brand">
        <Link to="/">ProxFleet</Link>
      </div>

      <div className="navbar-links">
        {/* Lien "Machines Virtuelles" — only shown when logged in */}
        {user && (
          <Link 
            to="/vms" 
            className={`nav-item ${location.pathname === '/vms' ? 'active' : ''}`}
          >
            Machines Virtuelles
          </Link>
        )}

        {/* Lien "Outils Avancés" — visible pour les admins ou users avec permissions spécifiques */}
        {(isAdmin || 
          user?.permissions?.can_modify_csv || 
          user?.permissions?.can_bulk_clone || 
          user?.permissions?.can_export_vms) && (
          <Link 
            to="/" 
            className={`nav-item ${location.pathname === '/' ? 'active' : ''}`}
          >
            Outils Avancés
          </Link>
        )}
      </div>

      <div className="navbar-right">
        <ThemeToggle />

        <div className="navbar-auth">
          {user ? (
            // Connecté : affiche le bouton de déconnexion
            <div className="user-menu">
              <button className="logout-btn" onClick={handleLogout}>Déconnexion</button>
            </div>
          ) : (
            // Not logged in : affiche le lien de connexion
            <Link to="/auth" className="login-btn">Connexion</Link>
          )}
        </div>
      </div>
    </nav>
  );
}

Navbar.propTypes = {
  onLogout: PropTypes.func,
  user: PropTypes.object
};
