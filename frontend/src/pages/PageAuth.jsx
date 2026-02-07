import {useState } from "react";
import "../styles/style_auth.css";

    
export default function Login() {
      const [username, setUsername] = useState("");
      const [password, setPassword] = useState("");
      const [server, setServer] = useState("pm-serv16");  // valeur par défaut
      const [error, setError] = useState("");
      const [ok, setOk] = useState(false);
    
      async function handleSubmit(e) {
        e.preventDefault();
    
        const res = await fetch("http://127.0.0.1:8000/auth/token", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            username,
            password,
            realm: "pam",
            hosts: [server]
          })
        });
    
        const data = await res.json();
        console.log(data);
        if (data.message === "Logged in") {
            setOk(true);
        } else {
            setError("Login incorrect");
        }

      }
    
      if (ok) {
        return <h2>Bienvenue 🔓</h2>;
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
