import { useEffect, useState } from "react";
import "../styles/userTable.css";

export default function UsersTable() {
  const [files, setUsers] = useState([]);
  const API_BASE = "/app2/api";


useEffect(() => {
  fetch(`${API_BASE}/csv/filename`, {
    credentials: "include"
  })
    .then(res => res.json())
    .then(data => {
    //console.log(data);
    
      setUsers(data.filenames || []);
    })
    .catch(err => console.error(err));
}, []);


    return (
    <div className="filesNames">
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Nom du fichier</th>
            </tr>
          </thead>
          <tbody>
            {files.map((filename, i) => (
              <tr key={i}>
                <a href="#" onClick={this.handleClick}>click me!</a>
                <td>{UsersTable(filename)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

