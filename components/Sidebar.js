"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { signOut, onAuthStateChanged } from "firebase/auth";
import { auth } from "@/lib/firebase";

const navItems = [
  { label: "Dashboard", href: "/dashboard", icon: "📊" },
  { label: "Users", href: "/users", icon: "👥" },
  { label: "Owner Applications", href: "/owner-applications", icon: "🚗" },
  { label: "Document Verification", href: "/document-verification", icon: "🛡️" },
  { label: "Cars & Fleet", href: "/cars", icon: "🚘" },
  { label: "Bookings", href: "/bookings", icon: "📅" },
  { label: "Activity & Audit Logs", href: "/audit-logs", icon: "📜" },
  { label: "Payments", href: "/payments", icon: "💳" },
];

export default function Sidebar({ isOpen = false, onClose = () => {} }) {
  const pathname = usePathname();
  const router = useRouter();
  const [adminEmail, setAdminEmail] = useState("admin@sayyarah.com");

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      if (user && user.email) {
        setAdminEmail(user.email);
      }
    });
    return () => unsubscribe();
  }, []);

  const handleSignOut = async () => {
    try {
      await signOut(auth);
      router.replace("/login");
    } catch (err) {
      console.error("Error signing out:", err);
    }
  };

  return (
    <aside
      className={`admin-sidebar ${isOpen ? "open" : ""}`}
      style={styles.sidebar}
    >
      {/* 1. Header / Brand with Mobile Close Button */}
      <div style={styles.brandContainer}>
        <div style={styles.brandLeft}>
          <img
            src="/sayyarah-icon.png"
            alt="Sayyarah Logo"
            style={styles.brandLogo}
          />
          <div>
            <h2 style={styles.brandTitle}>SAYYARAH</h2>
            <span style={styles.brandSubtitle}>Admin Console</span>
          </div>
        </div>

        {/* Close Button on Mobile */}
        {isOpen && (
          <button
            onClick={onClose}
            style={styles.closeBtn}
            aria-label="Close sidebar"
          >
            ✕
          </button>
        )}
      </div>

      {/* 2. Admin Profile Pill */}
      <div style={styles.profilePill}>
        <div style={styles.avatar}>A</div>
        <div style={styles.profileDetails}>
          <span style={styles.profileName}>Admin Console</span>
          <span style={styles.profileEmail}>{adminEmail}</span>
        </div>
      </div>

      {/* 3. Section Label */}
      <div style={styles.sectionHeader}>NAVIGATION</div>

      {/* 4. Navigation Links with CSS Hover & Active Classes */}
      <nav style={styles.nav}>
        {navItems.map((item) => {
          const isSelected = pathname === item.href;
          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={onClose}
              className={`sidebar-link ${isSelected ? "active" : ""}`}
            >
              <span style={styles.navIcon}>{item.icon}</span>
              <span style={styles.navText}>{item.label}</span>
              {isSelected && <div style={styles.activeDot} />}
            </Link>
          );
        })}
      </nav>

      {/* 5. Footer with Sign Out */}
      <div style={styles.footerContainer}>
        <div style={styles.divider} />
        <div
          className="signout-btn"
          onClick={handleSignOut}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              handleSignOut();
            }
          }}
          aria-label="Sign out of admin console"
        >
          <span style={styles.signOutIcon}>🚪</span>
          <span style={styles.signOutText}>Sign Out</span>
        </div>
      </div>
    </aside>
  );
}

const styles = {
  sidebar: {
    width: "270px",
    minWidth: "270px",
    height: "100vh",
    backgroundColor: "#181818",
    borderRight: "1px solid #282828",
    display: "flex",
    flexDirection: "column",
    position: "sticky",
    top: 0,
    userSelect: "none",
  },
  brandContainer: {
    padding: "20px 24px",
    borderBottom: "1px solid #242424",
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
  },
  brandLeft: {
    display: "flex",
    alignItems: "center",
    gap: "14px",
  },
  closeBtn: {
    background: "transparent",
    border: "none",
    color: "#A0AEC0",
    fontSize: "18px",
    cursor: "pointer",
    padding: "4px 8px",
    borderRadius: "6px",
  },
  brandLogo: {
    width: "38px",
    height: "38px",
    borderRadius: "10px",
    objectFit: "contain",
    boxShadow: "0 2px 10px rgba(0, 180, 216, 0.3)",
    flexShrink: 0,
  },
  brandTitle: {
    fontSize: "17px",
    fontWeight: "900",
    color: "#FFFFFF",
    letterSpacing: "1.2px",
    margin: 0,
    lineHeight: 1.2,
  },
  brandSubtitle: {
    fontSize: "11px",
    color: "#9E9E9E",
    marginTop: "2px",
    display: "block",
  },
  profilePill: {
    margin: "16px 16px 8px 16px",
    padding: "12px",
    backgroundColor: "#222222",
    borderRadius: "12px",
    border: "1px solid rgba(255, 255, 255, 0.08)",
    display: "flex",
    alignItems: "center",
    gap: "10px",
  },
  avatar: {
    width: "36px",
    height: "36px",
    borderRadius: "50%",
    backgroundColor: "#00B4D8",
    color: "#FFFFFF",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontWeight: "bold",
    fontSize: "14px",
    boxShadow: "0 2px 8px rgba(0, 180, 216, 0.35)",
  },
  profileDetails: {
    display: "flex",
    flexDirection: "column",
    overflow: "hidden",
  },
  profileName: {
    fontSize: "13px",
    fontWeight: "bold",
    color: "#FFFFFF",
    whiteSpace: "nowrap",
    overflow: "hidden",
    textOverflow: "ellipsis",
  },
  profileEmail: {
    fontSize: "11px",
    color: "#9E9E9E",
    whiteSpace: "nowrap",
    overflow: "hidden",
    textOverflow: "ellipsis",
  },
  sectionHeader: {
    padding: "14px 24px 8px 24px",
    fontSize: "11px",
    color: "#757575",
    fontWeight: "bold",
    letterSpacing: "1px",
  },
  nav: {
    padding: "0 14px",
    display: "flex",
    flexDirection: "column",
    gap: "6px",
    flex: 1,
    overflowY: "auto",
  },
  navIcon: {
    fontSize: "16px",
    display: "flex",
    alignItems: "center",
  },
  navText: {
    flex: 1,
  },
  activeDot: {
    width: "6px",
    height: "6px",
    borderRadius: "50%",
    backgroundColor: "#00E5FF",
    boxShadow: "0 0 8px #00E5FF",
  },
  footerContainer: {
    padding: "16px",
    marginTop: "auto",
  },
  divider: {
    height: "1px",
    backgroundColor: "#242424",
    marginBottom: "14px",
  },
  signOutIcon: {
    fontSize: "16px",
  },
  signOutText: {
    color: "#EF4444",
    fontWeight: "bold",
    fontSize: "13px",
  },
};
