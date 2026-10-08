import {
  collection,
  doc,
  addDoc,
  getDocs,
  query,
  orderBy,
  limit,
  serverTimestamp,
  onSnapshot,
} from "firebase/firestore";
import { db } from "@/lib/firebase";

/**
 * Audit Log Actions constants
 */
export const AUDIT_ACTIONS = {
  OWNER_APPROVED: "OWNER_APPROVED",
  OWNER_REJECTED: "OWNER_REJECTED",
  OWNER_CORRECTION_REQUESTED: "OWNER_CORRECTION_REQUESTED",
  OWNER_SUSPENDED: "OWNER_SUSPENDED",
  CNIC_VERIFIED: "CNIC_VERIFIED",
  CNIC_REJECTED: "CNIC_REJECTED",
  LICENSE_VERIFIED: "LICENSE_VERIFIED",
  LICENSE_REJECTED: "LICENSE_REJECTED",
  CAR_APPROVED: "CAR_APPROVED",
  CAR_REJECTED: "CAR_REJECTED",
  CAR_CHANGES_REQUESTED: "CAR_CHANGES_REQUESTED",
  USER_ROLE_CHANGED: "USER_ROLE_CHANGED",
  USER_STATUS_CHANGED: "USER_STATUS_CHANGED",
};

/**
 * Creates an immutable audit log entry in Firestore 'audit_logs' collection.
 *
 * @param {Object} params
 * @param {string} params.action - AUDIT_ACTIONS enum
 * @param {string} params.targetType - 'user' | 'owner_application' | 'document' | 'car' | 'booking'
 * @param {string} params.targetId - ID of target entity
 * @param {string} [params.targetName] - Display name or identifier of target
 * @param {string} [params.adminEmail] - Performing admin email
 * @param {string} [params.previousStatus] - Previous status string
 * @param {string} [params.newStatus] - New status string
 * @param {string} [params.reason] - Admin rejection or review note
 * @param {Object} [params.metadata] - Extra context
 * @returns {Promise<string>} Created document ID
 */
export async function logAdminAction({
  action,
  targetType,
  targetId,
  targetName = "",
  adminEmail = "admin@sayyarah.com",
  previousStatus = "",
  newStatus = "",
  reason = "",
  metadata = {},
}) {
  try {
    const logsRef = collection(db, "audit_logs");
    const docRef = await addDoc(logsRef, {
      action,
      targetType,
      targetId,
      targetName,
      adminEmail,
      previousStatus,
      newStatus,
      reason,
      metadata,
      timestamp: serverTimestamp(),
    });
    return docRef.id;
  } catch (err) {
    console.error("Failed to write audit log:", err);
    return null;
  }
}

/**
 * Subscribes to recent audit logs in real-time.
 *
 * @param {Function} onData - Callback receiving logs array
 * @param {Function} [onError] - Error callback
 * @param {number} [maxCount=100] - Limit of items to stream
 * @returns {Function} Unsubscribe function
 */
export function subscribeAuditLogs(onData, onError, maxCount = 100) {
  const logsRef = collection(db, "audit_logs");
  const q = query(logsRef, orderBy("timestamp", "desc"), limit(maxCount));

  return onSnapshot(
    q,
    (snapshot) => {
      const logs = [];
      snapshot.forEach((d) => {
        const data = d.data();
        logs.push({
          id: d.id,
          ...data,
          dateFormatted: data.timestamp?.toDate
            ? data.timestamp.toDate().toLocaleString()
            : "Just now",
        });
      });
      onData(logs);
    },
    (err) => {
      console.error("Audit logs subscription error:", err);
      if (onError) onError(err);
    }
  );
}

/**
 * Fetches recent audit logs once.
 */
export async function fetchAuditLogs(maxCount = 50) {
  const logsRef = collection(db, "audit_logs");
  const q = query(logsRef, orderBy("timestamp", "desc"), limit(maxCount));
  const snap = await getDocs(q);
  const logs = [];
  snap.forEach((d) => {
    const data = d.data();
    logs.push({
      id: d.id,
      ...data,
      dateFormatted: data.timestamp?.toDate
        ? data.timestamp.toDate().toLocaleString()
        : "Just now",
    });
  });
  return logs;
}
