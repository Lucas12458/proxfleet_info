import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import "../styles/userTable.css";

export default function UsersTable() {
  const [users, setUsers] = useState([]);

  useEffect(() => {
    fetch("/api/csv/assignments?csv_id=students_example.csv", {
      credentials: "include" // important si cookie de session
    })
      .then(res => res.json())
      .then(data => setUsers(data.data))
      .catch(err => console.error(err));
  }, []);

  return (
    <div className="userTable">
      <Link to="/auth">Page auth</Link>

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
            {users.map((u, i) => (
              <tr key={i}>
                <td>{u.promotion}</td>
                <td className="name">{u.nom}</td>
                <td>{u.prenom}</td>
                <td>{u.uid}</td>
                <td>{u.server_id}</td>
                <td>{u.server_name || "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
