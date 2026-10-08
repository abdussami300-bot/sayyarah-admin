"use client";

import { useState, useEffect } from "react";
import { subscribeAuditLogs, AUDIT_ACTIONS } from "@/lib/auditLogService";

export default function AuditLogsPage() {
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedActionFilter, setSelectedActionFilter] = useState("ALL");

  useEffect(() => {
    const unsub = subscribeAuditLogs(
      (data) => {
        setLogs(data);
        setLoading(false);
      },
      (err) => {
        console.error(err);
        setLoading(false);
      }
    );
    return () => unsub();
  }, []);

  const filteredLogs = logs.filter((log) => {
    if (selectedActionFilter !== "ALL" && log.action !== selectedActionFilter) {
      return false;
    }
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      const matchAction = (log.action || "").toLowerCase().includes(q);
      const matchAdmin = (log.adminEmail || "").toLowerCase().includes(q);
      const matchTarget = (log.targetId || "").toLowerCase().includes(q);
      const matchReason = (log.reason || "").toLowerCase().includes(q);
      return matchAction || matchAdmin || matchTarget || matchReason;
    }
    return true;
  });

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <h1 style={styles.title}>System Audit & Activity Logs</h1>
        <p style={styles.subtitle}>
          Real-time, immutable audit trail of administrative decisions, owner approvals, and document verifications.
        </p>
      </div>

      {/* Filters */}
      <div style={styles.toolbar}>
        <div style={styles.filterRow}>
          <select
            value={selectedActionFilter}
            onChange={(e) => setSelectedActionFilter(e.target.value)}
            style={styles.select}
          >
            <option value="ALL">All Actions</option>
            <option value={AUDIT_ACTIONS.OWNER_APPROVED}>Owner Approved</option>
            <option value={AUDIT_ACTIONS.OWNER_REJECTED}>Owner Rejected</option>
            <option value={AUDIT_ACTIONS.OWNER_CORRECTION_REQUESTED}>Owner Correction</option>
            <option value={AUDIT_ACTIONS.OWNER_SUSPENDED}>Owner Suspended</option>
            <option value={AUDIT_ACTIONS.CNIC_VERIFIED}>CNIC Verified</option>
            <option value={AUDIT_ACTIONS.CNIC_REJECTED}>CNIC Rejected</option>
            <option value={AUDIT_ACTIONS.LICENSE_VERIFIED}>License Verified</option>
            <option value={AUDIT_ACTIONS.LICENSE_REJECTED}>License Rejected</option>
            <option value={AUDIT_ACTIONS.CAR_APPROVED}>Car Approved</option>
            <option value={AUDIT_ACTIONS.CAR_REJECTED}>Car Rejected</option>
          </select>

          <input
            type="text"
            placeholder="Search by admin email, target ID, reason..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            style={styles.searchInput}
          />
        </div>
      </div>

      {/* Logs Table */}
      {loading ? (
        <div style={styles.loadingBox}>Streaming audit logs...</div>
      ) : filteredLogs.length === 0 ? (
        <div style={styles.emptyBox}>
          <p style={{ color: "#fff", fontWeight: "bold" }}>No logs recorded</p>
          <p style={{ color: "#888", fontSize: 13 }}>Administrative actions will automatically generate log entries here.</p>
        </div>
      ) : (
        <div style={styles.tableCard}>
          <table style={styles.table}>
            <thead>
              <tr style={styles.thRow}>
                <th style={styles.th}>Timestamp</th>
                <th style={styles.th}>Action</th>
                <th style={styles.th}>Admin Actor</th>
                <th style={styles.th}>Target Type</th>
                <th style={styles.th}>Target ID</th>
                <th style={styles.th}>Status Transition</th>
                <th style={styles.th}>Notes / Reason</th>
              </tr>
            </thead>
            <tbody>
              {filteredLogs.map((log) => (
                <tr key={log.id} style={styles.tr}>
                  <td style={{ ...styles.td, fontSize: 12, color: "#8b949e", whiteSpace: "nowrap" }}>
                    {log.dateFormatted}
                  </td>

                  <td style={styles.td}>
                    <span
                      style={{
                        ...styles.actionBadge,
                        backgroundColor:
                          log.action?.includes("APPROVED") || log.action?.includes("VERIFIED")
                            ? "rgba(34, 197, 94, 0.15)"
                            : log.action?.includes("REJECTED") || log.action?.includes("SUSPENDED")
                            ? "rgba(239, 68, 68, 0.15)"
                            : "rgba(59, 130, 246, 0.15)",
                        color:
                          log.action?.includes("APPROVED") || log.action?.includes("VERIFIED")
                            ? "#4ade80"
                            : log.action?.includes("REJECTED") || log.action?.includes("SUSPENDED")
                            ? "#f87171"
                            : "#60a5fa",
                      }}
                    >
                      {log.action}
                    </span>
                  </td>

                  <td style={{ ...styles.td, color: "#c9d1d9", fontSize: 12 }}>
                    {log.adminEmail || "Admin"}
                  </td>

                  <td style={{ ...styles.td, color: "#8b949e", fontSize: 12, textTransform: "capitalize" }}>
                    {log.targetType || "Entity"}
                  </td>

                  <td style={{ ...styles.td, fontFamily: "monospace", fontSize: 12, color: "#a5d6ff" }}>
                    {log.targetId ? log.targetId.substring(0, 12) + "..." : "N/A"}
                  </td>

                  <td style={styles.td}>
                    {log.previousStatus || log.newStatus ? (
                      <span style={{ fontSize: 12, color: "#ddd" }}>
                        <span style={{ color: "#888" }}>{log.previousStatus || "Initial"}</span>
                        {" → "}
                        <span style={{ color: "#38bdf8", fontWeight: 600 }}>{log.newStatus}</span>
                      </span>
                    ) : (
                      <span style={{ color: "#666", fontSize: 12 }}>-</span>
                    )}
                  </td>

                  <td style={{ ...styles.td, color: "#8b949e", fontSize: 12, maxWidth: 280 }}>
                    {log.reason || "Standard administrative execution."}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

const styles = {
  container: {
    padding: "24px 32px",
    backgroundColor: "#0d0f12",
    minHeight: "100vh",
    color: "#fff",
  },
  header: {
    marginBottom: 24,
  },
  title: {
    fontSize: 26,
    fontWeight: 700,
    margin: "0 0 6px 0",
    letterSpacing: "-0.5px",
  },
  subtitle: {
    fontSize: 14,
    color: "#8b949e",
    margin: 0,
  },
  toolbar: {
    marginBottom: 20,
  },
  filterRow: {
    display: "flex",
    gap: 12,
    flexWrap: "wrap",
  },
  select: {
    backgroundColor: "#161b22",
    border: "1px solid #30363d",
    borderRadius: 8,
    padding: "9px 14px",
    color: "#fff",
    fontSize: 13,
    outline: "none",
  },
  searchInput: {
    flex: 1,
    minWidth: 280,
    backgroundColor: "#161b22",
    border: "1px solid #30363d",
    borderRadius: 8,
    padding: "9px 14px",
    color: "#fff",
    fontSize: 13,
    outline: "none",
  },
  tableCard: {
    backgroundColor: "#161b22",
    border: "1px solid #30363d",
    borderRadius: 12,
    overflow: "hidden",
  },
  table: {
    width: "100%",
    borderCollapse: "collapse",
    textAlign: "left",
  },
  thRow: {
    backgroundColor: "#0d1117",
    borderBottom: "1px solid #30363d",
  },
  th: {
    padding: "12px 16px",
    fontSize: 12,
    fontWeight: 600,
    color: "#8b949e",
    textTransform: "uppercase",
    letterSpacing: "0.5px",
  },
  tr: {
    borderBottom: "1px solid #21262d",
  },
  td: {
    padding: "12px 16px",
    fontSize: 13,
    verticalAlign: "middle",
  },
  actionBadge: {
    display: "inline-block",
    padding: "3px 8px",
    borderRadius: 6,
    fontSize: 11,
    fontWeight: 600,
  },
  loadingBox: {
    padding: 40,
    textAlign: "center",
    color: "#888",
  },
  emptyBox: {
    padding: 60,
    textAlign: "center",
    backgroundColor: "#161b22",
    borderRadius: 12,
    border: "1px solid #30363d",
  },
};
