import { useState } from "react";
import ListVM from "./ListVM.jsx";
import "../styles/style_auth.css";

export default function Login() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [server, setServer] = useState("pm-serv16");
  const [error, setError] = useState("");
  const [vms, setVms] = useState(null);

  const API_BASE = "/app2/api";

  async function handleSubmit(e) {
    e.preventDefault();

    // LOGIN
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
    console.log("LOGIN:", data);

    if (data.message !== "Logged in") {
      setError("Login incorrect");
      return;
    }

    // Sauvegarder la session 
    localStorage.setItem("logged", "true"); 
    localStorage.setItem("server", server);
    
    // FETCH DES VMS
    const vmRes = await fetch(`${API_BASE}/server/${server}/vm`, {
      credentials: "include"
    });

    const vmData = await vmRes.json();
    console.log("VMS:", vmData);

    setVms(vmData);
  }

  // SI VMS CHARGÉES → ON AFFICHE ListVM
  if (vms) {
    return <ListVM server={server} vms={vms} />;
  }

  // SINON → FORMULAIRE DE LOGIN
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
