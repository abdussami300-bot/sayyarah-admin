"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import StatCard from "@/components/StatCard";
import { fetchDashboardMetrics, subscribeDashboardMetrics } from "@/lib/dashboardService";

export default function DashboardPage() {
  const [metrics, setMetrics] = useState({
    registeredUsers: 0,
    pendingHosts: 0,
    fleetVehicles: 0,
    pendingCars: 0,
    totalBookings: 0,
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const loadMetrics = async () => {
    setLoading(true);
    setError("");
    try {
      const data = await fetchDashboardMetrics();
      setMetrics(data);
    } catch (err) {
      console.error("Dashboard metrics fetch error:", err);
      setError("Failed to fetch Firestore counts.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    setLoading(true);
    setError("");
    const unsubscribe = subscribeDashboardMetrics(
      (data) => {
        setMetrics(data);
        setLoading(false);
      },
      (err) => {
        console.error("Dashboard metrics realtime subscription error:", err);
        setError("Failed to fetch Firestore counts in real-time.");
        setLoading(false);
      }
    );

    return () => {
      if (typeof unsubscribe === "function") {
        unsubscribe();
      }
    };
  }, []);

  const stats = [
    {
      label: "TOTAL USERS",
      value: loading ? "..." : String(metrics.registeredUsers || 0),
      icon: "👥",
      color: "#00B4D8",
      change: `${metrics.newUsers || 0} registered recently`,
      link: "/users",
    },
    {
      label: "CUSTOMERS",
      value: loading ? "..." : String(metrics.customers || 0),
      icon: "👤",
      color: "#818CF8",
      change: "Active vehicle renters & browsers",
      link: "/users",
    },
    {
      label: "APPROVED OWNERS",
      value: loading ? "..." : String(metrics.owners || 0),
      icon: "🚗",
      color: "#10B981",
      change: "Approved car hosts with fleet access",
      link: "/users",
    },
    {
      label: "OWNER APPLICATIONS",
      value: loading ? "..." : String(metrics.pendingOwnerApplications || 0),
      icon: "📋",
      color: "#F59E0B",
      change: `${metrics.pendingOwnerApplications || 0} applications awaiting review`,
      link: "/owner-applications",
    },
    {
      label: "DOCUMENT QUEUE",
      value: loading ? "..." : String(metrics.pendingDocuments || 0),
      icon: "🛡️",
      color: "#EC4899",
      change: `${metrics.pendingDocuments || 0} CNIC & license verifications`,
      link: "/document-verification",
    },
    {
      label: "FLEET & CARS",
      value: loading ? "..." : String(metrics.fleetVehicles || 0),
      icon: "🚘",
      color: "#38BDF8",
      change: `${metrics.pendingCars || 0} pending vehicle listings`,
      link: "/cars",
    },
    {
      label: "TOTAL BOOKINGS",
      value: loading ? "..." : String(metrics.totalBookings || 0),
      icon: "📅",
      color: "#A855F7",
      change: "Active & completed rental trips",
      link: "/bookings",
    },
  ];

  return (
    <div style={styles.container}>
      {/* Header section matching Flutter Admin Screen */}
      <div style={styles.header}>
        <div style={styles.headerLeft}>
          <div style={styles.tagBadge}>SAYYARAH OPERATIONS</div>
          <h2 style={styles.title}>System Overview</h2>
          <p style={styles.subtitle}>
            Live Firestore operations, host verification queue, vehicle approvals, and fleet metrics.
          </p>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
          <div style={styles.liveIndicator} title="Realtime Firestore synchronization active">
            <span style={styles.liveDot} />
            <span style={styles.liveText}>Live Sync</span>
          </div>
          <button onClick={loadMetrics} style={styles.refreshBtn} title="Force reload metrics">
            🔄 Refresh Metrics
          </button>
        </div>
      </div>

      {/* Error state if any */}
      {error && (
        <div style={styles.errorAlert}>
          <span>⚠️ {error}</span>
          <button onClick={loadMetrics} style={styles.errorRetry}>
            Retry
          </button>
        </div>
      )}

      {/* Attention Required Banners */}
      {!loading && (metrics.pendingHosts > 0 || metrics.pendingCars > 0) && (
        <div style={styles.actionsBanner}>
          <div style={styles.bannerLeft}>
            <span style={styles.bannerAlertIcon}>⚡</span>
            <div>
              <h4 style={styles.bannerActionTitle}>Administrative Queue Attention Required</h4>
              <p style={styles.bannerActionSubtitle}>
                {metrics.pendingHosts > 0 && (
                  <span>
                    • <strong>{metrics.pendingHosts}</strong> host verification{" "}
                    {metrics.pendingHosts === 1 ? "application" : "applications"} waiting in queue.{" "}
                  </span>
                )}
                {metrics.pendingCars > 0 && (
                  <span>
                    • <strong>{metrics.pendingCars}</strong> vehicle{" "}
                    {metrics.pendingCars === 1 ? "listing" : "listings"} pending approval before going live.
                  </span>
                )}
              </p>
            </div>
          </div>
          <div style={styles.bannerBtnGroup}>
            {metrics.pendingOwnerApplications > 0 && (
              <Link href="/owner-applications" style={styles.actionBtnAmber}>
                Review Owner Apps ({metrics.pendingOwnerApplications})
              </Link>
            )}
            {metrics.pendingDocuments > 0 && (
              <Link href="/document-verification" style={styles.actionBtnAmber}>
                Verify Documents ({metrics.pendingDocuments})
              </Link>
            )}
            {metrics.pendingCars > 0 && (
              <Link href="/cars" style={styles.actionBtnGreen}>
                Review Cars ({metrics.pendingCars})
              </Link>
            )}
          </div>
        </div>
      )}

      {/* Stat Cards Grid with Responsive Auto-Fit */}
      <div className="admin-stats-grid" style={styles.grid}>
        {stats.map((item) => (
          <Link
            key={item.label}
            href={item.link}
            style={{ textDecoration: "none", color: "inherit" }}
          >
            <StatCard
              label={item.label}
              value={item.value}
              icon={item.icon}
              change={item.change}
              color={item.color}
            />
          </Link>
        ))}
      </div>

      {/* Quick Navigation Cards */}
      <div style={styles.quickNavSection}>
        <h3 style={styles.sectionTitle}>Management Modules</h3>
        <div style={styles.quickNavGrid}>
          <Link href="/host-approvals" style={styles.navCard}>
            <div style={styles.navCardIconBox}>🛡️</div>
            <div style={styles.navCardMeta}>
              <h4 style={styles.navCardTitle}>Host Verification Queue</h4>
              <p style={styles.navCardDesc}>
                Review applicant CNIC front/back documents, driving licenses, and grant host mode.
              </p>
            </div>
            <span style={styles.navCardArrow}>→</span>
          </Link>

          <Link href="/cars" style={styles.navCard}>
            <div style={styles.navCardIconBox}>🚘</div>
            <div style={styles.navCardMeta}>
              <h4 style={styles.navCardTitle}>Fleet & Vehicle Approvals</h4>
              <p style={styles.navCardDesc}>
                Inspect vehicle photos, registration numbers, price tiers, and approve listings.
              </p>
            </div>
            <span style={styles.navCardArrow}>→</span>
          </Link>

          <Link href="/users" style={styles.navCard}>
            <div style={styles.navCardIconBox}>👥</div>
            <div style={styles.navCardMeta}>
              <h4 style={styles.navCardTitle}>User Account Directory</h4>
              <p style={styles.navCardDesc}>
                Browse customer profiles, contact numbers, verification status, and account creation dates.
              </p>
            </div>
            <span style={styles.navCardArrow}>→</span>
          </Link>
        </div>
      </div>

      {/* Rent-a-Car System Info Box */}
      <div style={styles.bannerBox}>
        <div style={styles.bannerIcon}>⚡</div>
        <div style={styles.bannerContent}>
          <h4 style={styles.bannerTitle}>Connected to Firebase Production Backend</h4>
          <p style={styles.bannerDesc}>
            Connected directly to Firebase Project <code>car-rental-app-90606</code>.
            Operations performed here instantly sync with all customer & host Flutter mobile clients:
            OLED Black (<code>#121212</code>), Card Surface (<code>#1E1E1E</code>), and Electric Cyan (<code>#00B4D8</code>).
          </p>
        </div>
      </div>
    </div>
  );
}

const styles = {
  container: {
    maxWidth: "1400px",
    margin: "0 auto",
  },
  header: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: "28px",
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
    padding: "4px 10px",
    borderRadius: "6px",
    backgroundColor: "rgba(0, 180, 216, 0.15)",
    border: "1px solid rgba(0, 180, 216, 0.4)",
    color: "#00E5FF",
    fontSize: "11px",
    fontWeight: "bold",
    letterSpacing: "0.8px",
  },
  title: {
    fontSize: "26px",
    fontWeight: "bold",
    color: "#FFFFFF",
    margin: "0",
    letterSpacing: "-0.5px",
  },
  subtitle: {
    fontSize: "13px",
    color: "#9E9E9E",
    margin: 0,
    lineHeight: "1.5",
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
  },
  errorAlert: {
    backgroundColor: "rgba(239, 68, 68, 0.15)",
    border: "1px solid #EF4444",
    color: "#F87171",
    padding: "10px 16px",
    borderRadius: "8px",
    marginBottom: "20px",
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    fontSize: "13px",
  },
  errorRetry: {
    backgroundColor: "#EF4444",
    color: "#FFFFFF",
    border: "none",
    padding: "4px 10px",
    borderRadius: "6px",
    fontSize: "12px",
    fontWeight: "600",
    cursor: "pointer",
  },
  actionsBanner: {
    backgroundColor: "rgba(245, 158, 11, 0.12)",
    border: "1px solid rgba(245, 158, 11, 0.35)",
    borderRadius: "12px",
    padding: "16px 20px",
    marginBottom: "28px",
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    flexWrap: "wrap",
    gap: "14px",
  },
  bannerLeft: {
    display: "flex",
    alignItems: "center",
    gap: "14px",
    flex: "1",
    minWidth: "260px",
  },
  bannerAlertIcon: {
    fontSize: "24px",
  },
  bannerActionTitle: {
    fontSize: "15px",
    fontWeight: "700",
    color: "#FBBF24",
    margin: "0 0 4px 0",
  },
  bannerActionSubtitle: {
    fontSize: "13px",
    color: "#FDE68A",
    margin: 0,
    lineHeight: "1.4",
  },
  bannerBtnGroup: {
    display: "flex",
    gap: "10px",
    flexWrap: "wrap",
  },
  actionBtnAmber: {
    backgroundColor: "#F59E0B",
    color: "#000000",
    padding: "8px 14px",
    borderRadius: "8px",
    fontSize: "12px",
    fontWeight: "800",
    textDecoration: "none",
    display: "inline-block",
  },
  actionBtnGreen: {
    backgroundColor: "#10B981",
    color: "#FFFFFF",
    padding: "8px 14px",
    borderRadius: "8px",
    fontSize: "12px",
    fontWeight: "800",
    textDecoration: "none",
    display: "inline-block",
  },
  grid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
    gap: "20px",
    marginBottom: "36px",
  },
  quickNavSection: {
    marginBottom: "36px",
  },
  sectionTitle: {
    fontSize: "18px",
    fontWeight: "700",
    color: "#FFFFFF",
    marginBottom: "16px",
  },
  quickNavGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))",
    gap: "16px",
  },
  navCard: {
    backgroundColor: "#1E1E1E",
    border: "1px solid rgba(255, 255, 255, 0.08)",
    borderRadius: "12px",
    padding: "18px",
    display: "flex",
    alignItems: "center",
    gap: "16px",
    textDecoration: "none",
    transition: "transform 0.2s ease, border-color 0.2s ease",
  },
  navCardIconBox: {
    width: "44px",
    height: "44px",
    borderRadius: "10px",
    backgroundColor: "rgba(0, 180, 216, 0.12)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontSize: "22px",
    flexShrink: 0,
    border: "1px solid rgba(0, 180, 216, 0.25)",
  },
  navCardMeta: {
    flex: 1,
    minWidth: 0,
  },
  navCardTitle: {
    fontSize: "15px",
    fontWeight: "700",
    color: "#FFFFFF",
    margin: "0 0 4px 0",
  },
  navCardDesc: {
    fontSize: "12px",
    color: "#9CA3AF",
    margin: 0,
    lineHeight: "1.4",
  },
  navCardArrow: {
    fontSize: "18px",
    color: "#00E5FF",
    fontWeight: "700",
  },
  bannerBox: {
    display: "flex",
    alignItems: "flex-start",
    gap: "16px",
    backgroundColor: "#1E1E1E",
    borderTop: "1px solid #282828",
    borderRight: "1px solid #282828",
    borderBottom: "1px solid #282828",
    borderLeft: "4px solid #00B4D8",
    borderRadius: "14px",
    padding: "22px",
    boxShadow: "0 4px 20px rgba(0, 0, 0, 0.25)",
  },
  bannerIcon: {
    fontSize: "24px",
    lineHeight: 1,
  },
  bannerContent: {
    flex: 1,
  },
  bannerTitle: {
    fontSize: "15px",
    fontWeight: "bold",
    color: "#00E5FF",
    margin: "0 0 6px 0",
  },
  bannerDesc: {
    fontSize: "13px",
    color: "#A0AEC0",
    margin: 0,
    lineHeight: "1.6",
  },
};
