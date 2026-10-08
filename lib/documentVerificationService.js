import {
  collection,
  doc,
  updateDoc,
  serverTimestamp,
  onSnapshot,
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import { logAdminAction, AUDIT_ACTIONS } from "./auditLogService";

/**
 * Normalizes document verification records from user documents.
 */
export function parseDocumentItem(docSnap) {
  const data = docSnap.data() || {};
  const cnicNumber = data.cnicNumber || "";
  const licenseNumber = data.licenseNumber || "";
  const cnicFrontUrl = data.cnicFrontUrl || "";
  const cnicBackUrl = data.cnicBackUrl || "";
  const licenseUrl = data.licenseUrl || "";

  // CNIC Status
  let cnicStatus = (data.cnicStatus || "").toUpperCase();
  if (!cnicStatus) {
    if (data.isVerified === true && cnicNumber) {
      cnicStatus = "VERIFIED";
    } else if (cnicNumber || cnicFrontUrl || cnicBackUrl) {
      cnicStatus = "PENDING_REVIEW";
    } else {
      cnicStatus = "NOT_SUBMITTED";
    }
  }

  // License Status
  let licenseStatus = (data.licenseStatus || "").toUpperCase();
  if (!licenseStatus) {
    if (data.isVerified === true && licenseNumber) {
      licenseStatus = "VERIFIED";
    } else if (licenseNumber || licenseUrl) {
      licenseStatus = "PENDING_REVIEW";
    } else {
      licenseStatus = "NOT_SUBMITTED";
    }
  }

  const isCnicUpdated = cnicStatus === "UPDATED_REVIEW_REQUIRED";
  const isLicenseUpdated = licenseStatus === "UPDATED_REVIEW_REQUIRED";

  return {
    id: docSnap.id,
    uid: data.uid || docSnap.id,
    name: data.name || "Unnamed User",
    email: data.email || "",
    phone: data.phone || data.phoneNumber || "",
    role: data.role || "customer",
    cnicNumber,
    cnicFrontUrl,
    cnicBackUrl,
    cnicStatus,
    isCnicUpdated,
    licenseNumber,
    licenseExpiry: data.licenseExpiry || "",
    licenseUrl,
    licenseStatus,
    isLicenseUpdated,
    hasDocuments: !!(cnicNumber || licenseNumber || cnicFrontUrl || licenseUrl),
    needsAttention:
      cnicStatus === "PENDING_REVIEW" ||
      cnicStatus === "UPDATED_REVIEW_REQUIRED" ||
      licenseStatus === "PENDING_REVIEW" ||
      licenseStatus === "UPDATED_REVIEW_REQUIRED",
    submittedAt: data.verificationSubmittedAt || data.createdAt || null,
    cnicRejectionReason: data.cnicRejectionReason || "",
    licenseRejectionReason: data.licenseRejectionReason || "",
    ...data,
  };
}

/**
 * Subscribes to users with submitted identity documents.
 */
export function subscribeDocumentVerifications(onData, onError) {
  const usersRef = collection(db, "users");

  return onSnapshot(
    usersRef,
    (snapshot) => {
      const items = [];
      snapshot.forEach((d) => {
        const item = parseDocumentItem(d);
        if (item.hasDocuments) {
          items.push(item);
        }
      });

      // Sort items requiring attention first, then newest
      items.sort((a, b) => {
        if (a.needsAttention && !b.needsAttention) return -1;
        if (!a.needsAttention && b.needsAttention) return 1;
        const aT = a.submittedAt?.seconds || 0;
        const bT = b.submittedAt?.seconds || 0;
        return bT - aT;
      });

      onData(items);
    },
    (err) => {
      console.error("Document verifications subscription error:", err);
      if (onError) onError(err);
    }
  );
}

/**
 * Verifies CNIC for a user.
 */
export async function verifyCnic(userId, adminEmail = "admin@sayyarah.com") {
  if (!userId) throw new Error("User ID is required.");
  const userRef = doc(db, "users", userId);
  await updateDoc(userRef, {
    cnicStatus: "VERIFIED",
    isVerified: true,
    verificationStatus: "verified",
    cnicVerifiedAt: serverTimestamp(),
    cnicVerifiedBy: adminEmail,
    cnicRejectionReason: "",
  });

  await logAdminAction({
    action: AUDIT_ACTIONS.CNIC_VERIFIED,
    targetType: "document",
    targetId: userId,
    adminEmail,
    previousStatus: "PENDING_REVIEW",
    newStatus: "VERIFIED",
    reason: "CNIC document verified by admin.",
  });
}

/**
 * Rejects CNIC for a user.
 */
export async function rejectCnic(userId, reason = "", adminEmail = "admin@sayyarah.com") {
  if (!userId) throw new Error("User ID is required.");
  const userRef = doc(db, "users", userId);
  await updateDoc(userRef, {
    cnicStatus: "REJECTED",
    isVerified: false,
    verificationStatus: "rejected",
    cnicReviewedAt: serverTimestamp(),
    cnicReviewedBy: adminEmail,
    cnicRejectionReason: reason || "CNIC document rejected.",
  });

  await logAdminAction({
    action: AUDIT_ACTIONS.CNIC_REJECTED,
    targetType: "document",
    targetId: userId,
    adminEmail,
    previousStatus: "PENDING_REVIEW",
    newStatus: "REJECTED",
    reason,
  });
}

/**
 * Verifies Driving License for a user.
 */
export async function verifyLicense(userId, adminEmail = "admin@sayyarah.com") {
  if (!userId) throw new Error("User ID is required.");
  const userRef = doc(db, "users", userId);
  await updateDoc(userRef, {
    licenseStatus: "VERIFIED",
    licenseVerifiedAt: serverTimestamp(),
    licenseVerifiedBy: adminEmail,
    licenseRejectionReason: "",
  });

  await logAdminAction({
    action: AUDIT_ACTIONS.LICENSE_VERIFIED,
    targetType: "document",
    targetId: userId,
    adminEmail,
    previousStatus: "PENDING_REVIEW",
    newStatus: "VERIFIED",
    reason: "Driving license verified by admin.",
  });
}

/**
 * Rejects Driving License for a user.
 */
export async function rejectLicense(userId, reason = "", adminEmail = "admin@sayyarah.com") {
  if (!userId) throw new Error("User ID is required.");
  const userRef = doc(db, "users", userId);
  await updateDoc(userRef, {
    licenseStatus: "REJECTED",
    licenseReviewedAt: serverTimestamp(),
    licenseReviewedBy: adminEmail,
    licenseRejectionReason: reason || "Driving license rejected.",
  });

  await logAdminAction({
    action: AUDIT_ACTIONS.LICENSE_REJECTED,
    targetType: "document",
    targetId: userId,
    adminEmail,
    previousStatus: "PENDING_REVIEW",
    newStatus: "REJECTED",
    reason,
  });
}
