import { useState, useEffect } from "react";
import PropTypes from 'prop-types';


const BASE = import.meta.env.VITE_BASE_PATH || '/app2/';
const API_BASE = `${BASE}api`;

export function PermissionsModal({ isOpen, onClose, server, currentUser }) {
  const [users, setUsers] = useState([]);
  const [selectedUser, setSelectedUser] = useState("");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  
  const [permissions, setPermissions] = useState({
    can_modify_csv: false,
    can_bulk_clone: false,
    can_export_vms: false
  });

  const isEditingSelf = selectedUser === currentUser?.username;
    

  // Charger la liste des utilisateurs à l'ouverture de la modale
  useEffect(() => {
    if (isOpen) {
      fetchUsers();
    } else {
      // Reset state on close
      setSelectedUser("");
      setPermissions({ can_modify_csv: false, can_bulk_clone: false, can_export_vms: false, is_admin: false });
    }
  }, [isOpen]);

  // Charger les permissions spécifiques quand un utilisateur est sélectionné
  useEffect(() => {
    if (selectedUser) {
      fetchUserPermissions(selectedUser);
    } else {
      setPermissions({ can_modify_csv: false, can_bulk_clone: false, can_export_vms: false, is_admin: false });
    }
  }, [selectedUser]);

  const fetchUsers = async () => {
    setLoading(true);
    try {
        let targetServers = [];
        // 1. Get the list of all connected servers
        if (server === "all") {
            // On demande la liste des serveurs au backend
            const resServers = await fetch(`${API_BASE}/servers`, { credentials: "include" });
            const dataServers = await resServers.json();
            targetServers = dataServers.map(s => s.host);
            } else {
            targetServers = [server];
        }

        // 2. Parallel fetch for all users on each server
            const fetchPromises = targetServers.map(async (srv) => {
            try {
                const res = await fetch(`${API_BASE}/server/${srv}/users/`, { credentials: "include" });
                if (res.ok) {
                    return await res.json();
                }
            } catch (error) {
                console.error(`Error fetching users from ${srv}:`, error);
            }
            return [];
        });

        const results = await Promise.all(fetchPromises);

        // 3. Flatten and Deduplicate
        // We use a Set to ensure each username appears only once
        const allUsers = results.flat();
        const uniqueUserMap = new Map();

        allUsers.forEach(user => {
            if (user.userid && !uniqueUserMap.has(user.userid)) {
            uniqueUserMap.set(user.userid, { username: user.userid });
            }
        });

        // 4. Sort alphabetically and update state
        const sortedUsers = Array.from(uniqueUserMap.values()).sort((a, b) => 
            a.username.localeCompare(b.username)
        );

        setUsers(sortedUsers);

    } catch (error) {
        console.error("Global users fetch error:", error);
    } finally {
        setLoading(false);
    }
  };

  const fetchUserPermissions = async (username) => {
    setLoading(true);
    try {
      const response = await fetch(`${API_BASE}/user/${username}/permissions`, { credentials: "include" });
      if (response.ok) {
        const data = await response.json();
        setPermissions({
          can_modify_csv: data.can_modify_csv || false,
          can_bulk_clone: data.can_bulk_clone || false,
          can_export_vms: data.can_export_vms || false,
          is_admin: data.is_admin || false // Récupération du statut admin
        });
      }
    } catch (error) {
      console.error("Erreur lors du chargement des permissions", error);
    } finally {
      setLoading(false);
    }
  };

  const handleToggle = (permKey) => {
    setPermissions(prev => ({
      ...prev,
      [permKey]: !prev[permKey]
    }));
  };

  const handleSave = async () => {
    if (!selectedUser) return;
    
    setSaving(true);
    try {
      const response = await fetch(`${API_BASE}/user/${selectedUser}/permissions`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(permissions)
      });

      if (response.ok) {
        alert("Privilèges mis à jour avec succès.");
        onClose();
      } else {
        alert("Erreur lors de la mise à jour des privilèges.");
      }
    } catch (error) {
      console.error("Erreur réseau:", error);
      alert("Erreur réseau lors de la sauvegarde.");
    } finally {
      setSaving(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="modal-overlay">
      <div className="clone-container" style={{ maxWidth: "450px" }}>
        <h3 className="clone-title">Gérer les privilèges</h3>
        
        <div className="modal-body" style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
          
          <div className="form-group">
            <label htmlFor="user-select">Sélectionner un utilisateur</label>
            <select 
              id="user-select"
              className="create-input" 
              value={selectedUser} 
              onChange={(e) => setSelectedUser(e.target.value)}
              disabled={loading}
            >
              <option value="">-- Choisir un utilisateur --</option>
              {users.map((u, i) => (
                <option key={u.username || i} value={u.username}>{u.username}</option>
              ))}
            </select>
          </div>

          <div className="permissions-list" style={{ marginTop: "10px", padding: "15px", border: "1px solid var(--border-color)", borderRadius: "8px", backgroundColor: "var(--bg-surface)" }}>
            
            {/* Section Super Admin - Mise en évidence */}
            <div className="form-group" style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: "15px", paddingBottom: "15px", borderBottom: "1px solid var(--border-color)" }}>
              <div>
                <label htmlFor="admin-input" style={{ margin: 0, cursor: "pointer", fontWeight: "bold", color: permissions.is_admin ? "#ef4444" : "var(--text-main)" }}>
                  Administrateur Global
                </label>
                <div style={{ fontSize: "0.8em", color: "var(--text-muted)", marginTop: "4px" }}>
                  {isEditingSelf 
                    ? "Vous ne pouvez pas vous retirer vos propres droits d'administrateur." 
                    : "Donne un accès total au système et à la gestion des rôles."}
                </div>
              </div>
              <input 
                id="admin-input"
                type="checkbox" 
                checked={permissions.is_admin} 
                onChange={() => handleToggle('is_admin')}
                disabled={!selectedUser || loading || isEditingSelf}
                style={{ width: "20px", height: "20px", cursor: "pointer", accentColor: "#ef4444" }}
              />
            </div>

            {/* Privilèges spécifiques */}
            <div style={{ opacity: permissions.is_admin ? 0.5 : 1, transition: "opacity 0.2s" }}>
              <div className="form-group" style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: "10px" }}>
                <label htmlFor="modify-input" style={{ margin: 0, cursor: permissions.is_admin ? "not-allowed" : "pointer" }}>
                  Modifier les fichiers CSV
                </label>
                <input 
                  id="modify-input"
                  type="checkbox" 
                  checked={permissions.is_admin || permissions.can_modify_csv} 
                  onChange={() => handleToggle('can_modify_csv')}
                  disabled={!selectedUser || loading || isEditingSelf}
                  style={{ width: "18px", height: "18px", cursor: permissions.is_admin ? "not-allowed" : "pointer" }}
                />
              </div>

              <div className="form-group" style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: "10px" }}>
                <label htmlFor="bulk-input" style={{ margin: 0, cursor: permissions.is_admin ? "not-allowed" : "pointer" }}>
                  Cloner des VMs en lot
                </label>
                <input 
                  id="bulk-input"
                  type="checkbox" 
                  checked={permissions.is_admin || permissions.can_bulk_clone} 
                  onChange={() => handleToggle('can_bulk_clone')}
                  disabled={!selectedUser || loading || isEditingSelf}
                  style={{ width: "18px", height: "18px", cursor: permissions.is_admin ? "not-allowed" : "pointer" }}
                />
              </div>

              <div className="form-group" style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
                <label htmlFor="export-input" style={{ margin: 0, cursor: permissions.is_admin ? "not-allowed" : "pointer" }}>
                  Exporter des VMs (CSV)
                </label>
                <input 
                  id="export-input"
                  type="checkbox" 
                  checked={permissions.is_admin || permissions.can_export_vms} 
                  onChange={() => handleToggle('can_export_vms')}
                  disabled={!selectedUser || loading || isEditingSelf}
                  style={{ width: "18px", height: "18px", cursor: permissions.is_admin ? "not-allowed" : "pointer" }}
                />
              </div>
            </div>

          </div>

        </div>

        <div className="modal-footer">
          <button className="cancel-btn" onClick={onClose} disabled={saving}>Annuler</button>
          <button 
            className="confirm-btn create-btn" 
            onClick={handleSave}
            disabled={!selectedUser || saving || loading || isEditingSelf}
          >
            {saving ? "Sauvegarde..." : "Enregistrer"}
          </button>
        </div>
      </div>
    </div>
  );
}

PermissionsModal.propTypes = {
  currentUser: PropTypes.object,
  isOpen: PropTypes.bool,
  onClose: PropTypes.func,
  server: PropTypes.string
}