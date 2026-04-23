import { useState } from "react";
import { Routes, Route, Navigate } from "react-router-dom";
import UsersTable from "./pages/UserTable";
import Login from "./pages/PageAuth";
import Names from "./pages/ListFilesNames";
import VMs from "./pages/PageVMs";
import Navbar from "./pages/NavBar";
import "./App.css";

export default function App() {
  // 1. Etat pour stocker l'utilisateur
  // On tente de recuperer la session depuis le localStorage au chargement (F5)
  const [currentUser, setCurrentUser] = useState(() => {
    const savedUser = localStorage.getItem("user_session");
    return savedUser ? JSON.parse(savedUser) : null;
  });

  // Fonction pour gerer la connexion (utilisée par PageAuth)
  const handleLogin = (userInfo) => {
    localStorage.setItem("user_session", JSON.stringify(userInfo));
    setCurrentUser(userInfo);
  };

  // Fonction pour gerer la deconnexion depuis la Navbar
  const handleLogout = () => {
    localStorage.removeItem("user_session");
    setCurrentUser(null);
  };

  // 2. Gestion vitale du sous-dossier pour Traefik (/app2)
  const base = import.meta.env.VITE_BASE_PATH || '/app2';
  const routerBase = base.endsWith('/') && base.length > 1 ? base.slice(0, -1) : base;

  return (
    <div className="app-container">
      {/* 3. La Navbar reste au-dessus des routes */}
      <Navbar user={currentUser} onLogout={handleLogout} />

      <main className="main-content">
        <Routes>
          {/* Protection simple : si pas d'user, on redirige vers /auth */}
          <Route path="/" element={currentUser ? <UsersTable user={currentUser} /> : <Navigate to="/auth" />} />
          <Route path="/files" element={currentUser ? <Names user={currentUser} /> : <Navigate to="/auth" />} />
          <Route path="/vms" element={currentUser ? <VMs user={currentUser} /> : <Navigate to="/auth" />} />
          
          {/* On passe la fonction "handleLogin" pour enregistrer la session */}
          <Route path="/auth" element={<Login onLogin={handleLogin} />} />
        </Routes>
      </main>
    </div>
  );
}