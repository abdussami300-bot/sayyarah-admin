"use client";

import { useState, useEffect } from "react";
import {
  subscribeOwnerApplications,
  approveOwnerApplication,
  rejectOwnerApplication,
  requestOwnerCorrection,
} from "@/lib/ownerApplicationsService";
import { onAuthStateChanged } from "firebase/auth";
import { auth } from "@/lib/firebase";

export default function OwnerApplicationsPage() {
  const [applications, setApplications] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState("PENDING");
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedApp, setSelectedApp] = useState(null);
  const [adminEmail, setAdminEmail] = useState("admin@sayyarah.com");
  const [actionInProgress, setActionInProgress] = useState(false);
  const [rejectionModalOpen, setRejectionModalOpen] = useState(false);
  const [rejectionReason, setRejectionReason] = useState("");
  const [previewImage, setPreviewImage] = useState(null);

  useEffect(() => {
    const unsubAuth = onAuthStateChanged(auth, (user) => {
      if (user?.email) setAdminEmail(user.email);
    });

    const unsubApps = subscribeOwnerApplications(
      (data) => {
        setApplications(data);
        setLoading(false);
      },
      (err) => {
        console.error(err);
        setLoading(false);
      }
    );

    return () => {
      unsubAuth();
      unsubApps();
    };
  }, []);

  const handleApprove = async (app) => {
    if (!confirm(`Are you sure you want to approve ${app.name} as a SAYYARAH Owner?`)) return;
    setActionInProgress(true);
    try {
      await approveOwnerApplication(app.id, adminEmail);
      if (selectedApp?.id === app.id) setSelectedApp(null);
    } catch (err) {
      alert("Error approving owner: " + err.message);
    } finally {
      setActionInProgress(false);
    }
  };

  const handleRejectSubmit = async () => {
    if (!selectedApp) return;
    setActionInProgress(true);
    try {
      await rejectOwnerApplication(selectedApp.id, rejectionReason, adminEmail);
      setRejectionModalOpen(false);
      setRejectionReason("");
      setSelectedApp(null);
    } catch (err) {
      alert("Error rejecting application: " + err.message);
    } finally {
      setActionInProgress(false);
    }
  };

  const filteredApps = applications.filter((app) => {
    // Tab filter
    if (activeTab === "PENDING" && app.ownerStatus !== "PENDING_REVIEW") return false;
    if (activeTab === "APPROVED" && app.ownerStatus !== "APPROVED") return false;
    if (activeTab === "NEEDS_CORRECTION" && app.ownerStatus !== "NEEDS_CORRECTION") return false;
    if (activeTab === "REJECTED" && app.ownerStatus !== "REJECTED") return false;

    // Search query
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      const matchName = (app.name || "").toLowerCase().includes(q);
      const matchEmail = (app.email || "").toLowerCase().includes(q);
      const matchPhone = (app.phone || "").toLowerCase().includes(q);
      const matchCnic = (app.cnicNumber || "").toLowerCase().includes(q);
      const matchCar = (app.hostCar?.name || "").toLowerCase().includes(q);
      return matchName || matchEmail || matchPhone || matchCnic || matchCar;
    }
    return true;
  });

  const counts = {
    PENDING: applications.filter((a) => a.ownerStatus === "PENDING_REVIEW").length,
    APPROVED: applications.filter((a) => a.ownerStatus === "APPROVED").length,
    NEEDS_CORRECTION: applications.filter((a) => a.ownerStatus === "NEEDS_CORRECTION").length,
    REJECTED: applications.filter((a) => a.ownerStatus === "REJECTED").length,
    ALL: applications.length,
  };

  return (
    <div style={styles.container}>
      {/* Header */}
      <div style={styles.header}>
        <div>
          <h1 style={styles.title}>Owner Applications</h1>
          <p style={styles.subtitle}>
            Review customer applications requesting to become vehicle owners and list cars on SAYYARAH.
          </p>
        </div>
      </div>

      {/* Tabs & Search */}
      <div style={styles.toolbar}>
        <div style={styles.tabs}>
          <button
            onClick={() => setActiveTab("PENDING")}
            style={{
              ...styles.tabBtn,
              ...(activeTab === "PENDING" ? styles.tabBtnActive : {}),
            }}
          >
            Pending Review ({counts.PENDING})
          </button>
          <button
            onClick={() => setActiveTab("APPROVED")}
            style={{
              ...styles.tabBtn,
              ...(activeTab === "APPROVED" ? styles.tabBtnActive : {}),
            }}
          >
            Approved Owners ({counts.APPROVED})
          </button>
          <button
            onClick={() => setActiveTab("NEEDS_CORRECTION")}
            style={{
              ...styles.tabBtn,
              ...(activeTab === "NEEDS_CORRECTION" ? styles.tabBtnActive : {}),
            }}
          >
            Needs Correction ({counts.NEEDS_CORRECTION})
          </button>
          <button
            onClick={() => setActiveTab("REJECTED")}
            style={{
              ...styles.tabBtn,
              ...(activeTab === "REJECTED" ? styles.tabBtnActive : {}),
            }}
          >
            Rejected ({counts.REJECTED})
          </button>
          <button
            onClick={() => setActiveTab("ALL")}
            style={{
              ...styles.tabBtn,
              ...(activeTab === "ALL" ? styles.tabBtnActive : {}),
            }}
          >
            All Applications ({counts.ALL})
          </button>
        </div>

        <div style={styles.searchContainer}>
          <input
            type="text"
            placeholder="Search applicant name, email, phone, CNIC, car..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            style={styles.searchInput}
          />
        </div>
      </div>

      {/* Table / List */}
      {loading ? (
        <div style={styles.loadingBox}>Loading owner applications...</div>
      ) : filteredApps.length === 0 ? (
        <div style={styles.emptyBox}>
          <p style={{ fontSize: 16, color: "#fff", fontWeight: "bold" }}>No applications found</p>
          <p style={{ fontSize: 13, color: "#888" }}>
            {activeTab === "PENDING"
              ? "No pending owner applications requiring review at this time."
              : "Try adjusting your tab filter or search query."}
          </p>
        </div>
      ) : (
        <div style={styles.tableCard}>
          <table style={styles.table}>
            <thead>
              <tr style={styles.thRow}>
                <th style={styles.th}>Applicant</th>
                <th style={styles.th}>Applicant Type</th>
                <th style={styles.th}>Initial Vehicle</th>
                <th style={styles.th}>CNIC Verification</th>
                <th style={styles.th}>Owner Status</th>
                <th style={styles.th}>Submitted</th>
                <th style={styles.th}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredApps.map((app) => (
                <tr key={app.id} style={styles.tr}>
                  <td style={styles.td}>
                    <div style={{ fontWeight: 600, color: "#fff" }}>{app.name}</div>
                    <div style={{ fontSize: 12, color: "#888" }}>{app.email}</div>
                    <div style={{ fontSize: 11, color: "#aaa" }}>{app.phone || "No phone"}</div>
                  </td>

                  <td style={styles.td}>
                    {app.isNewUser ? (
                      <span style={styles.pillNewUser}>New User</span>
                    ) : (
                      <span style={styles.pillExisting}>Existing Customer Upgrade</span>
                    )}
                  </td>

                  <td style={styles.td}>
                    {app.hostCar ? (
                      <div>
                        <div style={{ fontWeight: 600, color: "#fff", fontSize: 13 }}>
                          {app.hostCar.name || `${app.hostCar.brand || ""} ${app.hostCar.model || ""}`}
                        </div>
                        <div style={{ fontSize: 11, color: "#4ade80" }}>
                          PKR {app.hostCar.price || "N/A"}
                        </div>
                      </div>
                    ) : (
                      <span style={{ color: "#666", fontSize: 12 }}>Profile Only</span>
                    )}
                  </td>

                  <td style={styles.td}>
                    {app.cnicNumber ? (
                      <div>
                        <div style={{ fontSize: 12, color: "#ddd", fontFamily: "monospace" }}>
                          {app.cnicNumber}
                        </div>
                        <span
                          style={{
                            ...styles.statusBadge,
                            backgroundColor:
                              app.cnicStatus === "VERIFIED"
                                ? "rgba(34, 197, 94, 0.2)"
                                : app.cnicStatus === "UPDATED_REVIEW_REQUIRED"
                                ? "rgba(234, 179, 8, 0.2)"
                                : "rgba(59, 130, 246, 0.2)",
                            color:
                              app.cnicStatus === "VERIFIED"
                                ? "#4ade80"
                                : app.cnicStatus === "UPDATED_REVIEW_REQUIRED"
                                ? "#facc15"
                                : "#60a5fa",
                          }}
                        >
                          {app.cnicStatus}
                        </span>
                      </div>
                    ) : (
                      <span style={{ color: "#666", fontSize: 12 }}>Not Submitted</span>
                    )}
                  </td>

                  <td style={styles.td}>
                    <span
                      style={{
                        ...styles.statusBadge,
                        backgroundColor:
                          app.ownerStatus === "APPROVED"
                            ? "rgba(34, 197, 94, 0.2)"
                            : app.ownerStatus === "REJECTED"
                            ? "rgba(239, 68, 68, 0.2)"
                            : app.ownerStatus === "NEEDS_CORRECTION"
                            ? "rgba(234, 179, 8, 0.2)"
                            : "rgba(59, 130, 246, 0.2)",
                        color:
                          app.ownerStatus === "APPROVED"
                            ? "#4ade80"
                            : app.ownerStatus === "REJECTED"
                            ? "#f87171"
                            : app.ownerStatus === "NEEDS_CORRECTION"
                            ? "#facc15"
                            : "#60a5fa",
                      }}
                    >
                      {app.ownerStatus}
                    </span>
                  </td>

                  <td style={styles.td}>
                    <span style={{ fontSize: 12, color: "#888" }}>
                      {app.submittedAt?.toDate
                        ? app.submittedAt.toDate().toLocaleDateString()
                        : "Recent"}
                    </span>
                  </td>

                  <td style={styles.td}>
                    <div style={{ display: "flex", gap: 6 }}>
                      <button
                        onClick={() => setSelectedApp(app)}
                        style={styles.actionBtnView}
                      >
                        Inspect
                      </button>

                      {app.ownerStatus === "PENDING_REVIEW" && (
                        <>
                          <button
                            onClick={() => handleApprove(app)}
                            disabled={actionInProgress}
                            style={styles.actionBtnApprove}
                          >
                            Approve
                          </button>
                          <button
                            onClick={() => {
                              setSelectedApp(app);
                              setRejectionModalOpen(true);
                            }}
                            disabled={actionInProgress}
                            style={styles.actionBtnReject}
                          >
                            Reject
                          </button>
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* INSPECTION DRAWER / MODAL */}
      {selectedApp && (
        <div style={styles.modalOverlay}>
          <div style={styles.modalContent}>
            <div style={styles.modalHeader}>
              <div>
                <h2 style={{ fontSize: 18, color: "#fff", margin: 0 }}>
                  Application: {selectedApp.name}
                </h2>
                <span style={{ fontSize: 12, color: "#888" }}>
                  UID: {selectedApp.id} • Status: {selectedApp.ownerStatus}
                </span>
              </div>
              <button
                onClick={() => setSelectedApp(null)}
                style={styles.modalCloseBtn}
              >
                ✕
              </button>
            </div>

            <div style={styles.modalBody}>
              {/* User Details */}
              <div style={styles.cardSection}>
                <h3 style={styles.sectionHeading}>Applicant Identity & Account</h3>
                <div style={styles.grid2}>
                  <div>
                    <label style={styles.label}>Full Name</label>
                    <div style={styles.value}>{selectedApp.name}</div>
                  </div>
                  <div>
                    <label style={styles.label}>Email Address</label>
                    <div style={styles.value}>{selectedApp.email}</div>
                  </div>
                  <div>
                    <label style={styles.label}>Phone Number</label>
                    <div style={styles.value}>{selectedApp.phone || "Not provided"}</div>
                  </div>
                  <div>
                    <label style={styles.label}>Registration Type</label>
                    <div style={styles.value}>
                      {selectedApp.isNewUser
                        ? "Brand New User"
                        : "Existing Customer Upgrading to Host"}
                    </div>
                  </div>
                </div>
              </div>

              {/* CNIC Documents */}
              <div style={styles.cardSection}>
                <h3 style={styles.sectionHeading}>CNIC Identity Documents</h3>
                <div style={{ marginBottom: 12 }}>
                  <label style={styles.label}>CNIC Number (Immutable)</label>
                  <div style={{ ...styles.value, fontFamily: "monospace", fontSize: 15 }}>
                    {selectedApp.cnicNumber || "Not submitted"}
                  </div>
                </div>

                <div style={{ display: "flex", gap: 14 }}>
                  <div style={styles.docBox}>
                    <span style={styles.docLabel}>Front Side Photo</span>
                    {selectedApp.cnicFrontUrl ? (
                      <img
                        src={selectedApp.cnicFrontUrl}
                        alt="CNIC Front"
                        onClick={() => setPreviewImage(selectedApp.cnicFrontUrl)}
                        style={styles.docThumb}
                      />
                    ) : (
                      <div style={styles.docPlaceholder}>No Front Photo</div>
                    )}
                  </div>

                  <div style={styles.docBox}>
                    <span style={styles.docLabel}>Back Side Photo</span>
                    {selectedApp.cnicBackUrl ? (
                      <img
                        src={selectedApp.cnicBackUrl}
                        alt="CNIC Back"
                        onClick={() => setPreviewImage(selectedApp.cnicBackUrl)}
                        style={styles.docThumb}
                      />
                    ) : (
                      <div style={styles.docPlaceholder}>No Back Photo</div>
                    )}
                  </div>
                </div>
              </div>

              {/* Vehicle to List */}
              {selectedApp.hostCar && (
                <div style={styles.cardSection}>
                  <h3 style={styles.sectionHeading}>Vehicle Listing Submitted with Application</h3>
                  <div style={styles.grid2}>
                    <div>
                      <label style={styles.label}>Vehicle Name</label>
                      <div style={styles.value}>{selectedApp.hostCar.name}</div>
                    </div>
                    <div>
                      <label style={styles.label}>Registration Number</label>
                      <div style={styles.value}>
                        {selectedApp.hostCar.registrationNumber || "N/A"}
                      </div>
                    </div>
                    <div>
                      <label style={styles.label}>Rental Price</label>
                      <div style={styles.value}>PKR {selectedApp.hostCar.price}</div>
                    </div>
                    <div>
                      <label style={styles.label}>Location / City</label>
                      <div style={styles.value}>{selectedApp.hostCar.location || "N/A"}</div>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Footer Actions */}
            <div style={styles.modalFooter}>
              {selectedApp.ownerStatus === "PENDING_REVIEW" && (
                <>
                  <button
                    onClick={() => handleApprove(selectedApp)}
                    disabled={actionInProgress}
                    style={styles.btnApproveLarge}
                  >
                    ✓ Approve as Owner
                  </button>
                  <button
                    onClick={() => {
                      const note = prompt("Enter correction instructions for user:");
                      if (note) {
                        requestOwnerCorrection(selectedApp.id, note, adminEmail);
                        setSelectedApp(null);
                      }
                    }}
                    disabled={actionInProgress}
                    style={styles.btnCorrectionLarge}
                  >
                    Request Corrections
                  </button>
                  <button
                    onClick={() => setRejectionModalOpen(true)}
                    disabled={actionInProgress}
                    style={styles.btnRejectLarge}
                  >
                    Reject Application
                  </button>
                </>
              )}
              <button
                onClick={() => setSelectedApp(null)}
                style={styles.btnCancel}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* REJECTION REASON MODAL */}
      {rejectionModalOpen && (
        <div style={styles.modalOverlay}>
          <div style={{ ...styles.modalContent, maxWidth: 440 }}>
            <h3 style={{ color: "#fff", marginTop: 0 }}>Reject Owner Application</h3>
            <p style={{ color: "#aaa", fontSize: 13 }}>
              Please specify the reason for declining this owner application. The user will remain an active Customer on SAYYARAH.
            </p>
            <textarea
              rows={4}
              value={rejectionReason}
              onChange={(e) => setRejectionReason(e.target.value)}
              placeholder="e.g. Unclear CNIC photo, invalid vehicle documents, or mismatched identity."
              style={styles.textarea}
            />
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 16 }}>
              <button
                onClick={() => setRejectionModalOpen(false)}
                style={styles.btnCancel}
              >
                Cancel
              </button>
              <button
                onClick={handleRejectSubmit}
                disabled={actionInProgress || !rejectionReason.trim()}
                style={styles.btnRejectLarge}
              >
                Confirm Rejection
              </button>
            </div>
          </div>
        </div>
      )}

      {/* FULL PHOTO PREVIEW MODAL */}
      {previewImage && (
        <div style={styles.imageViewerOverlay} onClick={() => setPreviewImage(null)}>
          <div style={styles.imageViewerBox} onClick={(e) => e.stopPropagation()}>
            <img src={previewImage} alt="Full Document" style={styles.fullImage} />
            <button
              onClick={() => setPreviewImage(null)}
              style={styles.imageViewerCloseBtn}
            >
              ✕ Close
            </button>
          </div>
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
    fontFamily: "inherit",
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
    display: "flex",
    flexDirection: "column",
    gap: 16,
    marginBottom: 20,
  },
  tabs: {
    display: "flex",
    gap: 8,
    borderBottom: "1px solid #21262d",
    paddingBottom: 8,
    flexWrap: "wrap",
  },
  tabBtn: {
    backgroundColor: "transparent",
    border: "1px solid #30363d",
    borderRadius: 8,
    padding: "8px 14px",
    color: "#8b949e",
    fontSize: 13,
    fontWeight: 500,
    cursor: "pointer",
    transition: "all 0.15s ease",
  },
  tabBtnActive: {
    backgroundColor: "rgba(56, 189, 248, 0.15)",
    borderColor: "#38bdf8",
    color: "#38bdf8",
  },
  searchContainer: {
    width: "100%",
  },
  searchInput: {
    width: "100%",
    maxWidth: 520,
    backgroundColor: "#161b22",
    border: "1px solid #30363d",
    borderRadius: 8,
    padding: "10px 14px",
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
    padding: "14px 16px",
    fontSize: 13,
    verticalAlign: "middle",
  },
  pillNewUser: {
    backgroundColor: "rgba(59, 130, 246, 0.15)",
    color: "#60a5fa",
    padding: "4px 8px",
    borderRadius: 6,
    fontSize: 11,
    fontWeight: 600,
  },
  pillExisting: {
    backgroundColor: "rgba(168, 85, 247, 0.15)",
    color: "#c084fc",
    padding: "4px 8px",
    borderRadius: 6,
    fontSize: 11,
    fontWeight: 600,
  },
  statusBadge: {
    display: "inline-block",
    padding: "3px 8px",
    borderRadius: 6,
    fontSize: 11,
    fontWeight: 600,
    marginTop: 3,
  },
  actionBtnView: {
    backgroundColor: "#21262d",
    border: "1px solid #30363d",
    borderRadius: 6,
    color: "#c9d1d9",
    padding: "6px 10px",
    fontSize: 12,
    fontWeight: 500,
    cursor: "pointer",
  },
  actionBtnApprove: {
    backgroundColor: "#238636",
    border: "none",
    borderRadius: 6,
    color: "#fff",
    padding: "6px 10px",
    fontSize: 12,
    fontWeight: 600,
    cursor: "pointer",
  },
  actionBtnReject: {
    backgroundColor: "rgba(239, 68, 68, 0.15)",
    border: "1px solid rgba(239, 68, 68, 0.4)",
    borderRadius: 6,
    color: "#f87171",
    padding: "6px 10px",
    fontSize: 12,
    fontWeight: 500,
    cursor: "pointer",
  },
  loadingBox: {
    padding: 40,
    textAlign: "center",
    color: "#888",
    fontSize: 14,
  },
  emptyBox: {
    padding: 60,
    textAlign: "center",
    backgroundColor: "#161b22",
    borderRadius: 12,
    border: "1px solid #30363d",
  },
  modalOverlay: {
    position: "fixed",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: "rgba(0, 0, 0, 0.75)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    zIndex: 9999,
    padding: 16,
  },
  modalContent: {
    backgroundColor: "#161b22",
    border: "1px solid #30363d",
    borderRadius: 14,
    width: "100%",
    maxWidth: 640,
    maxHeight: "90vh",
    overflowY: "auto",
    padding: 24,
  },
  modalHeader: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    borderBottom: "1px solid #30363d",
    paddingBottom: 14,
    marginBottom: 16,
  },
  modalCloseBtn: {
    background: "none",
    border: "none",
    color: "#888",
    fontSize: 18,
    cursor: "pointer",
  },
  modalBody: {
    display: "flex",
    flexDirection: "column",
    gap: 18,
  },
  cardSection: {
    backgroundColor: "#0d1117",
    padding: 16,
    borderRadius: 10,
    border: "1px solid #21262d",
  },
  sectionHeading: {
    fontSize: 13,
    fontWeight: 700,
    color: "#8b949e",
    textTransform: "uppercase",
    letterSpacing: "0.5px",
    margin: "0 0 12px 0",
  },
  grid2: {
    display: "grid",
    gridTemplateColumns: "1fr 1fr",
    gap: 12,
  },
  label: {
    fontSize: 11,
    color: "#8b949e",
    display: "block",
    marginBottom: 3,
  },
  value: {
    fontSize: 13,
    color: "#f0f6fc",
    fontWeight: 500,
  },
  docBox: {
    flex: 1,
    backgroundColor: "#161b22",
    borderRadius: 8,
    border: "1px solid #30363d",
    padding: 10,
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
  },
  docLabel: {
    fontSize: 11,
    color: "#8b949e",
    marginBottom: 8,
    fontWeight: 600,
  },
  docThumb: {
    width: "100%",
    height: 120,
    objectFit: "cover",
    borderRadius: 6,
    cursor: "pointer",
    border: "1px solid #30363d",
  },
  docPlaceholder: {
    width: "100%",
    height: 120,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    color: "#666",
    fontSize: 12,
  },
  modalFooter: {
    display: "flex",
    justifyContent: "flex-end",
    gap: 10,
    borderTop: "1px solid #30363d",
    paddingTop: 16,
    marginTop: 20,
  },
  btnApproveLarge: {
    backgroundColor: "#238636",
    color: "#fff",
    border: "none",
    borderRadius: 8,
    padding: "8px 16px",
    fontWeight: 600,
    fontSize: 13,
    cursor: "pointer",
  },
  btnCorrectionLarge: {
    backgroundColor: "rgba(234, 179, 8, 0.15)",
    border: "1px solid rgba(234, 179, 8, 0.4)",
    color: "#facc15",
    borderRadius: 8,
    padding: "8px 16px",
    fontWeight: 600,
    fontSize: 13,
    cursor: "pointer",
  },
  btnRejectLarge: {
    backgroundColor: "rgba(239, 68, 68, 0.15)",
    border: "1px solid rgba(239, 68, 68, 0.4)",
    color: "#f87171",
    borderRadius: 8,
    padding: "8px 16px",
    fontWeight: 600,
    fontSize: 13,
    cursor: "pointer",
  },
  btnCancel: {
    backgroundColor: "#21262d",
    border: "1px solid #30363d",
    borderRadius: 8,
    color: "#c9d1d9",
    padding: "8px 16px",
    fontWeight: 500,
    fontSize: 13,
    cursor: "pointer",
  },
  textarea: {
    width: "100%",
    backgroundColor: "#0d1117",
    border: "1px solid #30363d",
    borderRadius: 8,
    padding: 10,
    color: "#fff",
    fontSize: 13,
    marginTop: 10,
    outline: "none",
  },
  imageViewerOverlay: {
    position: "fixed",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: "rgba(0,0,0,0.85)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    zIndex: 10000,
  },
  imageViewerBox: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    gap: 12,
  },
  fullImage: {
    maxWidth: "85vw",
    maxHeight: "80vh",
    objectFit: "contain",
    borderRadius: 8,
    border: "2px solid #38bdf8",
  },
  imageViewerCloseBtn: {
    backgroundColor: "#21262d",
    color: "#fff",
    border: "none",
    padding: "8px 16px",
    borderRadius: 6,
    cursor: "pointer",
    fontSize: 13,
  },
};
