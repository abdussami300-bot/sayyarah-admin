"use client";

import { useState, useEffect, useMemo } from "react";
import {
  fetchHostApprovals,
  subscribeHostApprovals,
  approveHostVerification,
  rejectHostVerification,
} from "@/lib/hostApprovalsService";
import { auth } from "@/lib/firebase";

const isImageSrc = (url) => {
  if (!url || typeof url !== "string") return false;
  const s = url.trim();
  return (
    s.startsWith("http://") ||
    s.startsWith("https://") ||
    s.startsWith("data:image/") ||
    s.startsWith("blob:")
  );
};

export default function HostApprovalsPage() {
  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [filter, setFilter] = useState("all"); // "all" | "pending" | "verified" | "rejected"
  const [categoryFilter, setCategoryFilter] = useState("all"); // "all" | "hosts" | "customers"
  const [userOriginFilter, setUserOriginFilter] = useState("all"); // "all" | "existing" | "new"
  const [searchQuery, setSearchQuery] = useState("");

  // Processing state per user: { [userId]: boolean }
  const [processingId, setProcessingId] = useState(null);
  const [actionAlert, setActionAlert] = useState(null); // { type: 'success' | 'error', text: '' }

  // Modal inspection state
  const [inspectingItem, setInspectingItem] = useState(null);
  const [activeImagePreview, setActiveImagePreview] = useState(null);

  // Reject modal state
  const [rejectingItem, setRejectingItem] = useState(null);
  const [rejectReason, setRejectReason] = useState("");
  const [selectedIssues, setSelectedIssues] = useState([]);

  const issueOptions = [
    "Blurry CNIC Front photo",
    "Blurry or illegible CNIC Back photo",
    "Driving License is expired",
    "License photo is cropped or unclear",
    "Name does not match identity document",
    "Vehicle registration documents missing",
  ];

  const loadRecords = async () => {
    setLoading(true);
    setError("");
    try {
      const data = await fetchHostApprovals();
      setRecords(data);
    } catch (err) {
      console.error("Error loading host approvals:", err);
      setError(err.message || "Failed to load host verification records from Firestore.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    setLoading(true);
    setError("");
    const unsubscribe = subscribeHostApprovals(
      (data) => {
        setRecords(data);
        setLoading(false);
      },
      (err) => {
        console.error("Error subscribing to host approvals in real-time:", err);
        setError(err.message || "Failed to load host verification records from Firestore in real-time.");
        setLoading(false);
      }
    );

    return () => {
      if (typeof unsubscribe === "function") {
        unsubscribe();
      }
    };
  }, []);

  // Compute status counts for filter badges
  const counts = useMemo(() => {
    let pending = 0;
    let verified = 0;
    let rejected = 0;
    let hosts = 0;
    let customers = 0;
    let existingUsers = 0;
    let newUsers = 0;

    records.forEach((item) => {
      const status = (item.verificationStatus || "").toLowerCase();
      if (status === "pending" || status === "in_review") {
        pending++;
      } else if (status === "verified" || status === "approved" || item.isHostVerified === true) {
        verified++;
      } else if (status === "rejected" || status === "declined") {
        rejected++;
      }

      if (item.isExplicitHost || item.roleCategory === "host") {
        hosts++;
      } else {
        customers++;
      }

      if (item.isExistingUser) {
        existingUsers++;
      } else {
        newUsers++;
      }
    });

    return {
      all: records.length,
      pending,
      verified,
      rejected,
      hosts,
      customers,
      existingUsers,
      newUsers,
    };
  }, [records]);

  // Filtered & searched records
  const filteredRecords = useMemo(() => {
    return records.filter((item) => {
      const status = (item.verificationStatus || "").toLowerCase();
      let matchesFilter = true;
      if (filter === "pending") {
        matchesFilter = status === "pending" || status === "in_review";
      } else if (filter === "verified") {
        matchesFilter = status === "verified" || status === "approved" || item.isHostVerified === true;
      } else if (filter === "rejected") {
        matchesFilter = status === "rejected" || status === "declined";
      }

      if (!matchesFilter) return false;

      // Category filter (Host vs Customer)
      if (categoryFilter === "hosts" && !item.isExplicitHost && item.roleCategory !== "host") {
        return false;
      }
      if (categoryFilter === "customers" && (item.isExplicitHost || item.roleCategory === "host")) {
        return false;
      }

      // User account origin filter (Existing updated vs New)
      if (userOriginFilter === "existing" && !item.isExistingUser) {
        return false;
      }
      if (userOriginFilter === "new" && item.isExistingUser) {
        return false;
      }

      if (!searchQuery.trim()) return true;
      const q = searchQuery.toLowerCase().trim();
      const name = (item.name || "").toLowerCase();
      const email = (item.email || "").toLowerCase();
      const cnic = (item.cnicNumber || "").toLowerCase();
      const license = (item.licenseNumber || "").toLowerCase();
      const phone = (item.phone || item.phoneNumber || "").toLowerCase();
      return (
        name.includes(q) ||
        email.includes(q) ||
        cnic.includes(q) ||
        license.includes(q) ||
        phone.includes(q)
      );
    });
  }, [records, filter, categoryFilter, userOriginFilter, searchQuery]);

  // Handle Approve Action
  const handleApprove = async (item, approveAttachedCars = false) => {
    if (!item?.id || processingId) return;

    const adminUser = auth.currentUser;
    const adminIdentifier = adminUser?.email || adminUser?.uid || "admin";

    setProcessingId(item.id);
    setActionAlert(null);

    try {
      await approveHostVerification(item.id, adminIdentifier, approveAttachedCars);

      // Update state locally immediately
      setRecords((prev) =>
        prev.map((rec) => {
          if (rec.id === item.id) {
            return {
              ...rec,
              verificationStatus: "verified",
              isVerified: true,
              isHostVerified: true,
              role: "owner",
            };
          }
          return rec;
        })
      );

      setActionAlert({
        type: "success",
        text: `✓ Successfully approved host "${item.name || item.email}". Host mode has been activated in the mobile app!`,
      });

      if (inspectingItem?.id === item.id) {
        setInspectingItem((prev) => ({
          ...prev,
          verificationStatus: "verified",
          isVerified: true,
          isHostVerified: true,
          role: "owner",
        }));
      }
    } catch (err) {
      console.error("Failed to approve host:", err);
      setActionAlert({
        type: "error",
        text: `Error approving host: ${err.message || "Failed to update Firestore."}`,
      });
    } finally {
      setProcessingId(null);
    }
  };

  // Open Reject Modal
  const openRejectModal = (item) => {
    setRejectingItem(item);
    setRejectReason(item.rejectionReason || "Identity or driving documents require clarification.");
    setSelectedIssues(item.rejectionIssues || []);
  };

  const toggleIssue = (issue) => {
    setSelectedIssues((prev) =>
      prev.includes(issue) ? prev.filter((i) => i !== issue) : [...prev, issue]
    );
  };

  // Confirm Rejection
  const handleConfirmReject = async () => {
    if (!rejectingItem || processingId) return;

    const adminUser = auth.currentUser;
    const adminIdentifier = adminUser?.email || adminUser?.uid || "admin";
    const targetId = rejectingItem.id;

    setProcessingId(targetId);
    setActionAlert(null);

    try {
      await rejectHostVerification(targetId, adminIdentifier, rejectReason, selectedIssues);

      setRecords((prev) =>
        prev.map((rec) => {
          if (rec.id === targetId) {
            return {
              ...rec,
              verificationStatus: "rejected",
              isVerified: false,
              isHostVerified: false,
              rejectionReason: rejectReason,
              rejectionIssues: selectedIssues,
            };
          }
          return rec;
        })
      );

      setActionAlert({
        type: "success",
        text: `Host application for "${rejectingItem.name || rejectingItem.email}" marked as rejected. The user has been notified with the reason.`,
      });

      if (inspectingItem?.id === targetId) {
        setInspectingItem((prev) => ({
          ...prev,
          verificationStatus: "rejected",
          isVerified: false,
          isHostVerified: false,
          rejectionReason: rejectReason,
          rejectionIssues: selectedIssues,
        }));
      }

      setRejectingItem(null);
    } catch (err) {
      console.error("Failed to reject host:", err);
      setActionAlert({
        type: "error",
        text: `Error rejecting host: ${err.message || "Failed to update Firestore."}`,
      });
    } finally {
      setProcessingId(null);
    }
  };

  return (
    <div style={styles.container}>
      {/* Header section matching Rent-a-Car Pakistan app theme */}
      <div style={styles.header}>
        <div style={styles.headerLeft}>
          <div style={styles.tagBadge}>VERIFICATIONS & APPROVALS QUEUE</div>
          <h2 style={styles.title}>Approvals & Verifications</h2>
          <p style={styles.subtitle}>
            Review government CNIC documents and driving licenses. Differentiate between Customer Drivers and Host/Owner onboarding, as well as Existing users updating info vs New registrations.
          </p>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
          <div style={styles.liveIndicator} title="Realtime Firestore synchronization active">
            <span style={styles.liveDot} />
            <span style={styles.liveText}>Live Sync</span>
          </div>
          <button onClick={loadRecords} style={styles.refreshBtn} title="Force reload records">
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

      {/* Pending Banner with Context Breakdown */}
      {!loading && !error && counts.pending > 0 && (
        <div style={styles.pendingAlert}>
          <div style={styles.alertIcon}>⏳</div>
          <div style={styles.alertText}>
            <strong>
              {counts.pending} Verification {counts.pending === 1 ? "Request" : "Requests"} Awaiting Review:
            </strong>{" "}
            <span>
              {counts.hosts} Host Applications • {counts.customers} Customer Verifications (
              <span style={{ color: "#34D399", fontWeight: "bold" }}>
                {counts.existingUsers} Existing Users Updated Info
              </span>
              , {counts.newUsers} New Registrations).
            </span>
          </div>
        </div>
      )}

      {/* Filter Tabs & Search Bar */}
      {!loading && !error && (
        <div style={{ display: "flex", flexDirection: "column", gap: "12px", marginBottom: "24px" }}>
          {/* Primary Status Tabs */}
          <div style={styles.controlsRow}>
            <div style={styles.filterBar}>
              <button
                onClick={() => setFilter("all")}
                style={{
                  ...styles.filterBtn,
                  ...(filter === "all" ? styles.filterBtnActive : {}),
                }}
              >
                All Records <span style={styles.tabCount}>{counts.all}</span>
              </button>

              <button
                onClick={() => setFilter("pending")}
                style={{
                  ...styles.filterBtn,
                  ...(filter === "pending" ? styles.filterBtnPendingActive : {}),
                }}
              >
                ⏳ Pending Review <span style={styles.tabCountAmber}>{counts.pending}</span>
              </button>

              <button
                onClick={() => setFilter("verified")}
                style={{
                  ...styles.filterBtn,
                  ...(filter === "verified" ? styles.filterBtnVerifiedActive : {}),
                }}
              >
                ✓ Approved <span style={styles.tabCountGreen}>{counts.verified}</span>
              </button>

              <button
                onClick={() => setFilter("rejected")}
                style={{
                  ...styles.filterBtn,
                  ...(filter === "rejected" ? styles.filterBtnRejectedActive : {}),
                }}
              >
                ✕ Rejected <span style={styles.tabCountRed}>{counts.rejected}</span>
              </button>
            </div>

            <div style={styles.searchWrapper}>
              <span style={styles.searchIcon}>🔍</span>
              <input
                type="text"
                placeholder="Search by name, email, CNIC, license, phone..."
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

          {/* Secondary Sub-Filter Row: Role Category & User Account History */}
          <div
            style={{
              display: "flex",
              flexWrap: "wrap",
              gap: "10px",
              padding: "10px 14px",
              backgroundColor: "rgba(255, 255, 255, 0.03)",
              border: "1px solid rgba(255, 255, 255, 0.06)",
              borderRadius: "10px",
              alignItems: "center",
              justifyContent: "space-between",
            }}
          >
            {/* Role Filter */}
            <div style={{ display: "flex", alignItems: "center", gap: "6px", flexWrap: "wrap" }}>
              <span style={{ fontSize: "12px", color: "#9CA3AF", fontWeight: "600", marginRight: "4px" }}>
                Role:
              </span>
              <button
                onClick={() => setCategoryFilter("all")}
                style={{
                  padding: "4px 10px",
                  borderRadius: "6px",
                  fontSize: "12px",
                  fontWeight: "600",
                  cursor: "pointer",
                  border: "none",
                  backgroundColor: categoryFilter === "all" ? "rgba(255, 110, 20, 0.25)" : "transparent",
                  color: categoryFilter === "all" ? "#FF6E14" : "#9CA3AF",
                }}
              >
                All Types ({counts.all})
              </button>
              <button
                onClick={() => setCategoryFilter("hosts")}
                style={{
                  padding: "4px 10px",
                  borderRadius: "6px",
                  fontSize: "12px",
                  fontWeight: "600",
                  cursor: "pointer",
                  border: "none",
                  backgroundColor: categoryFilter === "hosts" ? "rgba(245, 158, 11, 0.25)" : "transparent",
                  color: categoryFilter === "hosts" ? "#FBBF24" : "#9CA3AF",
                }}
              >
                🚗 Hosts / Owners ({counts.hosts})
              </button>
              <button
                onClick={() => setCategoryFilter("customers")}
                style={{
                  padding: "4px 10px",
                  borderRadius: "6px",
                  fontSize: "12px",
                  fontWeight: "600",
                  cursor: "pointer",
                  border: "none",
                  backgroundColor: categoryFilter === "customers" ? "rgba(59, 130, 246, 0.25)" : "transparent",
                  color: categoryFilter === "customers" ? "#60A5FA" : "#9CA3AF",
                }}
              >
                🪪 Customer Drivers ({counts.customers})
              </button>
            </div>

            {/* Account History Filter */}
            <div style={{ display: "flex", alignItems: "center", gap: "6px", flexWrap: "wrap" }}>
              <span style={{ fontSize: "12px", color: "#9CA3AF", fontWeight: "600", marginRight: "4px" }}>
                Account History:
              </span>
              <button
                onClick={() => setUserOriginFilter("all")}
                style={{
                  padding: "4px 10px",
                  borderRadius: "6px",
                  fontSize: "12px",
                  fontWeight: "600",
                  cursor: "pointer",
                  border: "none",
                  backgroundColor: userOriginFilter === "all" ? "rgba(255, 255, 255, 0.12)" : "transparent",
                  color: userOriginFilter === "all" ? "#FFF" : "#9CA3AF",
                }}
              >
                All Accounts
              </button>
              <button
                onClick={() => setUserOriginFilter("existing")}
                style={{
                  padding: "4px 10px",
                  borderRadius: "6px",
                  fontSize: "12px",
                  fontWeight: "600",
                  cursor: "pointer",
                  border: "none",
                  backgroundColor: userOriginFilter === "existing" ? "rgba(16, 185, 129, 0.25)" : "transparent",
                  color: userOriginFilter === "existing" ? "#34D399" : "#9CA3AF",
                }}
              >
                🔄 Existing Users (Updated Info) ({counts.existingUsers})
              </button>
              <button
                onClick={() => setUserOriginFilter("new")}
                style={{
                  padding: "4px 10px",
                  borderRadius: "6px",
                  fontSize: "12px",
                  fontWeight: "600",
                  cursor: "pointer",
                  border: "none",
                  backgroundColor: userOriginFilter === "new" ? "rgba(139, 92, 246, 0.25)" : "transparent",
                  color: userOriginFilter === "new" ? "#A78BFA" : "#9CA3AF",
                }}
              >
                🆕 New Users ({counts.newUsers})
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Loading State */}
      {loading && (
        <div style={styles.stateCard}>
          <div style={styles.spinner} />
          <p style={styles.stateTitle}>Loading Host Verification Requests...</p>
          <span style={styles.stateSubtitle}>Fetching verification documents from Firestore</span>
        </div>
      )}

      {/* Error State */}
      {!loading && error && (
        <div style={styles.errorCard}>
          <div style={styles.errorIcon}>⚠️</div>
          <div style={styles.errorContent}>
            <h4 style={styles.errorTitle}>Failed to Load Host Requests</h4>
            <p style={styles.errorText}>{error}</p>
            <button onClick={loadRecords} style={styles.retryButton}>
              🔄 Retry Fetch
            </button>
          </div>
        </div>
      )}

      {/* Empty State */}
      {!loading && !error && records.length === 0 && (
        <div style={styles.stateCard}>
          <div style={styles.emptyIcon}>🛡️</div>
          <p style={styles.stateTitle}>No Host Verification Records Found</p>
          <span style={styles.stateSubtitle}>
            There are currently no host verification requests in Firestore.
          </span>
          <button onClick={loadRecords} style={styles.retryButton}>
            🔄 Refresh
          </button>
        </div>
      )}

      {/* Empty Filter State */}
      {!loading && !error && records.length > 0 && filteredRecords.length === 0 && (
        <div style={styles.stateCard}>
          <div style={styles.emptyIcon}>🔍</div>
          <p style={styles.stateTitle}>No Matching Records</p>
          <span style={styles.stateSubtitle}>
            No applications match the current filter &quot;{filter}&quot; and search query.
          </span>
          <button
            onClick={() => {
              setFilter("all");
              setSearchQuery("");
            }}
            style={styles.retryButton}
          >
            Clear Filters
          </button>
        </div>
      )}

      {/* Host Applications Grid */}
      {!loading && !error && filteredRecords.length > 0 && (
        <div style={styles.grid}>
          {filteredRecords.map((item) => {
            const isProcessing = processingId === item.id;
            const displayName = item.name?.trim() || "Host Applicant";
            const displayEmail = item.email?.trim() || "No email";
            const status = (item.verificationStatus || "").toLowerCase();
            const isPending = status === "pending" || status === "in_review";
            const isVerified = status === "verified" || status === "approved" || item.isHostVerified === true;
            const isRejected = status === "rejected" || status === "declined";

            return (
              <div
                key={item.id || item.uid}
                style={{
                  ...styles.card,
                  border: isPending
                    ? "1px solid rgba(245, 158, 11, 0.45)"
                    : isVerified
                    ? "1px solid rgba(16, 185, 129, 0.3)"
                    : "1px solid rgba(255, 255, 255, 0.08)",
                }}
              >
                {/* Card Header */}
                <div style={styles.cardHeader}>
                  <div style={styles.cardAvatar}>
                    {displayName.charAt(0).toUpperCase()}
                  </div>
                  <div style={styles.cardHeaderMeta}>
                    <h4 style={styles.cardName}>{displayName}</h4>
                    <span style={styles.cardEmail}>{displayEmail}</span>

                    {/* Differentiator Badges */}
                    <div style={{ display: "flex", flexWrap: "wrap", gap: "6px", marginTop: "6px" }}>
                      {/* Application Category Badge */}
                      {item.isExplicitHost || item.roleCategory === "host" ? (
                        <span
                          style={{
                            fontSize: "11px",
                            fontWeight: "700",
                            padding: "2px 8px",
                            borderRadius: "6px",
                            backgroundColor: "rgba(245, 158, 11, 0.15)",
                            color: "#FBBF24",
                            border: "1px solid rgba(245, 158, 11, 0.35)",
                            display: "inline-flex",
                            alignItems: "center",
                            gap: "4px",
                          }}
                        >
                          🚗 Host Application
                        </span>
                      ) : (
                        <span
                          style={{
                            fontSize: "11px",
                            fontWeight: "700",
                            padding: "2px 8px",
                            borderRadius: "6px",
                            backgroundColor: "rgba(59, 130, 246, 0.15)",
                            color: "#60A5FA",
                            border: "1px solid rgba(59, 130, 246, 0.35)",
                            display: "inline-flex",
                            alignItems: "center",
                            gap: "4px",
                          }}
                        >
                          🪪 Customer Driver
                        </span>
                      )}

                      {/* User Origin Badge */}
                      {item.submissionKind === "resubmission" ? (
                        <span
                          style={{
                            fontSize: "11px",
                            fontWeight: "700",
                            padding: "2px 8px",
                            borderRadius: "6px",
                            backgroundColor: "rgba(239, 68, 68, 0.15)",
                            color: "#F87171",
                            border: "1px solid rgba(239, 68, 68, 0.35)",
                            display: "inline-flex",
                            alignItems: "center",
                            gap: "4px",
                          }}
                        >
                          ⚠️ Re-submitted Docs
                        </span>
                      ) : item.isExistingUser ? (
                        <span
                          style={{
                            fontSize: "11px",
                            fontWeight: "700",
                            padding: "2px 8px",
                            borderRadius: "6px",
                            backgroundColor: "rgba(16, 185, 129, 0.15)",
                            color: "#34D399",
                            border: "1px solid rgba(16, 185, 129, 0.35)",
                            display: "inline-flex",
                            alignItems: "center",
                            gap: "4px",
                          }}
                        >
                          🔄 Existing User (Updated Info)
                        </span>
                      ) : (
                        <span
                          style={{
                            fontSize: "11px",
                            fontWeight: "700",
                            padding: "2px 8px",
                            borderRadius: "6px",
                            backgroundColor: "rgba(139, 92, 246, 0.15)",
                            color: "#A78BFA",
                            border: "1px solid rgba(139, 92, 246, 0.35)",
                            display: "inline-flex",
                            alignItems: "center",
                            gap: "4px",
                          }}
                        >
                          🆕 New User
                        </span>
                      )}
                    </div>
                  </div>
                  <div style={styles.statusBadgeWrapper}>
                    {isPending ? (
                      <span style={styles.badgePending}>⏳ Awaiting Review</span>
                    ) : isVerified ? (
                      <span style={styles.badgeVerified}>
                        {item.isExplicitHost ? "✓ Host Approved" : "✓ Verified Driver"}
                      </span>
                    ) : isRejected ? (
                      <span style={styles.badgeRejected}>✕ Rejected</span>
                    ) : (
                      <span style={styles.badgeNeutral}>{status || "Unverified"}</span>
                    )}
                  </div>
                </div>

                {/* Existing user callout banner */}
                {item.isExistingUser && (
                  <div
                    style={{
                      margin: "8px 0 10px 0",
                      padding: "6px 10px",
                      backgroundColor: "rgba(16, 185, 129, 0.08)",
                      border: "1px solid rgba(16, 185, 129, 0.25)",
                      borderRadius: "6px",
                      display: "flex",
                      alignItems: "center",
                      gap: "6px",
                      fontSize: "11px",
                      color: "#A7F3D0",
                    }}
                  >
                    <span>🔄</span>
                    <span>Existing account: user updated CNIC / driving license.</span>
                  </div>
                )}

                {/* Information Grid */}
                <div style={styles.cardMetaGrid}>
                  <div style={styles.metaCol}>
                    <span style={styles.metaLabel}>CNIC NUMBER</span>
                    <span style={styles.metaValue}>
                      {item.cnicNumber || "Not provided"}
                    </span>
                  </div>
                  <div style={styles.metaCol}>
                    <span style={styles.metaLabel}>DRIVING LICENSE</span>
                    <span style={styles.metaValue}>
                      {item.licenseNumber || "Not provided"}
                    </span>
                  </div>
                  <div style={styles.metaCol}>
                    <span style={styles.metaLabel}>PHONE NUMBER</span>
                    <span style={styles.metaValue}>
                      {item.phone || item.phoneNumber || "Not provided"}
                    </span>
                  </div>
                  <div style={styles.metaCol}>
                    <span style={styles.metaLabel}>USER ROLE</span>
                    <span style={styles.metaValue}>
                      {(item.role || "customer").toUpperCase()}
                    </span>
                  </div>
                </div>

                {/* Documents Thumbnail Row */}
                <div style={styles.docRow}>
                  <div style={styles.docCol}>
                    <span style={styles.docLabel}>CNIC FRONT</span>
                    {item.cnicFrontUrl ? (
                      <div
                        onClick={() =>
                          setActiveImagePreview({
                            title: `CNIC Front — ${displayName}`,
                            url: item.cnicFrontUrl,
                          })
                        }
                        style={styles.docThumbBox}
                      >
                        {isImageSrc(item.cnicFrontUrl) ? (
                          <img
                            src={item.cnicFrontUrl}
                            alt="CNIC Front"
                            style={styles.docThumbImg}
                          />
                        ) : (
                          <div style={styles.docFallbackThumb}>
                            <span>🪪</span>
                            <small style={styles.thumbSub}>Uploaded File</small>
                          </div>
                        )}
                        <div style={styles.thumbHoverBadge}>🔍 View</div>
                      </div>
                    ) : (
                      <div style={styles.noDocBox}>Not uploaded</div>
                    )}
                  </div>

                  <div style={styles.docCol}>
                    <span style={styles.docLabel}>CNIC BACK</span>
                    {item.cnicBackUrl ? (
                      <div
                        onClick={() =>
                          setActiveImagePreview({
                            title: `CNIC Back — ${displayName}`,
                            url: item.cnicBackUrl,
                          })
                        }
                        style={styles.docThumbBox}
                      >
                        {isImageSrc(item.cnicBackUrl) ? (
                          <img
                            src={item.cnicBackUrl}
                            alt="CNIC Back"
                            style={styles.docThumbImg}
                          />
                        ) : (
                          <div style={styles.docFallbackThumb}>
                            <span>🪪</span>
                            <small style={styles.thumbSub}>Uploaded File</small>
                          </div>
                        )}
                        <div style={styles.thumbHoverBadge}>🔍 View</div>
                      </div>
                    ) : (
                      <div style={styles.noDocBox}>Not uploaded</div>
                    )}
                  </div>

                  <div style={styles.docCol}>
                    <span style={styles.docLabel}>DRIVING LICENSE</span>
                    {item.licenseUrl ? (
                      <div
                        onClick={() =>
                          setActiveImagePreview({
                            title: `Driving License — ${displayName}`,
                            url: item.licenseUrl,
                          })
                        }
                        style={styles.docThumbBox}
                      >
                        {isImageSrc(item.licenseUrl) ? (
                          <img
                            src={item.licenseUrl}
                            alt="Driving License"
                            style={styles.docThumbImg}
                          />
                        ) : (
                          <div style={styles.docFallbackThumb}>
                            <span>🚗</span>
                            <small style={styles.thumbSub}>Uploaded File</small>
                          </div>
                        )}
                        <div style={styles.thumbHoverBadge}>🔍 View</div>
                      </div>
                    ) : (
                      <div style={styles.noDocBox}>Not uploaded</div>
                    )}
                  </div>
                </div>

                {/* Attached Vehicle Preview if present */}
                {item.hostCar && (
                  <div
                    style={{
                      margin: "12px 0 6px 0",
                      padding: "10px 14px",
                      backgroundColor: "rgba(255, 110, 20, 0.08)",
                      border: "1px solid rgba(255, 110, 20, 0.25)",
                      borderRadius: "8px",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      gap: "10px",
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                      <span style={{ fontSize: "20px" }}>🚘</span>
                      <div>
                        <div style={{ fontSize: "13px", fontWeight: "bold", color: "#FFF" }}>
                          {item.hostCar.name || `${item.hostCar.brand || ''} ${item.hostCar.model || ''}`}
                        </div>
                        <div style={{ fontSize: "11px", color: "rgba(255, 255, 255, 0.6)" }}>
                          Plate: {item.hostCar.registrationNumber || "Unassigned"} • Rent: Rs. {item.hostCar.price || "N/A"}
                        </div>
                      </div>
                    </div>
                    <span
                      style={{
                        fontSize: "10px",
                        fontWeight: "bold",
                        padding: "2px 8px",
                        borderRadius: "6px",
                        backgroundColor: "rgba(245, 158, 11, 0.2)",
                        color: "#F59E0B",
                        border: "1px solid rgba(245, 158, 11, 0.4)",
                      }}
                    >
                      Attached Vehicle
                    </span>
                  </div>
                )}

                {/* Rejection notice if previously rejected */}
                {isRejected && item.rejectionReason && (
                  <div style={styles.rejectionNotice}>
                    <span style={styles.rejectionLabel}>Rejection Reason:</span>
                    <span style={styles.rejectionText}>{item.rejectionReason}</span>
                  </div>
                )}

                {/* Card Action Buttons */}
                <div style={styles.cardActions}>
                  <button
                    onClick={() => setInspectingItem(item)}
                    style={styles.inspectBtn}
                    title="View all details & verification history"
                  >
                    🔍 Inspect
                  </button>

                  <div style={styles.actionGroup}>
                    {!isVerified && (
                      (item.hostCar && (item.hostCar.id || item.hostCar.name || item.hostCar.brand)) ? (
                        <>
                          <button
                            onClick={() => handleApprove(item, false)}
                            disabled={isProcessing}
                            style={styles.approveHostOnlyBtn}
                            title="Approves host identity only. Attached vehicles stay pending for vehicle review."
                          >
                            {isProcessing ? "..." : "✓ Host Only"}
                          </button>
                          <button
                            onClick={() => handleApprove(item, true)}
                            disabled={isProcessing}
                            style={styles.approveBtn}
                            title="Approves host identity and simultaneously publishes their vehicle."
                          >
                            {isProcessing ? "..." : "✓ Host & Car"}
                          </button>
                        </>
                      ) : (item.isExplicitHost || item.role === "owner") ? (
                        <button
                          onClick={() => handleApprove(item, false)}
                          disabled={isProcessing}
                          style={styles.approveBtn}
                          title="Approves host application."
                        >
                          {isProcessing ? "..." : "✓ Approve Host"}
                        </button>
                      ) : (
                        <button
                          onClick={() => handleApprove(item, false)}
                          disabled={isProcessing}
                          style={styles.approveBtn}
                          title="Approves customer driving license and identity."
                        >
                          {isProcessing ? "..." : "✓ Approve Customer"}
                        </button>
                      )
                    )}

                    {!isRejected && (
                      <button
                        onClick={() => openRejectModal(item)}
                        disabled={isProcessing}
                        style={{
                          ...styles.rejectBtn,
                          opacity: isProcessing ? 0.6 : 1,
                        }}
                      >
                        ✕ Reject
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Inspection Modal */}
      {inspectingItem && (
        <div style={styles.modalOverlay} onClick={() => setInspectingItem(null)}>
          <div style={styles.modalContent} onClick={(e) => e.stopPropagation()}>
            <div style={styles.modalHeader}>
              <div>
                <h3 style={styles.modalTitle}>
                  {inspectingItem.isExplicitHost || inspectingItem.roleCategory === "host"
                    ? `Host Application: ${inspectingItem.name || inspectingItem.email || inspectingItem.id}`
                    : `Customer Driver Verification: ${inspectingItem.name || inspectingItem.email || inspectingItem.id}`}
                </h3>
                <span style={styles.modalSubtitle}>UID: {inspectingItem.id}</span>
              </div>
              <button
                onClick={() => setInspectingItem(null)}
                style={styles.modalCloseBtn}
              >
                ✕
              </button>
            </div>

            <div style={styles.modalBody}>
              {/* Prominent Origin & History Callout */}
              {inspectingItem.isExistingUser ? (
                <div
                  style={{
                    marginBottom: "18px",
                    padding: "12px 16px",
                    backgroundColor: "rgba(16, 185, 129, 0.12)",
                    border: "1px solid rgba(16, 185, 129, 0.35)",
                    borderRadius: "10px",
                    display: "flex",
                    alignItems: "flex-start",
                    gap: "10px",
                  }}
                >
                  <span style={{ fontSize: "20px" }}>🔄</span>
                  <div>
                    <div style={{ color: "#34D399", fontWeight: "bold", fontSize: "13px" }}>
                      Existing User Account (Updated Info)
                    </div>
                    <div style={{ color: "#D1FAE5", fontSize: "12px", marginTop: "2px" }}>
                      This applicant already has an established user account. They updated their verification documents (CNIC / License) for review.
                    </div>
                  </div>
                </div>
              ) : (
                <div
                  style={{
                    marginBottom: "18px",
                    padding: "12px 16px",
                    backgroundColor: "rgba(139, 92, 246, 0.12)",
                    border: "1px solid rgba(139, 92, 246, 0.35)",
                    borderRadius: "10px",
                    display: "flex",
                    alignItems: "flex-start",
                    gap: "10px",
                  }}
                >
                  <span style={{ fontSize: "20px" }}>🆕</span>
                  <div>
                    <div style={{ color: "#A78BFA", fontWeight: "bold", fontSize: "13px" }}>
                      New User Registration
                    </div>
                    <div style={{ color: "#EDE9FE", fontSize: "12px", marginTop: "2px" }}>
                      First-time applicant registering and verifying identity documents.
                    </div>
                  </div>
                </div>
              )}

              {/* Profile Details */}
              <div style={styles.modalSection}>
                <h4 style={styles.sectionHeading}>Applicant Profile</h4>
                <div style={styles.detailGrid}>
                  <div>
                    <span style={styles.metaLabel}>FULL NAME</span>
                    <span style={styles.metaValue}>
                      {inspectingItem.name ||
                        inspectingItem.fullName ||
                        inspectingItem.displayName ||
                        inspectingItem.userName ||
                        "Unnamed User"}
                    </span>
                  </div>
                  <div>
                    <span style={styles.metaLabel}>EMAIL</span>
                    <span style={styles.metaValue}>
                      {inspectingItem.email || inspectingItem.userEmail || "N/A"}
                    </span>
                  </div>
                  <div>
                    <span style={styles.metaLabel}>PHONE NUMBER</span>
                    <span style={styles.metaValue}>
                      {inspectingItem.phone ||
                        inspectingItem.phoneNumber ||
                        inspectingItem.contactNumber ||
                        inspectingItem.mobile ||
                        "N/A"}
                    </span>
                  </div>
                  <div>
                    <span style={styles.metaLabel}>APPLICATION TYPE</span>
                    <span
                      style={{
                        ...styles.metaValue,
                        color: inspectingItem.isExplicitHost ? "#FBBF24" : "#60A5FA",
                        fontWeight: "bold",
                      }}
                    >
                      {inspectingItem.isExplicitHost ? "🚗 Host / Car Owner" : "🪪 Customer Driver"}
                    </span>
                  </div>
                  <div>
                    <span style={styles.metaLabel}>ACCOUNT HISTORY</span>
                    <span
                      style={{
                        ...styles.metaValue,
                        color: inspectingItem.isExistingUser ? "#34D399" : "#A78BFA",
                        fontWeight: "bold",
                      }}
                    >
                      {inspectingItem.submissionKind === "resubmission"
                        ? "⚠️ Re-submitted (After Rejection)"
                        : inspectingItem.isExistingUser
                        ? "🔄 Existing Account (Updated Info)"
                        : "🆕 New User Registration"}
                    </span>
                  </div>
                  <div>
                    <span style={styles.metaLabel}>CURRENT ROLE</span>
                    <span style={styles.metaValue}>{inspectingItem.role || "customer"}</span>
                  </div>
                  <div>
                    <span style={styles.metaLabel}>CNIC NUMBER</span>
                    <span style={styles.metaValue}>{inspectingItem.cnicNumber || "N/A"}</span>
                  </div>
                  <div>
                    <span style={styles.metaLabel}>LICENSE NUMBER</span>
                    <span style={styles.metaValue}>{inspectingItem.licenseNumber || "N/A"}</span>
                  </div>
                </div>
              </div>

              {/* Document Previews */}
              <div style={styles.modalSection}>
                <h4 style={styles.sectionHeading}>Document Attachments</h4>
                <div style={styles.modalDocsGrid}>
                  <div style={styles.modalDocItem}>
                    <span style={styles.docLabel}>CNIC FRONT</span>
                    {inspectingItem.cnicFrontUrl ? (
                      isImageSrc(inspectingItem.cnicFrontUrl) ? (
                        <img
                          src={inspectingItem.cnicFrontUrl}
                          alt="CNIC Front"
                          style={styles.modalDocImg}
                          onClick={() =>
                            setActiveImagePreview({
                              title: "CNIC Front",
                              url: inspectingItem.cnicFrontUrl,
                            })
                          }
                        />
                      ) : (
                        <div style={styles.modalDocFallback}>
                          <span>📄 File Path:</span>
                          <code>
                            {inspectingItem.cnicFrontUrl.length > 50
                              ? inspectingItem.cnicFrontUrl.slice(0, 50) + "..."
                              : inspectingItem.cnicFrontUrl}
                          </code>
                        </div>
                      )
                    ) : (
                      <span style={styles.noDocBox}>Not uploaded</span>
                    )}
                  </div>

                  <div style={styles.modalDocItem}>
                    <span style={styles.docLabel}>CNIC BACK</span>
                    {inspectingItem.cnicBackUrl ? (
                      isImageSrc(inspectingItem.cnicBackUrl) ? (
                        <img
                          src={inspectingItem.cnicBackUrl}
                          alt="CNIC Back"
                          style={styles.modalDocImg}
                          onClick={() =>
                            setActiveImagePreview({
                              title: "CNIC Back",
                              url: inspectingItem.cnicBackUrl,
                            })
                          }
                        />
                      ) : (
                        <div style={styles.modalDocFallback}>
                          <span>📄 File Path:</span>
                          <code>
                            {inspectingItem.cnicBackUrl.length > 50
                              ? inspectingItem.cnicBackUrl.slice(0, 50) + "..."
                              : inspectingItem.cnicBackUrl}
                          </code>
                        </div>
                      )
                    ) : (
                      <span style={styles.noDocBox}>Not uploaded</span>
                    )}
                  </div>

                  <div style={styles.modalDocItem}>
                    <span style={styles.docLabel}>DRIVING LICENSE</span>
                    {inspectingItem.licenseUrl ? (
                      isImageSrc(inspectingItem.licenseUrl) ? (
                        <img
                          src={inspectingItem.licenseUrl}
                          alt="Driving License"
                          style={styles.modalDocImg}
                          onClick={() =>
                            setActiveImagePreview({
                              title: "Driving License",
                              url: inspectingItem.licenseUrl,
                            })
                          }
                        />
                      ) : (
                        <div style={styles.modalDocFallback}>
                          <span>📄 File Path:</span>
                          <code>
                            {inspectingItem.licenseUrl.length > 50
                              ? inspectingItem.licenseUrl.slice(0, 50) + "..."
                              : inspectingItem.licenseUrl}
                          </code>
                        </div>
                      )
                    ) : (
                      <span style={styles.noDocBox}>Not uploaded</span>
                    )}
                  </div>
                </div>
              </div>

              {/* Attached Vehicle Details if present */}
              {inspectingItem.hostCar && (
                <div style={styles.modalSection}>
                  <h4 style={styles.sectionHeading}>Attached First Vehicle</h4>
                  <div style={styles.detailGrid}>
                    <div>
                      <span style={styles.metaLabel}>VEHICLE NAME</span>
                      <span style={styles.metaValue}>
                        {inspectingItem.hostCar.name || `${inspectingItem.hostCar.brand || ''} ${inspectingItem.hostCar.model || ''}`}
                      </span>
                    </div>
                    <div>
                      <span style={styles.metaLabel}>NUMBER PLATE</span>
                      <span style={styles.metaValue}>{inspectingItem.hostCar.registrationNumber || "Unassigned"}</span>
                    </div>
                    <div>
                      <span style={styles.metaLabel}>DAILY RENTAL</span>
                      <span style={styles.metaValue}>Rs. {inspectingItem.hostCar.price || "N/A"}</span>
                    </div>
                    <div>
                      <span style={styles.metaLabel}>RENTAL MODE</span>
                      <span style={styles.metaValue}>{inspectingItem.hostCar.rentalMode || "Both Available"}</span>
                    </div>
                    <div>
                      <span style={styles.metaLabel}>TRANSMISSION / FUEL</span>
                      <span style={styles.metaValue}>
                        {inspectingItem.hostCar.transmission || "Automatic"} • {inspectingItem.hostCar.fuelType || "Petrol"}
                      </span>
                    </div>
                    <div>
                      <span style={styles.metaLabel}>LOCATION</span>
                      <span style={styles.metaValue}>{inspectingItem.hostCar.location || "N/A"}</span>
                    </div>
                  </div>
                </div>
              )}
            </div>

            <div style={styles.modalFooter}>
              <button
                onClick={() => setInspectingItem(null)}
                style={styles.cancelBtn}
              >
                Close
              </button>

              <div style={styles.actionGroup}>
                <button
                  onClick={() => openRejectModal(inspectingItem)}
                  disabled={processingId === inspectingItem.id}
                  style={styles.rejectBtn}
                >
                  ✕ Reject Application
                </button>

                {inspectingItem.hostCar ? (
                  <>
                    <button
                      onClick={() => handleApprove(inspectingItem, false)}
                      disabled={processingId === inspectingItem.id}
                      style={styles.approveHostOnlyBtn}
                      title="Approves host identity only. Attached vehicles stay pending for vehicle review."
                    >
                      ✓ Approve Host Only
                    </button>
                    <button
                      onClick={() => handleApprove(inspectingItem, true)}
                      disabled={processingId === inspectingItem.id}
                      style={styles.approveBtn}
                      title="Approves host identity and simultaneously publishes their vehicle."
                    >
                      ✓ Approve Host & Vehicle
                    </button>
                  </>
                ) : inspectingItem.isExplicitHost ? (
                  <button
                    onClick={() => handleApprove(inspectingItem, false)}
                    disabled={processingId === inspectingItem.id}
                    style={styles.approveBtn}
                    title="Approves host application."
                  >
                    ✓ Approve Host Application
                  </button>
                ) : (
                  <button
                    onClick={() => handleApprove(inspectingItem, false)}
                    disabled={processingId === inspectingItem.id}
                    style={styles.approveBtn}
                    title="Approves customer driving license and identity."
                  >
                    ✓ Approve Driver Verification
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Reject Reason Modal */}
      {rejectingItem && (
        <div style={styles.modalOverlay} onClick={() => setRejectingItem(null)}>
          <div style={styles.rejectModalContent} onClick={(e) => e.stopPropagation()}>
            <div style={styles.modalHeader}>
              <div>
                <h3 style={styles.modalTitle}>Reject Host Application</h3>
                <span style={styles.modalSubtitle}>
                  Provide feedback for {rejectingItem.name || rejectingItem.email}
                </span>
              </div>
              <button
                onClick={() => setRejectingItem(null)}
                style={styles.modalCloseBtn}
              >
                ✕
              </button>
            </div>

            <div style={styles.modalBody}>
              <p style={styles.rejectInstruction}>
                Select the issue(s) identified so the applicant knows what to correct in the Flutter app:
              </p>

              {/* Issue Checkboxes */}
              <div style={styles.issueList}>
                {issueOptions.map((issue) => {
                  const isChecked = selectedIssues.includes(issue);
                  return (
                    <label
                      key={issue}
                      onClick={() => toggleIssue(issue)}
                      style={{
                        ...styles.issueItem,
                        backgroundColor: isChecked
                          ? "rgba(239, 68, 68, 0.12)"
                          : "#141414",
                        border: isChecked
                          ? "1px solid #EF4444"
                          : "1px solid rgba(255, 255, 255, 0.1)",
                      }}
                    >
                      <input
                        type="checkbox"
                        checked={isChecked}
                        onChange={() => {}}
                        style={styles.checkbox}
                      />
                      <span style={styles.issueText}>{issue}</span>
                    </label>
                  );
                })}
              </div>

              {/* Detailed Reason Text */}
              <div style={{ marginTop: "16px" }}>
                <label style={styles.fieldLabel}>Detailed Reason / Explanation:</label>
                <textarea
                  rows={3}
                  value={rejectReason}
                  onChange={(e) => setRejectReason(e.target.value)}
                  placeholder="Explain why this application was rejected..."
                  style={styles.textarea}
                />
              </div>
            </div>

            <div style={styles.modalFooter}>
              <button
                onClick={() => setRejectingItem(null)}
                style={styles.cancelBtn}
              >
                Cancel
              </button>
              <button
                onClick={handleConfirmReject}
                disabled={processingId === rejectingItem.id}
                style={styles.confirmRejectBtn}
              >
                {processingId === rejectingItem.id ? "Rejecting..." : "Confirm Rejection"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Lightbox Image Preview Modal */}
      {activeImagePreview && (
        <div
          style={styles.lightboxOverlay}
          onClick={() => setActiveImagePreview(null)}
        >
          <div style={styles.lightboxHeader}>
            <span style={styles.lightboxTitle}>{activeImagePreview.title}</span>
            <button
              onClick={() => setActiveImagePreview(null)}
              style={styles.lightboxCloseBtn}
            >
              ✕ Close
            </button>
          </div>
          <div style={styles.lightboxImgContainer}>
            <img
              src={activeImagePreview.url}
              alt={activeImagePreview.title}
              style={styles.lightboxImg}
              onClick={(e) => e.stopPropagation()}
            />
          </div>
        </div>
      )}
    </div>
  );
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
    display: "flex",
    alignItems: "center",
    gap: "6px",
    transition: "all 0.2s ease",
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
  pendingAlert: {
    display: "flex",
    alignItems: "center",
    gap: "12px",
    padding: "14px 18px",
    backgroundColor: "rgba(245, 158, 11, 0.12)",
    border: "1px solid rgba(245, 158, 11, 0.35)",
    borderRadius: "10px",
    marginBottom: "20px",
    color: "#FBBF24",
    fontSize: "14px",
  },
  alertIcon: {
    fontSize: "20px",
  },
  alertText: {
    lineHeight: "1.4",
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
  filterBtnPendingActive: {
    backgroundColor: "rgba(245, 158, 11, 0.15)",
    border: "1px solid #F59E0B",
    color: "#FBBF24",
  },
  filterBtnVerifiedActive: {
    backgroundColor: "rgba(16, 185, 129, 0.15)",
    border: "1px solid #10B981",
    color: "#34D399",
  },
  filterBtnRejectedActive: {
    backgroundColor: "rgba(239, 68, 68, 0.15)",
    border: "1px solid #EF4444",
    color: "#F87171",
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
  tabCountGreen: {
    backgroundColor: "rgba(16, 185, 129, 0.25)",
    padding: "2px 6px",
    borderRadius: "10px",
    fontSize: "11px",
    color: "#34D399",
  },
  tabCountRed: {
    backgroundColor: "rgba(239, 68, 68, 0.25)",
    padding: "2px 6px",
    borderRadius: "10px",
    fontSize: "11px",
    color: "#F87171",
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
    transition: "border-color 0.2s ease",
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
  grid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fill, minmax(420px, 1fr))",
    gap: "20px",
  },
  card: {
    backgroundColor: "#1E1E1E",
    border: "1px solid rgba(255, 255, 255, 0.08)",
    borderRadius: "14px",
    padding: "20px",
    display: "flex",
    flexDirection: "column",
    gap: "16px",
    transition: "border-color 0.2s ease, transform 0.2s ease",
  },
  cardHeader: {
    display: "flex",
    alignItems: "center",
    gap: "12px",
  },
  cardAvatar: {
    width: "44px",
    height: "44px",
    borderRadius: "10px",
    backgroundColor: "rgba(0, 180, 216, 0.18)",
    color: "#00E5FF",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontSize: "18px",
    fontWeight: "800",
    border: "1px solid rgba(0, 180, 216, 0.3)",
    flexShrink: 0,
  },
  cardHeaderMeta: {
    flex: "1",
    minWidth: 0,
  },
  cardName: {
    fontSize: "16px",
    fontWeight: "700",
    color: "#FFFFFF",
    margin: "0 0 2px 0",
    whiteSpace: "nowrap",
    overflow: "hidden",
    textOverflow: "ellipsis",
  },
  cardEmail: {
    fontSize: "12px",
    color: "#9CA3AF",
    whiteSpace: "nowrap",
    overflow: "hidden",
    textOverflow: "ellipsis",
    display: "block",
  },
  statusBadgeWrapper: {
    flexShrink: 0,
  },
  badgePending: {
    backgroundColor: "rgba(245, 158, 11, 0.16)",
    border: "1px solid rgba(245, 158, 11, 0.4)",
    color: "#FBBF24",
    padding: "4px 8px",
    borderRadius: "6px",
    fontSize: "11px",
    fontWeight: "700",
  },
  badgeVerified: {
    backgroundColor: "rgba(16, 185, 129, 0.16)",
    border: "1px solid rgba(16, 185, 129, 0.4)",
    color: "#34D399",
    padding: "4px 8px",
    borderRadius: "6px",
    fontSize: "11px",
    fontWeight: "700",
  },
  badgeRejected: {
    backgroundColor: "rgba(239, 68, 68, 0.16)",
    border: "1px solid rgba(239, 68, 68, 0.4)",
    color: "#F87171",
    padding: "4px 8px",
    borderRadius: "6px",
    fontSize: "11px",
    fontWeight: "700",
  },
  badgeNeutral: {
    backgroundColor: "rgba(255, 255, 255, 0.08)",
    border: "1px solid rgba(255, 255, 255, 0.12)",
    color: "#9CA3AF",
    padding: "4px 8px",
    borderRadius: "6px",
    fontSize: "11px",
    fontWeight: "600",
  },
  cardMetaGrid: {
    display: "grid",
    gridTemplateColumns: "1fr 1fr",
    gap: "10px",
    backgroundColor: "#161616",
    borderRadius: "10px",
    padding: "12px",
  },
  metaCol: {
    display: "flex",
    flexDirection: "column",
    gap: "2px",
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
    whiteSpace: "nowrap",
    overflow: "hidden",
    textOverflow: "ellipsis",
  },
  docRow: {
    display: "grid",
    gridTemplateColumns: "1fr 1fr 1fr",
    gap: "10px",
  },
  docCol: {
    display: "flex",
    flexDirection: "column",
    gap: "4px",
  },
  docLabel: {
    fontSize: "10px",
    fontWeight: "700",
    color: "#9CA3AF",
    letterSpacing: "0.5px",
  },
  docThumbBox: {
    position: "relative",
    height: "76px",
    borderRadius: "8px",
    overflow: "hidden",
    backgroundColor: "#121212",
    border: "1px solid rgba(255, 255, 255, 0.1)",
    cursor: "pointer",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
  },
  docThumbImg: {
    width: "100%",
    height: "100%",
    objectFit: "cover",
  },
  docFallbackThumb: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    gap: "2px",
    color: "#00B4D8",
    fontSize: "18px",
  },
  thumbSub: {
    fontSize: "9px",
    color: "#9CA3AF",
  },
  thumbHoverBadge: {
    position: "absolute",
    bottom: "4px",
    right: "4px",
    backgroundColor: "rgba(0, 0, 0, 0.75)",
    color: "#FFFFFF",
    fontSize: "9px",
    fontWeight: "700",
    padding: "2px 5px",
    borderRadius: "4px",
  },
  noDocBox: {
    height: "76px",
    borderRadius: "8px",
    backgroundColor: "#161616",
    border: "1px dashed rgba(255, 255, 255, 0.1)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    color: "#6B7280",
    fontSize: "11px",
    textAlign: "center",
  },
  rejectionNotice: {
    backgroundColor: "rgba(239, 68, 68, 0.1)",
    border: "1px solid rgba(239, 68, 68, 0.25)",
    borderRadius: "8px",
    padding: "8px 12px",
    display: "flex",
    flexDirection: "column",
    gap: "2px",
  },
  rejectionLabel: {
    fontSize: "11px",
    fontWeight: "700",
    color: "#F87171",
  },
  rejectionText: {
    fontSize: "12px",
    color: "#FCA5A5",
  },
  cardActions: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    paddingTop: "6px",
    borderTop: "1px solid rgba(255, 255, 255, 0.06)",
    gap: "10px",
  },
  inspectBtn: {
    backgroundColor: "transparent",
    border: "1px solid rgba(255, 255, 255, 0.12)",
    color: "#D1D5DB",
    padding: "7px 12px",
    borderRadius: "8px",
    fontSize: "12px",
    fontWeight: "600",
    cursor: "pointer",
    transition: "all 0.2s ease",
  },
  approveHostOnlyBtn: {
    backgroundColor: "rgba(0, 180, 216, 0.15)",
    border: "1px solid #00B4D8",
    color: "#00E5FF",
    padding: "8px 14px",
    borderRadius: "8px",
    fontSize: "12px",
    fontWeight: "700",
    cursor: "pointer",
    transition: "all 0.2s ease",
  },
  approveBtn: {
    backgroundColor: "#059669",
    color: "#FFFFFF",
    border: "none",
    padding: "8px 14px",
    borderRadius: "8px",
    fontSize: "12px",
    fontWeight: "700",
    cursor: "pointer",
    display: "flex",
    alignItems: "center",
    gap: "4px",
    transition: "background 0.2s ease",
  },
  rejectBtn: {
    backgroundColor: "rgba(239, 68, 68, 0.15)",
    border: "1px solid rgba(239, 68, 68, 0.4)",
    color: "#F87171",
    padding: "7px 12px",
    borderRadius: "8px",
    fontSize: "12px",
    fontWeight: "600",
    cursor: "pointer",
    transition: "all 0.2s ease",
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
    maxWidth: "400px",
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
    maxWidth: "760px",
    maxHeight: "90vh",
    display: "flex",
    flexDirection: "column",
    overflow: "hidden",
    boxShadow: "0 20px 40px rgba(0, 0, 0, 0.6)",
  },
  rejectModalContent: {
    backgroundColor: "#1E1E1E",
    border: "1px solid rgba(239, 68, 68, 0.3)",
    borderRadius: "16px",
    width: "100%",
    maxWidth: "540px",
    maxHeight: "90vh",
    display: "flex",
    flexDirection: "column",
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
  modalTitle: {
    fontSize: "18px",
    fontWeight: "800",
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
    overflowY: "auto",
    display: "flex",
    flexDirection: "column",
    gap: "20px",
  },
  modalSection: {
    display: "flex",
    flexDirection: "column",
    gap: "12px",
  },
  sectionHeading: {
    fontSize: "14px",
    fontWeight: "700",
    color: "#00B4D8",
    margin: "0",
    letterSpacing: "0.5px",
    textTransform: "uppercase",
  },
  detailGrid: {
    display: "grid",
    gridTemplateColumns: "1fr 1fr",
    gap: "14px",
    backgroundColor: "#161616",
    borderRadius: "10px",
    padding: "16px",
  },
  modalDocsGrid: {
    display: "grid",
    gridTemplateColumns: "1fr 1fr 1fr",
    gap: "14px",
  },
  modalDocItem: {
    display: "flex",
    flexDirection: "column",
    gap: "6px",
  },
  modalDocImg: {
    width: "100%",
    height: "140px",
    objectFit: "cover",
    borderRadius: "8px",
    border: "1px solid rgba(255, 255, 255, 0.1)",
    cursor: "pointer",
  },
  modalDocFallback: {
    padding: "12px",
    backgroundColor: "#161616",
    borderRadius: "8px",
    border: "1px solid rgba(255, 255, 255, 0.08)",
    fontSize: "11px",
    color: "#9CA3AF",
    wordBreak: "break-all",
  },
  modalFooter: {
    padding: "16px 24px",
    borderTop: "1px solid rgba(255, 255, 255, 0.08)",
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    backgroundColor: "#161616",
  },
  cancelBtn: {
    backgroundColor: "transparent",
    border: "1px solid rgba(255, 255, 255, 0.15)",
    color: "#E5E7EB",
    padding: "8px 16px",
    borderRadius: "8px",
    fontSize: "13px",
    fontWeight: "600",
    cursor: "pointer",
  },
  confirmRejectBtn: {
    backgroundColor: "#DC2626",
    color: "#FFFFFF",
    border: "none",
    padding: "8px 18px",
    borderRadius: "8px",
    fontSize: "13px",
    fontWeight: "700",
    cursor: "pointer",
  },
  rejectInstruction: {
    fontSize: "13px",
    color: "#9CA3AF",
    margin: "0",
  },
  issueList: {
    display: "flex",
    flexDirection: "column",
    gap: "8px",
  },
  issueItem: {
    display: "flex",
    alignItems: "center",
    gap: "10px",
    padding: "10px 14px",
    borderRadius: "8px",
    border: "1px solid",
    cursor: "pointer",
    userSelect: "none",
  },
  checkbox: {
    accentColor: "#EF4444",
  },
  issueText: {
    fontSize: "13px",
    color: "#FFFFFF",
  },
  fieldLabel: {
    fontSize: "12px",
    fontWeight: "700",
    color: "#9CA3AF",
    display: "block",
    marginBottom: "6px",
  },
  textarea: {
    width: "100%",
    backgroundColor: "#141414",
    border: "1px solid rgba(255, 255, 255, 0.12)",
    borderRadius: "8px",
    padding: "10px 12px",
    color: "#FFFFFF",
    fontSize: "13px",
    outline: "none",
    resize: "vertical",
    fontFamily: "inherit",
  },
  lightboxOverlay: {
    position: "fixed",
    inset: 0,
    backgroundColor: "rgba(0, 0, 0, 0.92)",
    backdropFilter: "blur(6px)",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    zIndex: 1100,
    padding: "20px",
  },
  lightboxHeader: {
    width: "100%",
    maxWidth: "900px",
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: "14px",
  },
  lightboxTitle: {
    fontSize: "16px",
    fontWeight: "700",
    color: "#FFFFFF",
  },
  lightboxCloseBtn: {
    backgroundColor: "rgba(255, 255, 255, 0.15)",
    border: "none",
    color: "#FFFFFF",
    padding: "6px 14px",
    borderRadius: "8px",
    fontSize: "13px",
    fontWeight: "600",
    cursor: "pointer",
  },
  lightboxImgContainer: {
    maxWidth: "900px",
    maxHeight: "80vh",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  lightboxImg: {
    maxWidth: "100%",
    maxHeight: "80vh",
    objectFit: "contain",
    borderRadius: "10px",
    border: "1px solid rgba(255, 255, 255, 0.2)",
  },
};
