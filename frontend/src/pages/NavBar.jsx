// Navbar.jsx
import { Link, useNavigate, useLocation } from "react-router-dom";
import "../styles/navbar.css";

export default function Navbar({ user, onLogout }) {
  const navigate = useNavigate();
  const location = useLocation(); // Permet de savoir sur quelle page on est

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

         {/* Seuls les admins voient l'onglet CSV */}
        {isAdmin && (
          <Link 
            to="/" 
            className={`nav-item ${location.pathname === '/' ? 'active' : ''}`}
          >
            Gérer les CSV
          </Link>
        )}

        {/* Tout le monde (connecté) peut voir les VMs */}
        {user && (
          <Link 
            to="/vms" 
            className={`nav-item ${location.pathname === '/vms' ? 'active' : ''}`}
          >
            Machines Virtuelles
          </Link>
        )}

       
      </div>

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
    </nav>
  );
}