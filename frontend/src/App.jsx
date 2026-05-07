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
    const savedUser = sessionStorage.getItem("user_session");
    return savedUser ? JSON.parse(savedUser) : null;
  });

  const handleLogin = (userInfo) => {
    sessionStorage.setItem("user_session", JSON.stringify(userInfo));
    setCurrentUser(userInfo);
  };

  const handleLogout = () => {
    sessionStorage.removeItem("user_session");
    setCurrentUser(null);
  };
  

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
          <Route path="/auth" element={currentUser ? <Navigate to="/vms" /> : <Login onLogin={handleLogin} />} /></Routes>
      </main>
    </div>
  );
}