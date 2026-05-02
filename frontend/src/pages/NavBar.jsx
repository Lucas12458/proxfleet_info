// Navbar.jsx
import { Link, useNavigate, useLocation } from "react-router-dom";
import { useState, useEffect } from "react";
import "../styles/navbar.css";

export function ThemeToggle() {
  const [isDark, setIsDark] = useState(localStorage.getItem("theme") === "dark");

  useEffect(() => {
    const theme = isDark ? "dark" : "light";
    document.documentElement.setAttribute("data-theme", theme);
    localStorage.setItem("theme", theme);
  }, [isDark]);

  return (
    <button 
      onClick={() => setIsDark(!isDark)}
      className="theme-toggle-btn"
      title={isDark ? "Passer au mode clair" : "Passer au mode sombre"}
    >
      {isDark ? (
        /* Icône Soleil (pour repasser au clair) */
        <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/>
        </svg>
      ) : (
        /* Icône Lune (pour passer au sombre) */
        <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>
        </svg>
      )}
    </button>
  );
}

export default function Navbar({ user, onLogout }) {
  const navigate = useNavigate();
  const location = useLocation();

  const isAdmin = user?.role === "admin";

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
      onLogout();
    }
  };

  return (
    <nav className={`navbar ${location.pathname === '/auth' ? 'navbar-center-only' : ''}`}>
      <div className="navbar-brand">
        <Link to="/">ProxFleet</Link>
      </div>

      <div className="navbar-links">
        {isAdmin && (
          <Link 
            to="/" 
            className={`nav-item ${location.pathname === '/' ? 'active' : ''}`}
          >
            Gérer les CSV
          </Link>
        )}

        {user && (
          <Link 
            to="/vms" 
            className={`nav-item ${location.pathname === '/vms' ? 'active' : ''}`}
          >
            Machines Virtuelles
          </Link>
        )}
      </div>

      <div className="navbar-right">
       <ThemeToggle />

        <div className="navbar-auth">
          {user ? (
            <div className="user-menu">
              <span className="user-name">{user.nom}</span>
              <button className="logout-btn" onClick={handleLogout}>Déconnexion</button>
            </div>
          ) : (
            <Link to="/auth" className="login-btn">Connexion</Link>
          )}
        </div>
      </div>
    </nav>
  );
}