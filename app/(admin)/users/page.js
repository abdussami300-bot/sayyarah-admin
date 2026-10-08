"use client";

import { useState, useEffect, useMemo } from "react";
import { fetchUsers, subscribeUsers, updateUserRole } from "@/lib/usersService";
import { auth } from "@/lib/firebase";

export default function UsersPage() {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [roleFilter, setRoleFilter] = useState("all"); // "all" | "admin" | "host" | "customer"
  const [inspectUser, setInspectUser] = useState(null);

  // Role promotion / demotion state
  const [roleActionPrompt, setRoleActionPrompt] = useState(null); // { user, targetRole }
  const [roleUpdating, setRoleUpdating] = useState(false);
  const [actionAlert, setActionAlert] = useState(null); // { type: 'success' | 'error', text: '' }

  const currentAdminUid = auth.currentUser?.uid;

  const handleRoleChange = async () => {
    if (!roleActionPrompt?.user?.id || roleUpdating) return;
    const { user, targetRole } = roleActionPrompt;
    setRoleUpdating(true);
    setActionAlert(null);
    try {
      await updateUserRole(user.id, targetRole);
      setActionAlert({
        type: "success",
        text:
          targetRole === "admin"
            ? `✓ "${user.name || user.email}" has been successfully promoted to Admin! They now have full administrative privileges.`
            : `✓ "${user.name || user.email}" has been demoted to Customer.`,
      });
      if (inspectUser?.id === user.id) {
        setInspectUser((prev) => ({ ...prev, role: targetRole }));
      }
      setRoleActionPrompt(null);
    } catch (err) {
      console.error("Failed to update user role:", err);
      setActionAlert({
        type: "error",
        text: `Error updating user role: ${err.message || "Failed to update Firestore."}`,
      });
    } finally {
      setRoleUpdating(false);
    }
  };

  const loadUsers = async () => {
    setLoading(true);
    setError("");
    try {
      const data = await fetchUsers();
      setUsers(data);
    } catch (err) {
      console.error("Error loading users from Firestore:", err);
      setError(err.message || "Failed to load registered users from Firestore.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    setLoading(true);
    setError("");
    const unsubscribe = subscribeUsers(
      (data) => {
        setUsers(data);
        setLoading(false);
      },
      (err) => {
        console.error("Error subscribing to users in realtime:", err);
        setError(err.message || "Failed to load users from Firestore in real-time.");
        setLoading(false);
      }
    );

    return () => {
      if (typeof unsubscribe === "function") {
        unsubscribe();
      }
    };
  }, []);

  const counts = useMemo(() => {
    let admins = 0;
    let owners = 0;
    let customers = 0;
    let newUsers = 0;

    const now = Date.now();
    const threeDaysMs = 3 * 24 * 3600 * 1000;

    users.forEach((u) => {
      const r = (u.role || "").toLowerCase();
      const isOwner = u.isOwnerApproved === true || u.ownerStatus === "APPROVED";
      if (r === "admin") admins++;
      else if (isOwner) owners++;
      else customers++;

      const createdSec = u.createdAt?.seconds || 0;
      if (u.isNewUser === true || (createdSec > 0 && now - createdSec * 1000 < threeDaysMs)) {
        newUsers++;
      }
    });

    return { all: users.length, admins, owners, customers, newUsers };
  }, [users]);

  const filteredUsers = useMemo(() => {
    const now = Date.now();
    const threeDaysMs = 3 * 24 * 3600 * 1000;

    return users.filter((u) => {
      const r = (u.role || "").toLowerCase();
      const isOwner = u.isOwnerApproved === true || u.ownerStatus === "APPROVED";
      let matchesRole = true;
      if (roleFilter === "admin") matchesRole = r === "admin";
      else if (roleFilter === "owner" || roleFilter === "host") matchesRole = isOwner && r !== "admin";
      else if (roleFilter === "customer") matchesRole = !isOwner && r !== "admin";
      else if (roleFilter === "new") {
        const createdSec = u.createdAt?.seconds || 0;
        matchesRole = u.isNewUser === true || (createdSec > 0 && now - createdSec * 1000 < threeDaysMs);
      }

      if (!matchesRole) return false;

      if (!searchQuery.trim()) return true;
      const q = searchQuery.toLowerCase().trim();
      const name = (u.name || "").toLowerCase();
      const email = (u.email || "").toLowerCase();
      const phone = (u.phone || "").toLowerCase();
      const cnic = (u.cnicNumber || "").toLowerCase();
      return name.includes(q) || email.includes(q) || phone.includes(q) || cnic.includes(q);
    });
  }, [users, roleFilter, searchQuery]);

  return (
    <div style={styles.container}>
      {/* Header section matching Dashboard style */}
      <div style={styles.header}>
        <div style={styles.headerLeft}>
          <div style={styles.tagBadge}>USER MANAGEMENT</div>
          <h2 style={styles.title}>Registered Users</h2>
          <p style={styles.subtitle}>
            Live customer profiles, host credentials, and identity verification status from Firestore.
          </p>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
          <div style={styles.liveIndicator} title="Realtime Firestore synchronization active">
            <span style={styles.liveDot} />
            <span style={styles.liveText}>Live Sync</span>
          </div>
          <button onClick={loadUsers} style={styles.refreshBtn} title="Force reload users">
            🔄 Refresh
          </button>
        </div>
      </div>

      {/* Global Alert Notification Toast */}
      {actionAlert && (
        <div
          style={{
            ...styles.alertToast,
            backgroundColor:
              actionAlert.type === "success"
                ? "rgba(16, 185, 129, 0.15)"
                : "rgba(239, 68, 68, 0.15)",
            border:
              actionAlert.type === "success"
                ? "1px solid #10B981"
                : "1px solid #EF4444",
            color: actionAlert.type === "success" ? "#34D399" : "#F87171",
          }}
        >
          <span>{actionAlert.text}</span>
          <button
            onClick={() => setActionAlert(null)}
            style={styles.closeAlertBtn}
          >
            ✕
          </button>
        </div>
      )}

      {/* Filter and Search Bar */}
      {!loading && !error && (
        <div style={styles.controlsRow}>
          <div style={styles.filterBar}>
            <button
              onClick={() => setRoleFilter("all")}
              style={{
                ...styles.filterBtn,
                ...(roleFilter === "all" ? styles.filterBtnActive : {}),
              }}
            >
              All Users <span style={styles.tabCount}>{counts.all}</span>
            </button>
            <button
              onClick={() => setRoleFilter("customer")}
              style={{
                ...styles.filterBtn,
                ...(roleFilter === "customer" ? styles.filterBtnCustomerActive : {}),
              }}
            >
              👥 Customers <span style={styles.tabCountPurple}>{counts.customers}</span>
            </button>
            <button
              onClick={() => setRoleFilter("owner")}
              style={{
                ...styles.filterBtn,
                ...(roleFilter === "owner" ? styles.filterBtnHostActive : {}),
              }}
            >
              🚗 Owners <span style={styles.tabCountAmber}>{counts.owners}</span>
            </button>
            <button
              onClick={() => setRoleFilter("new")}
              style={{
                ...styles.filterBtn,
                ...(roleFilter === "new" ? styles.filterBtnActive : {}),
              }}
            >
              ✨ New Users <span style={styles.tabCount}>{counts.newUsers}</span>
            </button>
            <button
              onClick={() => setRoleFilter("admin")}
              style={{
                ...styles.filterBtn,
                ...(roleFilter === "admin" ? styles.filterBtnAdminActive : {}),
              }}
            >
              ⚡ Admins <span style={styles.tabCountCyan}>{counts.admins}</span>
            </button>
          </div>

          <div style={styles.searchWrapper}>
            <span style={styles.searchIcon}>🔍</span>
            <input
              type="text"
              placeholder="Search by name, email, phone, or CNIC..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              style={styles.searchInput}
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery("")}
                style={styles.clearSearchBtn}
              >
                ✕
              </button>
            )}
          </div>
        </div>
      )}

      {/* Loading State */}
      {loading && (
        <div style={styles.stateCard}>
          <div style={styles.spinner} />
          <p style={styles.stateTitle}>Loading users from Firestore...</p>
          <span style={styles.stateSubtitle}>Connecting to collection: users</span>
        </div>
      )}

      {/* Error State */}
      {!loading && error && (
        <div style={styles.errorCard}>
          <div style={styles.errorIcon}>⚠️</div>
          <div style={styles.errorContent}>
            <h4 style={styles.errorTitle}>Failed to Load Users</h4>
            <p style={styles.errorText}>{error}</p>
            <button onClick={loadUsers} style={styles.retryButton}>
              🔄 Retry Fetch
            </button>
          </div>
        </div>
      )}

      {/* Empty State */}
      {!loading && !error && users.length === 0 && (
        <div style={styles.stateCard}>
          <div style={styles.emptyIcon}>👥</div>
          <p style={styles.stateTitle}>No Registered Users Found</p>
          <span style={styles.stateSubtitle}>
            The Firestore <code>users</code> collection does not contain any user records yet.
          </span>
          <button onClick={loadUsers} style={styles.retryButton}>
            🔄 Refresh
          </button>
        </div>
      )}

      {/* Empty Filter State */}
      {!loading && !error && users.length > 0 && filteredUsers.length === 0 && (
        <div style={styles.stateCard}>
          <div style={styles.emptyIcon}>🔍</div>
          <p style={styles.stateTitle}>No Matching Users</p>
          <span style={styles.stateSubtitle}>
            No users match the selected role &quot;{roleFilter}&quot; and search keyword.
          </span>
          <button
            onClick={() => {
              setRoleFilter("all");
              setSearchQuery("");
            }}
            style={styles.retryButton}
          >
            Clear Filters
          </button>
        </div>
      )}

      {/* Users Table */}
      {!loading && !error && filteredUsers.length > 0 && (
        <div style={styles.tableCard}>
          <div style={styles.tableResponsive}>
            <table style={styles.table}>
              <thead>
                <tr style={styles.tableHeadRow}>
                  <th style={styles.th}>User</th>
                  <th style={styles.th}>Role</th>
                  <th style={styles.th}>Contact Phone</th>
                  <th style={styles.th}>Identity Verified</th>
                  <th style={styles.th}>Host Status</th>
                  <th style={styles.th}>Joined Date</th>
                  <th style={styles.th}>Action</th>
                </tr>
              </thead>
              <tbody>
                {filteredUsers.map((user, idx) => {
                  const displayName = user.name?.trim() || "Unnamed User";
                  const displayEmail = user.email?.trim() || "No email";
                  const initial = displayName.charAt(0).toUpperCase() || "U";
                  const role = user.role?.toLowerCase() || "customer";
                  const isVerified = user.isVerified;
                  const isHostVerified = user.isHostVerified;
                  const phone = user.phone || user.phoneNumber || "—";
                  const joinedDate = formatDate(user.createdAt);

                  return (
                    <tr
                      key={user.id || user.uid || idx}
                      style={{
                        ...styles.tableRow,
                        backgroundColor: idx % 2 === 0 ? "#1E1E1E" : "#1A1A1A",
                      }}
                    >
                      {/* Name & Email */}
                      <td style={styles.td}>
                        <div style={styles.userCell}>
                          <div style={styles.avatar}>{initial}</div>
                          <div style={styles.userDetails}>
                            <span style={styles.userName}>{displayName}</span>
                            <span style={styles.userEmail}>{displayEmail}</span>
                          </div>
                        </div>
                      </td>

                      {/* Role */}
                      <td style={styles.td}>
                        <span style={getRoleStyle(role)}>
                          {role === "owner" ? "HOST" : role.toUpperCase()}
                        </span>
                      </td>

                      {/* Contact Phone */}
                      <td style={styles.td}>
                        <span style={styles.phoneText}>{phone}</span>
                      </td>

                      {/* isVerified */}
                      <td style={styles.td}>
                        {isVerified === true ? (
                          <span style={styles.badgeVerified}>✓ Verified</span>
                        ) : (
                          <span style={styles.badgeUnverified}>✕ Unverified</span>
                        )}
                      </td>

                      {/* isHostVerified */}
                      <td style={styles.td}>
                        {isHostVerified === true || role === "owner" || role === "host" ? (
                          <span style={styles.badgeHostVerified}>✓ Host Active</span>
                        ) : (
                          <span style={styles.badgeNeutral}>Standard</span>
                        )}
                      </td>

                      {/* Joined Date */}
                      <td style={styles.td}>
                        <span style={styles.dateText}>{joinedDate}</span>
                      </td>

                      {/* Action */}
                      <td style={styles.td}>
                        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                          <button
                            onClick={() => setInspectUser(user)}
                            style={styles.inspectBtn}
                            title="View user details"
                          >
                            Details
                          </button>
                          {(user.id === currentAdminUid || user.uid === currentAdminUid) ? (
                            <span style={styles.selfBadge} title="You cannot change your own role">
                              🔒 You
                            </span>
                          ) : role === "admin" ? (
                            <button
                              onClick={() => setRoleActionPrompt({ user, targetRole: "customer" })}
                              disabled={roleUpdating}
                              style={styles.demoteBtn}
                              title="Demote this admin back to Customer"
                            >
                              Demote
                            </button>
                          ) : (
                            <button
                              onClick={() => setRoleActionPrompt({ user, targetRole: "admin" })}
                              disabled={roleUpdating}
                              style={styles.promoteBtn}
                              title="Promote this user to Admin"
                            >
                              Make Admin
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* User Details Modal */}
      {inspectUser && (
        <div style={styles.modalOverlay} onClick={() => setInspectUser(null)}>
          <div style={styles.modalContent} onClick={(e) => e.stopPropagation()}>
            <div style={styles.modalHeader}>
              <div style={styles.modalHeaderMeta}>
                <div style={styles.modalAvatar}>
                  {(inspectUser.name || "U").charAt(0).toUpperCase()}
                </div>
                <div>
                  <h3 style={styles.modalTitle}>{inspectUser.name || "Unnamed User"}</h3>
                  <span style={styles.modalSubtitle}>{inspectUser.email || "No email"}</span>
                </div>
              </div>
              <button
                onClick={() => setInspectUser(null)}
                style={styles.modalCloseBtn}
              >
                ✕
              </button>
            </div>

            <div style={styles.modalBody}>
              <div style={styles.metaGrid}>
                <div style={styles.metaItem}>
                  <span style={styles.metaLabel}>DOCUMENT ID (UID)</span>
                  <span style={styles.metaValue}>{inspectUser.id || inspectUser.uid}</span>
                </div>
                <div style={styles.metaItem}>
                  <span style={styles.metaLabel}>SYSTEM ROLE</span>
                  <span style={styles.metaValue}>
                    {(inspectUser.role || "customer").toUpperCase()}
                  </span>
                </div>
                <div style={styles.metaItem}>
                  <span style={styles.metaLabel}>PHONE NUMBER</span>
                  <span style={styles.metaValue}>
                    {inspectUser.phone || inspectUser.phoneNumber || "Not recorded"}
                  </span>
                </div>
                <div style={styles.metaItem}>
                  <span style={styles.metaLabel}>CNIC NUMBER</span>
                  <span style={styles.metaValue}>
                    {inspectUser.cnicNumber || "Not recorded"}
                  </span>
                </div>
                <div style={styles.metaItem}>
                  <span style={styles.metaLabel}>DRIVING LICENSE NUMBER</span>
                  <span style={styles.metaValue}>
                    {inspectUser.licenseNumber || "Not recorded"}
                  </span>
                </div>
                <div style={styles.metaItem}>
                  <span style={styles.metaLabel}>LICENSE EXPIRY</span>
                  <span style={styles.metaValue}>
                    {inspectUser.licenseExpiry || "Not recorded"}
                  </span>
                </div>
                <div style={styles.metaItem}>
                  <span style={styles.metaLabel}>IDENTITY VERIFIED</span>
                  <span style={styles.metaValue}>
                    {inspectUser.isVerified ? "✅ Yes (Verified)" : "❌ No (Unverified)"}
                  </span>
                </div>
                <div style={styles.metaItem}>
                  <span style={styles.metaLabel}>HOST PRIVILEGES</span>
                  <span style={styles.metaValue}>
                    {inspectUser.isHostVerified || inspectUser.role === "owner" || inspectUser.role === "host"
                      ? "✅ Active Host"
                      : "❌ Standard Customer"}
                  </span>
                </div>
                <div style={styles.metaItem}>
                  <span style={styles.metaLabel}>JOINED DATE</span>
                  <span style={styles.metaValue}>{formatDate(inspectUser.createdAt)}</span>
                </div>
                <div style={styles.metaItem}>
                  <span style={styles.metaLabel}>VERIFICATION STATUS</span>
                  <span style={styles.metaValue}>
                    {(inspectUser.verificationStatus || "unverified").toUpperCase()}
                  </span>
                </div>
              </div>
            </div>

            <div style={styles.modalFooter}>
              {(inspectUser.id !== currentAdminUid && inspectUser.uid !== currentAdminUid) && (
                inspectUser.role === "admin" ? (
                  <button
                    onClick={() => {
                      setRoleActionPrompt({ user: inspectUser, targetRole: "customer" });
                    }}
                    disabled={roleUpdating}
                    style={styles.modalDemoteBtn}
                  >
                    Demote to Customer
                  </button>
                ) : (
                  <button
                    onClick={() => {
                      setRoleActionPrompt({ user: inspectUser, targetRole: "admin" });
                    }}
                    disabled={roleUpdating}
                    style={styles.modalPromoteBtn}
                  >
                    Promote to Admin
                  </button>
                )
              )}
              <button
                onClick={() => setInspectUser(null)}
                style={styles.closeBtn}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Role Change Confirmation Modal */}
      {roleActionPrompt && (
        <div
          style={styles.confirmModalOverlay}
          onClick={() => !roleUpdating && setRoleActionPrompt(null)}
        >
          <div
            style={styles.confirmModalContent}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={styles.confirmModalHeader}>
              <div style={styles.confirmIconBox}>
                {roleActionPrompt.targetRole === "admin" ? "🛡️" : "⚠️"}
              </div>
              <h3 style={styles.confirmModalTitle}>
                {roleActionPrompt.targetRole === "admin"
                  ? "Promote User to Admin?"
                  : "Demote Admin to Customer?"}
              </h3>
            </div>
            <div style={styles.confirmModalBody}>
              <p style={styles.confirmModalDesc}>
                {roleActionPrompt.targetRole === "admin" ? (
                  <>
                    Are you sure you want to promote{" "}
                    <strong>{roleActionPrompt.user.name || "this user"}</strong> (
                    <code>{roleActionPrompt.user.email}</code>) to{" "}
                    <strong>System Admin</strong>?
                    <br />
                    <br />
                    They will gain full access to the Web Admin Panel, user
                    management, host verifications, and fleet approvals
                    immediately.
                  </>
                ) : (
                  <>
                    Are you sure you want to demote{" "}
                    <strong>{roleActionPrompt.user.name || "this user"}</strong> (
                    <code>{roleActionPrompt.user.email}</code>) back to{" "}
                    <strong>Customer</strong>?
                    <br />
                    <br />
                    Their admin privileges will be revoked immediately and they
                    will no longer be able to access this admin panel.
                  </>
                )}
              </p>
            </div>
            <div style={styles.confirmModalActions}>
              <button
                onClick={() => setRoleActionPrompt(null)}
                disabled={roleUpdating}
                style={styles.cancelBtn}
              >
                Cancel
              </button>
              <button
                onClick={handleRoleChange}
                disabled={roleUpdating}
                style={
                  roleActionPrompt.targetRole === "admin"
                    ? styles.confirmPromoteBtn
                    : styles.confirmDemoteBtn
                }
              >
                {roleUpdating
                  ? "Updating Firestore..."
                  : roleActionPrompt.targetRole === "admin"
                  ? "Yes, Promote to Admin"
                  : "Yes, Demote to Customer"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function formatDate(val) {
  if (!val) return "Not recorded";
  try {
    if (typeof val.toDate === "function") {
      return val.toDate().toLocaleDateString("en-US", {
        year: "numeric",
        month: "short",
        day: "numeric",
      });
    }
    if (val.seconds) {
      return new Date(val.seconds * 1000).toLocaleDateString("en-US", {
        year: "numeric",
        month: "short",
        day: "numeric",
      });
    }
    const d = new Date(val);
    if (!isNaN(d.getTime())) {
      return d.toLocaleDateString("en-US", {
        year: "numeric",
        month: "short",
        day: "numeric",
      });
    }
    return String(val);
  } catch {
    return String(val);
  }
}

function getRoleStyle(role) {
  const base = {
    display: "inline-block",
    padding: "3px 9px",
    borderRadius: "6px",
    fontSize: "11px",
    fontWeight: "700",
    letterSpacing: "0.5px",
  };

  switch (role) {
    case "admin":
      return {
        ...base,
        backgroundColor: "rgba(0, 180, 216, 0.16)",
        border: "1px solid rgba(0, 180, 216, 0.45)",
        color: "#00E5FF",
      };
    case "host":
    case "owner":
      return {
        ...base,
        backgroundColor: "rgba(245, 158, 11, 0.16)",
        border: "1px solid rgba(245, 158, 11, 0.45)",
        color: "#FBBF24",
      };
    default:
      return {
        ...base,
        backgroundColor: "rgba(168, 85, 247, 0.16)",
        border: "1px solid rgba(168, 85, 247, 0.45)",
        color: "#C084FC",
      };
  }
}

const styles = {
  container: {
    maxWidth: "1380px",
    margin: "0 auto",
  },
  header: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: "20px",
    flexWrap: "wrap",
    gap: "16px",
  },
  headerLeft: {
    display: "flex",
    flexDirection: "column",
    gap: "6px",
  },
  tagBadge: {
    display: "inline-block",
    alignSelf: "flex-start",
    backgroundColor: "rgba(0, 180, 216, 0.12)",
    color: "#00B4D8",
    padding: "4px 10px",
    borderRadius: "6px",
    fontSize: "11px",
    fontWeight: "700",
    letterSpacing: "1px",
    border: "1px solid rgba(0, 180, 216, 0.25)",
  },
  title: {
    fontSize: "26px",
    fontWeight: "800",
    color: "#FFFFFF",
    letterSpacing: "-0.5px",
    margin: "0",
  },
  subtitle: {
    fontSize: "14px",
    color: "#9CA3AF",
    margin: "0",
  },
  liveIndicator: {
    display: "inline-flex",
    alignItems: "center",
    gap: "8px",
    backgroundColor: "rgba(16, 185, 129, 0.12)",
    border: "1px solid rgba(16, 185, 129, 0.3)",
    padding: "6px 12px",
    borderRadius: "20px",
  },
  liveDot: {
    width: "8px",
    height: "8px",
    borderRadius: "50%",
    backgroundColor: "#10B981",
    boxShadow: "0 0 8px #10B981",
    display: "inline-block",
  },
  liveText: {
    color: "#34D399",
    fontSize: "12px",
    fontWeight: "600",
    letterSpacing: "0.4px",
  },
  refreshBtn: {
    backgroundColor: "#1E1E1E",
    border: "1px solid rgba(255, 255, 255, 0.12)",
    color: "#E0E0E0",
    padding: "8px 16px",
    borderRadius: "8px",
    fontSize: "13px",
    fontWeight: "600",
    cursor: "pointer",
    transition: "all 0.2s ease",
  },
  controlsRow: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    flexWrap: "wrap",
    gap: "16px",
    marginBottom: "24px",
  },
  filterBar: {
    display: "flex",
    gap: "8px",
    flexWrap: "wrap",
  },
  filterBtn: {
    backgroundColor: "#1E1E1E",
    border: "1px solid rgba(255, 255, 255, 0.08)",
    color: "#9CA3AF",
    padding: "8px 14px",
    borderRadius: "8px",
    fontSize: "13px",
    fontWeight: "600",
    cursor: "pointer",
    display: "flex",
    alignItems: "center",
    gap: "8px",
    transition: "all 0.2s ease",
  },
  filterBtnActive: {
    backgroundColor: "rgba(0, 180, 216, 0.15)",
    border: "1px solid #00B4D8",
    color: "#00E5FF",
  },
  filterBtnHostActive: {
    backgroundColor: "rgba(245, 158, 11, 0.15)",
    border: "1px solid #F59E0B",
    color: "#FBBF24",
  },
  filterBtnCustomerActive: {
    backgroundColor: "rgba(168, 85, 247, 0.15)",
    border: "1px solid #A855F7",
    color: "#C084FC",
  },
  filterBtnAdminActive: {
    backgroundColor: "rgba(0, 180, 216, 0.15)",
    border: "1px solid #00B4D8",
    color: "#00E5FF",
  },
  tabCount: {
    backgroundColor: "rgba(255, 255, 255, 0.08)",
    padding: "2px 6px",
    borderRadius: "10px",
    fontSize: "11px",
    color: "#FFFFFF",
  },
  tabCountAmber: {
    backgroundColor: "rgba(245, 158, 11, 0.25)",
    padding: "2px 6px",
    borderRadius: "10px",
    fontSize: "11px",
    color: "#FBBF24",
  },
  tabCountPurple: {
    backgroundColor: "rgba(168, 85, 247, 0.25)",
    padding: "2px 6px",
    borderRadius: "10px",
    fontSize: "11px",
    color: "#C084FC",
  },
  tabCountCyan: {
    backgroundColor: "rgba(0, 180, 216, 0.25)",
    padding: "2px 6px",
    borderRadius: "10px",
    fontSize: "11px",
    color: "#00E5FF",
  },
  searchWrapper: {
    position: "relative",
    minWidth: "280px",
    flex: "1",
    maxWidth: "420px",
  },
  searchIcon: {
    position: "absolute",
    left: "12px",
    top: "50%",
    transform: "translateY(-50%)",
    color: "#6B7280",
    fontSize: "14px",
    pointerEvents: "none",
  },
  searchInput: {
    width: "100%",
    backgroundColor: "#1E1E1E",
    border: "1px solid rgba(255, 255, 255, 0.1)",
    borderRadius: "8px",
    padding: "9px 34px 9px 34px",
    color: "#FFFFFF",
    fontSize: "13px",
    outline: "none",
  },
  clearSearchBtn: {
    position: "absolute",
    right: "10px",
    top: "50%",
    transform: "translateY(-50%)",
    background: "none",
    border: "none",
    color: "#9CA3AF",
    cursor: "pointer",
    fontSize: "12px",
  },
  tableCard: {
    backgroundColor: "#1E1E1E",
    borderRadius: "14px",
    border: "1px solid rgba(255, 255, 255, 0.08)",
    overflow: "hidden",
  },
  tableResponsive: {
    overflowX: "auto",
  },
  table: {
    width: "100%",
    borderCollapse: "collapse",
    textAlign: "left",
  },
  tableHeadRow: {
    borderBottom: "1px solid rgba(255, 255, 255, 0.08)",
    backgroundColor: "#181818",
  },
  th: {
    padding: "14px 18px",
    fontSize: "12px",
    fontWeight: "700",
    color: "#9CA3AF",
    letterSpacing: "0.5px",
    textTransform: "uppercase",
  },
  tableRow: {
    borderBottom: "1px solid rgba(255, 255, 255, 0.04)",
    transition: "background-color 0.15s ease",
  },
  td: {
    padding: "14px 18px",
    fontSize: "13px",
    verticalAlign: "middle",
  },
  userCell: {
    display: "flex",
    alignItems: "center",
    gap: "12px",
  },
  avatar: {
    width: "36px",
    height: "36px",
    borderRadius: "8px",
    backgroundColor: "rgba(0, 180, 216, 0.15)",
    color: "#00E5FF",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontWeight: "700",
    fontSize: "14px",
    flexShrink: 0,
    border: "1px solid rgba(0, 180, 216, 0.3)",
  },
  userDetails: {
    display: "flex",
    flexDirection: "column",
  },
  userName: {
    fontWeight: "600",
    color: "#FFFFFF",
    fontSize: "14px",
  },
  userEmail: {
    fontSize: "12px",
    color: "#9CA3AF",
  },
  phoneText: {
    color: "#D1D5DB",
    fontSize: "13px",
  },
  dateText: {
    color: "#9CA3AF",
    fontSize: "12px",
  },
  badgeVerified: {
    display: "inline-block",
    padding: "3px 8px",
    borderRadius: "6px",
    fontSize: "11px",
    fontWeight: "600",
    backgroundColor: "rgba(16, 185, 129, 0.15)",
    border: "1px solid rgba(16, 185, 129, 0.4)",
    color: "#34D399",
  },
  badgeUnverified: {
    display: "inline-block",
    padding: "3px 8px",
    borderRadius: "6px",
    fontSize: "11px",
    fontWeight: "600",
    backgroundColor: "rgba(255, 255, 255, 0.05)",
    border: "1px solid rgba(255, 255, 255, 0.1)",
    color: "#9CA3AF",
  },
  badgeHostVerified: {
    display: "inline-block",
    padding: "3px 8px",
    borderRadius: "6px",
    fontSize: "11px",
    fontWeight: "700",
    backgroundColor: "rgba(245, 158, 11, 0.15)",
    border: "1px solid rgba(245, 158, 11, 0.4)",
    color: "#FBBF24",
  },
  badgeNeutral: {
    display: "inline-block",
    padding: "3px 8px",
    borderRadius: "6px",
    fontSize: "11px",
    fontWeight: "500",
    backgroundColor: "rgba(255, 255, 255, 0.04)",
    color: "#6B7280",
  },
  inspectBtn: {
    backgroundColor: "transparent",
    border: "1px solid rgba(255, 255, 255, 0.15)",
    color: "#D1D5DB",
    padding: "5px 12px",
    borderRadius: "6px",
    fontSize: "12px",
    fontWeight: "600",
    cursor: "pointer",
  },
  stateCard: {
    backgroundColor: "#1E1E1E",
    border: "1px solid rgba(255, 255, 255, 0.08)",
    borderRadius: "14px",
    padding: "60px 24px",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    textAlign: "center",
    gap: "12px",
  },
  spinner: {
    width: "36px",
    height: "36px",
    border: "3px solid rgba(0, 180, 216, 0.2)",
    borderTopColor: "#00B4D8",
    borderRadius: "50%",
    animation: "spin 0.8s linear infinite",
  },
  emptyIcon: {
    fontSize: "36px",
  },
  stateTitle: {
    fontSize: "16px",
    fontWeight: "700",
    color: "#FFFFFF",
    margin: "0",
  },
  stateSubtitle: {
    fontSize: "13px",
    color: "#9CA3AF",
  },
  retryButton: {
    marginTop: "8px",
    backgroundColor: "#00B4D8",
    border: "none",
    color: "#FFFFFF",
    padding: "8px 18px",
    borderRadius: "8px",
    fontSize: "13px",
    fontWeight: "700",
    cursor: "pointer",
  },
  errorCard: {
    backgroundColor: "rgba(239, 68, 68, 0.1)",
    border: "1px solid rgba(239, 68, 68, 0.3)",
    borderRadius: "14px",
    padding: "24px",
    display: "flex",
    gap: "16px",
    alignItems: "flex-start",
  },
  errorIcon: {
    fontSize: "24px",
  },
  errorContent: {
    display: "flex",
    flexDirection: "column",
    gap: "6px",
  },
  errorTitle: {
    fontSize: "16px",
    fontWeight: "700",
    color: "#F87171",
    margin: "0",
  },
  errorText: {
    fontSize: "13px",
    color: "#FCA5A5",
    margin: "0",
  },
  modalOverlay: {
    position: "fixed",
    inset: 0,
    backgroundColor: "rgba(0, 0, 0, 0.8)",
    backdropFilter: "blur(4px)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    zIndex: 1000,
    padding: "20px",
  },
  modalContent: {
    backgroundColor: "#1E1E1E",
    border: "1px solid rgba(255, 255, 255, 0.12)",
    borderRadius: "16px",
    width: "100%",
    maxWidth: "600px",
    overflow: "hidden",
    boxShadow: "0 20px 40px rgba(0, 0, 0, 0.6)",
  },
  modalHeader: {
    padding: "18px 24px",
    borderBottom: "1px solid rgba(255, 255, 255, 0.08)",
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
  },
  modalHeaderMeta: {
    display: "flex",
    alignItems: "center",
    gap: "12px",
  },
  modalAvatar: {
    width: "40px",
    height: "40px",
    borderRadius: "8px",
    backgroundColor: "rgba(0, 180, 216, 0.2)",
    color: "#00E5FF",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontWeight: "700",
    fontSize: "16px",
  },
  modalTitle: {
    fontSize: "17px",
    fontWeight: "700",
    color: "#FFFFFF",
    margin: "0",
  },
  modalSubtitle: {
    fontSize: "12px",
    color: "#9CA3AF",
  },
  modalCloseBtn: {
    background: "none",
    border: "none",
    color: "#9CA3AF",
    fontSize: "18px",
    cursor: "pointer",
  },
  modalBody: {
    padding: "24px",
  },
  metaGrid: {
    display: "grid",
    gridTemplateColumns: "1fr 1fr",
    gap: "14px",
    backgroundColor: "#161616",
    borderRadius: "10px",
    padding: "16px",
  },
  metaItem: {
    display: "flex",
    flexDirection: "column",
    gap: "3px",
  },
  metaLabel: {
    fontSize: "10px",
    fontWeight: "700",
    color: "#6B7280",
    letterSpacing: "0.5px",
  },
  metaValue: {
    fontSize: "13px",
    color: "#E5E7EB",
    fontWeight: "500",
    wordBreak: "break-all",
  },
  modalFooter: {
    padding: "14px 24px",
    borderTop: "1px solid rgba(255, 255, 255, 0.08)",
    display: "flex",
    justifyContent: "flex-end",
    alignItems: "center",
    gap: "12px",
    backgroundColor: "#161616",
  },
  closeBtn: {
    backgroundColor: "#222222",
    color: "#E0E0E0",
    border: "1px solid rgba(255, 255, 255, 0.15)",
    padding: "8px 18px",
    borderRadius: "8px",
    fontSize: "13px",
    fontWeight: "600",
    cursor: "pointer",
  },
  selfBadge: {
    display: "inline-flex",
    alignItems: "center",
    gap: "4px",
    padding: "5px 10px",
    borderRadius: "6px",
    fontSize: "11px",
    fontWeight: "700",
    backgroundColor: "rgba(255, 255, 255, 0.05)",
    border: "1px solid rgba(255, 255, 255, 0.1)",
    color: "#9CA3AF",
  },
  promoteBtn: {
    backgroundColor: "rgba(0, 180, 216, 0.12)",
    border: "1px solid rgba(0, 180, 216, 0.45)",
    color: "#00E5FF",
    padding: "5px 12px",
    borderRadius: "6px",
    fontSize: "12px",
    fontWeight: "700",
    cursor: "pointer",
    transition: "all 0.15s ease",
  },
  demoteBtn: {
    backgroundColor: "rgba(239, 68, 68, 0.12)",
    border: "1px solid rgba(239, 68, 68, 0.4)",
    color: "#F87171",
    padding: "5px 12px",
    borderRadius: "6px",
    fontSize: "12px",
    fontWeight: "700",
    cursor: "pointer",
    transition: "all 0.15s ease",
  },
  modalPromoteBtn: {
    backgroundColor: "rgba(0, 180, 216, 0.2)",
    border: "1px solid #00B4D8",
    color: "#00E5FF",
    padding: "8px 16px",
    borderRadius: "8px",
    fontSize: "13px",
    fontWeight: "700",
    cursor: "pointer",
  },
  modalDemoteBtn: {
    backgroundColor: "rgba(239, 68, 68, 0.2)",
    border: "1px solid #EF4444",
    color: "#F87171",
    padding: "8px 16px",
    borderRadius: "8px",
    fontSize: "13px",
    fontWeight: "700",
    cursor: "pointer",
  },
  alertToast: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    padding: "12px 18px",
    borderRadius: "10px",
    border: "1px solid",
    marginBottom: "20px",
    fontSize: "14px",
    fontWeight: "500",
  },
  closeAlertBtn: {
    background: "none",
    border: "none",
    color: "inherit",
    fontSize: "16px",
    cursor: "pointer",
    padding: "0 4px",
  },
  confirmModalOverlay: {
    position: "fixed",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: "rgba(0, 0, 0, 0.82)",
    backdropFilter: "blur(6px)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    zIndex: 1100,
    padding: "20px",
  },
  confirmModalContent: {
    backgroundColor: "#1C1C1C",
    border: "1px solid rgba(255, 255, 255, 0.12)",
    borderRadius: "16px",
    maxWidth: "500px",
    width: "100%",
    overflow: "hidden",
    boxShadow: "0 25px 60px rgba(0, 0, 0, 0.7)",
  },
  confirmModalHeader: {
    padding: "20px 24px",
    borderBottom: "1px solid rgba(255, 255, 255, 0.08)",
    display: "flex",
    alignItems: "center",
    gap: "14px",
    backgroundColor: "#161616",
  },
  confirmIconBox: {
    fontSize: "24px",
  },
  confirmModalTitle: {
    fontSize: "18px",
    fontWeight: "700",
    color: "#FFFFFF",
    margin: 0,
  },
  confirmModalBody: {
    padding: "24px",
  },
  confirmModalDesc: {
    fontSize: "14px",
    color: "#D1D5DB",
    lineHeight: "1.6",
    margin: 0,
  },
  confirmModalActions: {
    padding: "16px 24px",
    borderTop: "1px solid rgba(255, 255, 255, 0.08)",
    display: "flex",
    justifyContent: "flex-end",
    gap: "12px",
    backgroundColor: "#161616",
  },
  cancelBtn: {
    backgroundColor: "#262626",
    color: "#D1D5DB",
    border: "1px solid rgba(255, 255, 255, 0.12)",
    padding: "9px 18px",
    borderRadius: "8px",
    fontSize: "13px",
    fontWeight: "600",
    cursor: "pointer",
  },
  confirmPromoteBtn: {
    backgroundColor: "#00B4D8",
    color: "#FFFFFF",
    border: "none",
    padding: "9px 20px",
    borderRadius: "8px",
    fontSize: "13px",
    fontWeight: "700",
    cursor: "pointer",
    boxShadow: "0 0 15px rgba(0, 180, 216, 0.35)",
  },
  confirmDemoteBtn: {
    backgroundColor: "#EF4444",
    color: "#FFFFFF",
    border: "none",
    padding: "9px 20px",
    borderRadius: "8px",
    fontSize: "13px",
    fontWeight: "700",
    cursor: "pointer",
    boxShadow: "0 0 15px rgba(239, 68, 68, 0.35)",
  },
};
