import { useState, useEffect } from "react";
import ListVM from "./ListVM.jsx";
import "../styles/style_auth.css";

export default function Login() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [server, setServer] = useState("pm-serv16");
  const [error, setError] = useState("");
  const [vms, setVms] = useState(null);

  const API_BASE = "/app2/api";

  // Vérifier session existante
  useEffect(() => {
    fetch(`${API_BASE}/server/${server}/vm`, {
      credentials: "include"
    })
      .then(res => {
        if (!res.ok) throw new Error("Not logged");
        return res.json();
      })
      .then(data => {
        setVms(data);
      })
      .catch(() => {});
  }, []);

  async function handleSubmit(e) {
    e.preventDefault();

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

    const vmRes = await fetch(`${API_BASE}/server/${server}/vm`, {
      credentials: "include"
    });

    const vmData = await vmRes.json();
    setVms(vmData);
  }

  // LOGOUT
  async function handleLogout() {
    await fetch(`${API_BASE}/auth/logout`, {
      method: "POST",
      credentials: "include"
    });

    setVms(null); // retour login
  }

  if (vms) {
    return <ListVM server={server} vms={vms} onLogout={handleLogout} />;
  }

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

        <select value={server} onChange={(e) => setServer(e.target.value)}>
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
