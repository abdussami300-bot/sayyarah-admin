"use client";

import { useState, useEffect } from "react";
import {
  subscribeDocumentVerifications,
  verifyCnic,
  rejectCnic,
  verifyLicense,
  rejectLicense,
} from "@/lib/documentVerificationService";
import { onAuthStateChanged } from "firebase/auth";
import { auth } from "@/lib/firebase";

export default function DocumentVerificationPage() {
  const [documents, setDocuments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState("NEEDS_REVIEW");
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedDoc, setSelectedDoc] = useState(null);
  const [adminEmail, setAdminEmail] = useState("admin@sayyarah.com");
  const [actionInProgress, setActionInProgress] = useState(false);
  const [previewImage, setPreviewImage] = useState(null);
  const [rejectionModal, setRejectionModal] = useState({ open: false, type: "", targetUser: null });
  const [rejectionReason, setRejectionReason] = useState("");

  useEffect(() => {
    const unsubAuth = onAuthStateChanged(auth, (user) => {
      if (user?.email) setAdminEmail(user.email);
    });

    const unsubDocs = subscribeDocumentVerifications(
      (data) => {
        setDocuments(data);
        setLoading(false);
      },
      (err) => {
        console.error(err);
        setLoading(false);
      }
    );

    return () => {
      unsubAuth();
      unsubDocs();
    };
  }, []);

  const handleVerifyCnic = async (userId) => {
    if (!confirm("Confirm CNIC document approval for this user?")) return;
    setActionInProgress(true);
    try {
      await verifyCnic(userId, adminEmail);
      if (selectedDoc?.id === userId) {
        setSelectedDoc((prev) => (prev ? { ...prev, cnicStatus: "VERIFIED" } : null));
      }
    } catch (err) {
      alert("Error: " + err.message);
    } finally {
      setActionInProgress(false);
    }
  };

  const handleVerifyLicense = async (userId) => {
    if (!confirm("Confirm Driving License approval for this user?")) return;
    setActionInProgress(true);
    try {
      await verifyLicense(userId, adminEmail);
      if (selectedDoc?.id === userId) {
        setSelectedDoc((prev) => (prev ? { ...prev, licenseStatus: "VERIFIED" } : null));
      }
    } catch (err) {
      alert("Error: " + err.message);
    } finally {
      setActionInProgress(false);
    }
  };

  const handleRejectSubmit = async () => {
    if (!rejectionModal.targetUser) return;
    setActionInProgress(true);
    try {
      if (rejectionModal.type === "cnic") {
        await rejectCnic(rejectionModal.targetUser.id, rejectionReason, adminEmail);
      } else {
        await rejectLicense(rejectionModal.targetUser.id, rejectionReason, adminEmail);
      }
      setRejectionModal({ open: false, type: "", targetUser: null });
      setRejectionReason("");
      setSelectedDoc(null);
    } catch (err) {
      alert("Error rejecting: " + err.message);
    } finally {
      setActionInProgress(false);
    }
  };

  const filteredDocs = documents.filter((item) => {
    // Tab filtering
    if (activeTab === "NEEDS_REVIEW") {
      const isCnicPending = item.cnicStatus === "PENDING_REVIEW" || item.cnicStatus === "UPDATED_REVIEW_REQUIRED";
      const isLicPending = item.licenseStatus === "PENDING_REVIEW" || item.licenseStatus === "UPDATED_REVIEW_REQUIRED";
      if (!isCnicPending && !isLicPending) return false;
    } else if (activeTab === "UPDATED") {
      if (!item.isCnicUpdated && !item.isLicenseUpdated) return false;
    } else if (activeTab === "VERIFIED") {
      if (item.cnicStatus !== "VERIFIED" && item.licenseStatus !== "VERIFIED") return false;
    } else if (activeTab === "CNIC_ONLY") {
      if (!item.cnicNumber && !item.cnicFrontUrl) return false;
    } else if (activeTab === "LICENSE_ONLY") {
      if (!item.licenseNumber && !item.licenseUrl) return false;
    }

    // Search query
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      const matchName = (item.name || "").toLowerCase().includes(q);
      const matchEmail = (item.email || "").toLowerCase().includes(q);
      const matchCnic = (item.cnicNumber || "").toLowerCase().includes(q);
      const matchLic = (item.licenseNumber || "").toLowerCase().includes(q);
      return matchName || matchEmail || matchCnic || matchLic;
    }

    return true;
  });

  const counts = {
    NEEDS_REVIEW: documents.filter(
      (d) =>
        d.cnicStatus === "PENDING_REVIEW" ||
        d.cnicStatus === "UPDATED_REVIEW_REQUIRED" ||
        d.licenseStatus === "PENDING_REVIEW" ||
        d.licenseStatus === "UPDATED_REVIEW_REQUIRED"
    ).length,
    UPDATED: documents.filter((d) => d.isCnicUpdated || d.isLicenseUpdated).length,
    VERIFIED: documents.filter((d) => d.cnicStatus === "VERIFIED" || d.licenseStatus === "VERIFIED").length,
    ALL: documents.length,
  };

  return (
    <div style={styles.container}>
      {/* Header */}
      <div style={styles.header}>
        <h1 style={styles.title}>Document Verification Queue</h1>
        <p style={styles.subtitle}>
          Verify National Identity Cards (CNIC) and Driving Licenses submitted by customers and vehicle hosts.
        </p>
      </div>

      {/* Tabs & Search */}
      <div style={styles.toolbar}>
        <div style={styles.tabs}>
          <button
            onClick={() => setActiveTab("NEEDS_REVIEW")}
            style={{
              ...styles.tabBtn,
              ...(activeTab === "NEEDS_REVIEW" ? styles.tabBtnActive : {}),
            }}
          >
            Needs Review ({counts.NEEDS_REVIEW})
          </button>
          <button
            onClick={() => setActiveTab("UPDATED")}
            style={{
              ...styles.tabBtn,
              ...(activeTab === "UPDATED" ? styles.tabBtnActive : {}),
            }}
          >
            Updated Re-uploads ({counts.UPDATED})
          </button>
          <button
            onClick={() => setActiveTab("VERIFIED")}
            style={{
              ...styles.tabBtn,
              ...(activeTab === "VERIFIED" ? styles.tabBtnActive : {}),
            }}
          >
            Verified ({counts.VERIFIED})
          </button>
          <button
            onClick={() => setActiveTab("CNIC_ONLY")}
            style={{
              ...styles.tabBtn,
              ...(activeTab === "CNIC_ONLY" ? styles.tabBtnActive : {}),
            }}
          >
            CNIC Queue
          </button>
          <button
            onClick={() => setActiveTab("LICENSE_ONLY")}
            style={{
              ...styles.tabBtn,
              ...(activeTab === "LICENSE_ONLY" ? styles.tabBtnActive : {}),
            }}
          >
            License Queue
          </button>
          <button
            onClick={() => setActiveTab("ALL")}
            style={{
              ...styles.tabBtn,
              ...(activeTab === "ALL" ? styles.tabBtnActive : {}),
            }}
          >
            All Submissions ({counts.ALL})
          </button>
        </div>

        <div style={styles.searchContainer}>
          <input
            type="text"
            placeholder="Search by user name, email, CNIC or license number..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            style={styles.searchInput}
          />
        </div>
      </div>

      {/* Table */}
      {loading ? (
        <div style={styles.loadingBox}>Loading identity documents...</div>
      ) : filteredDocs.length === 0 ? (
        <div style={styles.emptyBox}>
          <p style={{ fontSize: 16, color: "#fff", fontWeight: "bold" }}>No documents found</p>
          <p style={{ fontSize: 13, color: "#888" }}>
            {activeTab === "NEEDS_REVIEW"
              ? "All submitted identity documents are verified! Great job."
              : "No documents matching this filter."}
          </p>
        </div>
      ) : (
        <div style={styles.tableCard}>
          <table style={styles.table}>
            <thead>
              <tr style={styles.thRow}>
                <th style={styles.th}>User / Member</th>
                <th style={styles.th}>Role / Account</th>
                <th style={styles.th}>CNIC Status</th>
                <th style={styles.th}>License Status</th>
                <th style={styles.th}>Document Update Type</th>
                <th style={styles.th}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredDocs.map((item) => (
                <tr key={item.id} style={styles.tr}>
                  <td style={styles.td}>
                    <div style={{ fontWeight: 600, color: "#fff" }}>{item.name}</div>
                    <div style={{ fontSize: 12, color: "#888" }}>{item.email}</div>
                  </td>

                  <td style={styles.td}>
                    <span
                      style={{
                        ...styles.rolePill,
                        backgroundColor:
                          item.role === "owner"
                            ? "rgba(168, 85, 247, 0.15)"
                            : "rgba(59, 130, 246, 0.15)",
                        color: item.role === "owner" ? "#c084fc" : "#60a5fa",
                      }}
                    >
                      {item.role ? item.role.toUpperCase() : "CUSTOMER"}
                    </span>
                  </td>

                  <td style={styles.td}>
                    {item.cnicNumber ? (
                      <div>
                        <div style={{ fontSize: 12, color: "#ddd", fontFamily: "monospace" }}>
                          {item.cnicNumber}
                        </div>
                        <span
                          style={{
                            ...styles.statusBadge,
                            backgroundColor:
                              item.cnicStatus === "VERIFIED"
                                ? "rgba(34, 197, 94, 0.2)"
                                : item.cnicStatus === "UPDATED_REVIEW_REQUIRED"
                                ? "rgba(234, 179, 8, 0.2)"
                                : "rgba(59, 130, 246, 0.2)",
                            color:
                              item.cnicStatus === "VERIFIED"
                                ? "#4ade80"
                                : item.cnicStatus === "UPDATED_REVIEW_REQUIRED"
                                ? "#facc15"
                                : "#60a5fa",
                          }}
                        >
                          {item.cnicStatus}
                        </span>
                      </div>
                    ) : (
                      <span style={{ color: "#666", fontSize: 12 }}>None</span>
                    )}
                  </td>

                  <td style={styles.td}>
                    {item.licenseNumber ? (
                      <div>
                        <div style={{ fontSize: 12, color: "#ddd", fontFamily: "monospace" }}>
                          {item.licenseNumber}
                        </div>
                        <span
                          style={{
                            ...styles.statusBadge,
                            backgroundColor:
                              item.licenseStatus === "VERIFIED"
                                ? "rgba(34, 197, 94, 0.2)"
                                : item.licenseStatus === "UPDATED_REVIEW_REQUIRED"
                                ? "rgba(234, 179, 8, 0.2)"
                                : "rgba(59, 130, 246, 0.2)",
                            color:
                              item.licenseStatus === "VERIFIED"
                                ? "#4ade80"
                                : item.licenseStatus === "UPDATED_REVIEW_REQUIRED"
                                ? "#facc15"
                                : "#60a5fa",
                          }}
                        >
                          {item.licenseStatus}
                        </span>
                      </div>
                    ) : (
                      <span style={{ color: "#666", fontSize: 12 }}>None</span>
                    )}
                  </td>

                  <td style={styles.td}>
                    {item.isCnicUpdated || item.isLicenseUpdated ? (
                      <span style={styles.pillUpdated}>Photo Re-uploaded</span>
                    ) : (
                      <span style={styles.pillStandard}>Standard Submission</span>
                    )}
                  </td>

                  <td style={styles.td}>
                    <button
                      onClick={() => setSelectedDoc(item)}
                      style={styles.actionBtnInspect}
                    >
                      Inspect Documents
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* INSPECTION MODAL */}
      {selectedDoc && (
        <div style={styles.modalOverlay}>
          <div style={styles.modalContent}>
            <div style={styles.modalHeader}>
              <div>
                <h2 style={{ fontSize: 18, color: "#fff", margin: 0 }}>
                  Verification Dossier: {selectedDoc.name}
                </h2>
                <span style={{ fontSize: 12, color: "#888" }}>
                  Email: {selectedDoc.email} • UID: {selectedDoc.id}
                </span>
              </div>
              <button
                onClick={() => setSelectedDoc(null)}
                style={styles.modalCloseBtn}
              >
                ✕
              </button>
            </div>

            <div style={styles.modalBody}>
              {/* CNIC SECTION */}
              <div style={styles.cardSection}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <h3 style={styles.sectionHeading}>National Identity Card (CNIC)</h3>
                  <span
                    style={{
                      ...styles.statusBadge,
                      backgroundColor:
                        selectedDoc.cnicStatus === "VERIFIED"
                          ? "rgba(34, 197, 94, 0.2)"
                          : "rgba(234, 179, 8, 0.2)",
                      color: selectedDoc.cnicStatus === "VERIFIED" ? "#4ade80" : "#facc15",
                    }}
                  >
                    {selectedDoc.cnicStatus}
                  </span>
                </div>

                <div style={{ margin: "10px 0" }}>
                  <label style={styles.label}>13-Digit Number (Immutable)</label>
                  <div style={{ ...styles.value, fontFamily: "monospace", fontSize: 16 }}>
                    {selectedDoc.cnicNumber || "Not entered"}
                  </div>
                </div>

                <div style={{ display: "flex", gap: 14, marginTop: 12 }}>
                  <div style={styles.docBox}>
                    <span style={styles.docLabel}>CNIC Front</span>
                    {selectedDoc.cnicFrontUrl ? (
                      <img
                        src={selectedDoc.cnicFrontUrl}
                        alt="CNIC Front"
                        onClick={() => setPreviewImage(selectedDoc.cnicFrontUrl)}
                        style={styles.docThumb}
                      />
                    ) : (
                      <div style={styles.docPlaceholder}>No Front Photo</div>
                    )}
                  </div>
                  <div style={styles.docBox}>
                    <span style={styles.docLabel}>CNIC Back</span>
                    {selectedDoc.cnicBackUrl ? (
                      <img
                        src={selectedDoc.cnicBackUrl}
                        alt="CNIC Back"
                        onClick={() => setPreviewImage(selectedDoc.cnicBackUrl)}
                        style={styles.docThumb}
                      />
                    ) : (
                      <div style={styles.docPlaceholder}>No Back Photo</div>
                    )}
                  </div>
                </div>

                {selectedDoc.cnicStatus !== "VERIFIED" && selectedDoc.cnicNumber && (
                  <div style={{ display: "flex", gap: 10, marginTop: 14 }}>
                    <button
                      onClick={() => handleVerifyCnic(selectedDoc.id)}
                      disabled={actionInProgress}
                      style={styles.btnApproveLarge}
                    >
                      ✓ Verify CNIC
                    </button>
                    <button
                      onClick={() =>
                        setRejectionModal({ open: true, type: "cnic", targetUser: selectedDoc })
                      }
                      disabled={actionInProgress}
                      style={styles.btnRejectLarge}
                    >
                      Reject CNIC
                    </button>
                  </div>
                )}
              </div>

              {/* DRIVING LICENSE SECTION */}
              <div style={styles.cardSection}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <h3 style={styles.sectionHeading}>Driving License</h3>
                  <span
                    style={{
                      ...styles.statusBadge,
                      backgroundColor:
                        selectedDoc.licenseStatus === "VERIFIED"
                          ? "rgba(34, 197, 94, 0.2)"
                          : "rgba(234, 179, 8, 0.2)",
                      color: selectedDoc.licenseStatus === "VERIFIED" ? "#4ade80" : "#facc15",
                    }}
                  >
                    {selectedDoc.licenseStatus}
                  </span>
                </div>

                <div style={styles.grid2}>
                  <div>
                    <label style={styles.label}>License Number (Immutable)</label>
                    <div style={{ ...styles.value, fontFamily: "monospace" }}>
                      {selectedDoc.licenseNumber || "Not entered"}
                    </div>
                  </div>
                  <div>
                    <label style={styles.label}>Expiry Date</label>
                    <div style={styles.value}>{selectedDoc.licenseExpiry || "N/A"}</div>
                  </div>
                </div>

                <div style={{ marginTop: 12 }}>
                  <div style={{ ...styles.docBox, maxWidth: 300 }}>
                    <span style={styles.docLabel}>Driving License Photo</span>
                    {selectedDoc.licenseUrl ? (
                      <img
                        src={selectedDoc.licenseUrl}
                        alt="Driving License"
                        onClick={() => setPreviewImage(selectedDoc.licenseUrl)}
                        style={styles.docThumb}
                      />
                    ) : (
                      <div style={styles.docPlaceholder}>No License Photo</div>
                    )}
                  </div>
                </div>

                {selectedDoc.licenseStatus !== "VERIFIED" && selectedDoc.licenseNumber && (
                  <div style={{ display: "flex", gap: 10, marginTop: 14 }}>
                    <button
                      onClick={() => handleVerifyLicense(selectedDoc.id)}
                      disabled={actionInProgress}
                      style={styles.btnApproveLarge}
                    >
                      ✓ Verify License
                    </button>
                    <button
                      onClick={() =>
                        setRejectionModal({ open: true, type: "license", targetUser: selectedDoc })
                      }
                      disabled={actionInProgress}
                      style={styles.btnRejectLarge}
                    >
                      Reject License
                    </button>
                  </div>
                )}
              </div>
            </div>

            <div style={styles.modalFooter}>
              <button
                onClick={() => setSelectedDoc(null)}
                style={styles.btnCancel}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* REJECTION REASON MODAL */}
      {rejectionModal.open && (
        <div style={styles.modalOverlay}>
          <div style={{ ...styles.modalContent, maxWidth: 420 }}>
            <h3 style={{ color: "#fff", marginTop: 0 }}>
              Reject {rejectionModal.type === "cnic" ? "CNIC Document" : "Driving License"}
            </h3>
            <p style={{ color: "#aaa", fontSize: 13 }}>
              Enter reason for rejection. This will be visible to the user so they can correct their documents.
            </p>
            <textarea
              rows={4}
              value={rejectionReason}
              onChange={(e) => setRejectionReason(e.target.value)}
              placeholder="e.g. Blurry photo, expired license, or digits mismatch with card."
              style={styles.textarea}
            />
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 14 }}>
              <button
                onClick={() => setRejectionModal({ open: false, type: "", targetUser: null })}
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

      {/* FULL PHOTO VIEWER */}
      {previewImage && (
        <div style={styles.imageViewerOverlay} onClick={() => setPreviewImage(null)}>
          <div style={styles.imageViewerBox} onClick={(e) => e.stopPropagation()}>
            <img src={previewImage} alt="Document Zoom" style={styles.fullImage} />
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
  rolePill: {
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
  pillUpdated: {
    backgroundColor: "rgba(234, 179, 8, 0.15)",
    color: "#facc15",
    padding: "4px 8px",
    borderRadius: 6,
    fontSize: 11,
    fontWeight: 600,
  },
  pillStandard: {
    color: "#888",
    fontSize: 12,
  },
  actionBtnInspect: {
    backgroundColor: "#21262d",
    border: "1px solid #30363d",
    borderRadius: 6,
    color: "#c9d1d9",
    padding: "6px 12px",
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
    margin: 0,
  },
  grid2: {
    display: "grid",
    gridTemplateColumns: "1fr 1fr",
    gap: 12,
    marginTop: 10,
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
    height: 130,
    objectFit: "cover",
    borderRadius: 6,
    cursor: "pointer",
    border: "1px solid #30363d",
  },
  docPlaceholder: {
    width: "100%",
    height: 130,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    color: "#666",
    fontSize: 12,
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
  modalFooter: {
    display: "flex",
    justifyContent: "flex-end",
    borderTop: "1px solid #30363d",
    paddingTop: 16,
    marginTop: 20,
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
