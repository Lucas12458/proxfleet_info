// App.jsx
// Composant racine de l'application (Root component).
// Gère l'état d'authentification (currentUser) stocké en sessionStorage,
// and defines the main routes of the app.

import { useState} from "react";
import {Routes, Route, Navigate } from "react-router-dom";
import UsersTable from "./pages/UserTable";
import Login from "./pages/PageAuth";
import Names from "./pages/ListFilesNames";
import VMs from "./pages/PageVMs";
import Navbar from "./pages/NavBar";
import "./App.css";

export default function App() {
  // Initialisation depuis sessionStorage pour survivre à un refresh de page
  const [currentUser, setCurrentUser] = useState(() => {
    const savedUser = sessionStorage.getItem("user_session");
    return savedUser ? JSON.parse(savedUser) : null;
  });

  // Called after a successful login — persiste les infos user et met à jour le state
  const handleLogin = (userInfo) => {
    sessionStorage.setItem("user_session", JSON.stringify(userInfo));
    setCurrentUser(userInfo);
  };

  // Appelé à la déconnexion : vide le sessionStorage and resets user state
  const handleLogout = () => {
    sessionStorage.removeItem("user_session");
    setCurrentUser(null);
  };

  return (
    <div className="app-container">
      {/* Navbar toujours visible — reçoit l'utilisateur courant + le handler de logout */}
      <Navbar user={currentUser} onLogout={handleLogout} />

      <main className="main-content">
        <Routes>
          {/* Page d'accueil : toujours accessible, read-only si non connecté */}
          <Route path="/" element={<UsersTable user={currentUser} />} />

          {/* Routes protégées — redirect to /auth if not logged in */}
          <Route path="/files" element={currentUser ? <Names user={currentUser} /> : <Navigate to="/auth" />} />
          <Route path="/vms" element={currentUser ? <VMs user={currentUser} /> : <Navigate to="/auth" />} />

          {/* Page auth : redirige vers /vms si déjà connecté */}
          <Route path="/auth" element={currentUser ? <Navigate to="/vms" /> : <Login onLogin={handleLogin} />} />
        </Routes>
      </main>
    </div>
  );
}
