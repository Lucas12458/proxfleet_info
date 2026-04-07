import { useState } from "react";
import {Routes, Route } from "react-router-dom";
import UsersTable from "./pages/UserTable";
import Login from "./pages/PageAuth";
import Names from "./pages/ListFilesNames";
import VMs from "./pages/PageVMs"
import Navbar from "./pages/NavBar"; // A adapter selon ton arborescence

import "./App.css";

export default function App() {
  // 1. Etat pour stocker l'utilisateur (null par defaut = non connecte)
  const [currentUser, setCurrentUser] = useState(null);

  // Fonction pour gerer la deconnexion depuis la Navbar
  const handleLogout = () => {
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
            {/* On passe "currentUser" aux pages pour qu'elles adaptent leur affichage */}
            <Route path="/" element={<UsersTable user={currentUser} />} />
            <Route path="/files" element={<Names user={currentUser} />} />
            <Route path="/vms" element={<VMs user={currentUser} />} />
            
            {/* On passe la fonction "setCurrentUser" pour que le Login puisse mettre a jour l'etat */}
            <Route path="/auth" element={<Login onLogin={setCurrentUser} />} />
          </Routes>
        </main>

      </div>
    
  );
}