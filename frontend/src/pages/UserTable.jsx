import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import "../styles/userTable.css";

export default function UsersTable() {
  const [users, setUsers] = useState([]);
  const API_BASE = "/app2/api";


  useEffect(() => {
    fetch(`${API_BASE}/csv/read?csv_path=C%3A%5Ctmp%5Cuploads%5Cstudents_example.csv`, {
      credentials: "include" // important si cookie de session
    })
      .then(res => res.json())
      .then(data => {
        console.log(data);
        setUsers(data);})
      .catch(err => console.error(err));
  }, []);

  return (
    <div className="userTable">
      <Link to="/auth">Page auth</Link>
      <Link to="/files">FileNames</Link>

      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Promotion</th>
              <th>Nom</th>
              <th>Prénom</th>
              <th>UID</th>
              <th>Server ID</th>
              <th>Server Name</th>
            </tr>
          </thead>

          <tbody>
          {users && users.map((u, i) => (
              <tr key={i}>
              <td>{u.Promotion}</td>          
              <td className="name">{u.Nom}</td>
              <td>{u.Prenom || u.Prénom}</td>
              <td>{u.Serveur}</td>  
              <td>{u["Nom-serveur"] || "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
