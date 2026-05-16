// PermissionsModal.jsx
// Modale réservée aux admins pour gérer les permissions des utilisateurs (admin-only).
// Liste tous les users Proxmox et permet de toggle leurs privilèges spécifiques.
// Prevents admins from removing their own admin rights.
// Updated : utilise un helper checkAuth pour gérer les erreurs 401 et 403.

import { useState, useEffect, useCallback } from "react";
import PropTypes from 'prop-types';

const BASE = import.meta.env.VITE_BASE_PATH || '/app2/';
const API_BASE = `${BASE}api`;

// Props:
//   - isOpen : si la modale est visible
//   - onClose : callback pour fermer
//   - server : serveur sélectionné ou "all" to fetch users from all servers
//   - currentUser : l'admin connecté (used to prevent self-demotion)
export function PermissionsModal({ isOpen, onClose, server, currentUser }) {
  const [users, setUsers] = useState([]);            // Tous les users Proxmox uniques
  const [selectedUser, setSelectedUser] = useState(""); // User actuellement sélectionné
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  // Helper centralisé pour détecter les erreurs d'auth — handles both 401 and 403
  // Redirige vers la page de connexion si la session est expirée ou supprimée
  const checkAuth = useCallback((res) => {
    if (res.status === 401 || res.status === 403) {
      sessionStorage.removeItem("user_session");
      globalThis.location.href = `${BASE}/auth`.replace(/\/+/g, '/');
      return false;
    }
    return true;
  }, [BASE]);

  // Flags de permissions pour le user sélectionné
  const [permissions, setPermissions] = useState({
    can_modify_csv: false,
    can_bulk_clone: false,
    can_export_vms: false
  });

  // Empêche l'admin de modifier ses propres permissions
  const isEditingSelf = selectedUser === currentUser?.username;

  // Charge la liste des users à l'ouverture — reset state on close
  useEffect(() => {
    if (isOpen) {
      fetchUsers();
    } else {
      setSelectedUser("");
      setPermissions({ can_modify_csv: false, can_bulk_clone: false, can_export_vms: false, is_admin: false });
    }
  }, [isOpen]);

  // Charge les permissions dès qu'un user différent est sélectionné
  useEffect(() => {
    if (selectedUser) {
      fetchUserPermissions(selectedUser);
    } else {
      setPermissions({ can_modify_csv: false, can_bulk_clone: false, can_export_vms: false, is_admin: false });
    }
  }, [selectedUser]);

  // Récupère tous les users depuis un ou plusieurs serveurs — deduplicated and sorted
  const fetchUsers = async () => {
    setLoading(true);
    try {
      let targetServers = [];

      if (server === "all") {
        const resServers = await fetch(`${API_BASE}/servers`, { credentials: "include" });
        const dataServers = await resServers.json();
        targetServers = dataServers.map(s => s.host);
      } else {
        targetServers = [server];
      }

      // Fetch users from all target servers in parallel
      const fetchPromises = targetServers.map(async (srv) => {
        try {
          const res = await fetch(`${API_BASE}/server/${srv}/users/`, { credentials: "include" });
          // Vérifie l'auth avant de traiter la réponse — redirects if expired/forbidden
          if (!checkAuth(res)) return null;
          if (res.ok) return await res.json();
        } catch (error) {
          console.error(`Error fetching users from ${srv}:`, error);
        }
        return [];
      });

      const results = await Promise.all(fetchPromises);

      // Aplatit, déduplique par userid, then sort alphabetically
      const allUsers = results.flat();
      const uniqueUserMap = new Map();

      allUsers.forEach(user => {
        if (user.userid && !uniqueUserMap.has(user.userid)) {
          uniqueUserMap.set(user.userid, { username: user.userid });
        }
      });

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

  // Récupère les permissions d'un user spécifique depuis le backend
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
          is_admin: data.is_admin || false
        });
      }
    } catch (error) {
      console.error("Erreur lors du chargement des permissions", error);
    } finally {
      setLoading(false);
    }
  };

  // Toggle un flag de permission dans le state local
  const handleToggle = (permKey) => {
    setPermissions(prev => ({
      ...prev,
      [permKey]: !prev[permKey]
    }));
  };

  // Sauvegarde les permissions mises à jour via une requête PUT
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

          {/* Menu déroulant de sélection d'utilisateur (user selector dropdown) */}
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

            {/* Toggle Admin Global — highlighted and separated from other permissions */}
            <div className="form-group" style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: "15px", paddingBottom: "15px", borderBottom: "1px solid var(--border-color)" }}>
              <div>
                <label htmlFor="admin-input" style={{ margin: 0, cursor: "pointer", fontWeight: "bold", color: permissions.is_admin ? "#ef4444" : "var(--text-main)" }}>
                  Administrateur Global
                </label>
                <div style={{ fontSize: "0.8em", color: "var(--text-muted)", marginTop: "4px" }}>
                  {/* Avertit l'admin s'il essaie de modifier ses propres droits */}
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

            {/* Privilèges spécifiques — dimmed when user is already admin */}
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
};
