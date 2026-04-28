import { useState, useEffect } from "react";
import {Routes, Route, Navigate } from "react-router-dom";
import UsersTable from "./pages/UserTable";
import Login from "./pages/PageAuth";
import Names from "./pages/ListFilesNames";
import VMs from "./pages/PageVMs";
import Navbar from "./pages/NavBar";
import "./App.css";

export default function App() {
  const [currentUser, setCurrentUser] = useState(() => {
    const savedUser = localStorage.getItem("user_session");
    return savedUser ? JSON.parse(savedUser) : null;
  });

  const handleLogin = (userInfo) => {
    localStorage.setItem("user_session", JSON.stringify(userInfo));
    setCurrentUser(userInfo);
  };

  const handleLogout = () => {
    localStorage.removeItem("user_session");
    setCurrentUser(null);
  };
  
  // 2. Gestion vitale du sous-dossier pour Traefik (/app2)
  const base = import.meta.env.VITE_BASE_PATH || '/app2';
  const routerBase = base.endsWith('/') && base.length > 1 ? base.slice(0, -1) : base;


  useEffect(() => {
    const handleTabClose = () => {
      // On ne lance la deconnexion que si un utilisateur est bien connecte
      if (currentUser) {
        // Renseigne ici la bonne URL de ta route de logout backend
        const logoutUrl = `${routerBase}/api/auth/logout`; 

        fetch(logoutUrl, {
          method: "POST", // ou GET selon ce que ton API attend
          keepalive: true, // LE PARAMETRE MAGIQUE
          credentials: "include" // Pour envoyer les cookies de session s'il y en a
        }).catch(err => console.error("Erreur logout silencieux", err));
      }
    };

    // L'evenement pagehide est le plus fiable sur les navigateurs modernes
    // pour detecter la fermeture d'un onglet ou du navigateur
    window.addEventListener("pagehide", handleTabClose);

    // Nettoyage de l'ecouteur d'evenement
    return () => {
      window.removeEventListener("pagehide", handleTabClose);
    };
  }, [currentUser, routerBase]);

  
  return (
    <div className="app-container">
      <Navbar user={currentUser} onLogout={handleLogout} />

      <main className="main-content">
        <Routes>
          {/* Landing page: always accessible, read-only when not logged in */}
          <Route path="/" element={<UsersTable user={currentUser} />} />

          {/* Protected routes */}
          <Route path="/files" element={currentUser ? <Names user={currentUser} /> : <Navigate to="/auth" />} />
          <Route path="/vms" element={currentUser ? <VMs user={currentUser} /> : <Navigate to="/auth" />} />

         
          {/* Auth page: redirect to "/vms" if already logged in */}
          <Route path="/auth" element={currentUser ? <Navigate to="/vms" /> : <Login onLogin={handleLogin} />} />        </Routes>
      </main>
    </div>
  );
}