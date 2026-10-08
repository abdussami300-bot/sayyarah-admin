import {
  collection,
  doc,
  updateDoc,
  serverTimestamp,
  onSnapshot,
  getDocs,
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import { logAdminAction, AUDIT_ACTIONS } from "./auditLogService";

/**
 * Normalizes an owner application record from a user doc.
 */
export function parseOwnerApplication(docSnap) {
  const data = docSnap.data() || {};
  const isHostRequested = data.isHostRequested === true;
  const requestedRole = (data.requestedRole || "").toLowerCase();
  const rawOwnerStatus = (data.ownerStatus || "").toUpperCase();
  const isOwnerApproved = data.isOwnerApproved === true || rawOwnerStatus === "APPROVED";
  const st = (data.verificationStatus || "").toLowerCase();

  let resolvedStatus = rawOwnerStatus;
  if (!resolvedStatus) {
    if (isOwnerApproved || data.isHostVerified === true) {
      resolvedStatus = "APPROVED";
    } else if (isHostRequested || requestedRole === "owner" || st === "pending") {
      resolvedStatus = "PENDING_REVIEW";
    } else {
      resolvedStatus = "NOT_APPLIED";
    }
  }

  // Determine whether applicant is a brand new user or an existing customer upgrading
  const createdAtSec = data.createdAt?.seconds || 0;
  const isNew = data.isNewUser === true || (createdAtSec > 0 && Date.now() - createdAtSec * 1000 < 3 * 24 * 3600 * 1000);

  return {
    id: docSnap.id,
    uid: data.uid || docSnap.id,
    name: data.name || "Unnamed Applicant",
    email: data.email || "",
    phone: data.phone || data.phoneNumber || "",
    ownerStatus: resolvedStatus,
    isOwnerApproved,
    isExistingCustomer: !isNew,
    isNewUser: isNew,
    submissionType: isNew ? "NEW_ACCOUNT_APPLICATION" : "EXISTING_CUSTOMER_UPGRADE",
    requestedRole: data.requestedRole || "owner",
    cnicNumber: data.cnicNumber || "",
    cnicFrontUrl: data.cnicFrontUrl || "",
    cnicBackUrl: data.cnicBackUrl || "",
    cnicStatus: data.cnicStatus || (data.cnicNumber ? "PENDING_REVIEW" : "NOT_SUBMITTED"),
    hostCar: data.hostCar || null,
    hostCarId: data.hostCarId || null,
    submittedAt: data.verificationSubmittedAt || data.createdAt || null,
    reviewedAt: data.ownerReviewedAt || null,
    reviewedBy: data.ownerReviewedBy || "",
    rejectionReason: data.ownerRejectionReason || data.verificationRejectionReason || "",
    correctionNotes: data.ownerCorrectionNotes || "",
    ...data,
  };
}

/**
 * Subscribes in real-time to all users who have applied for Owner status.
 *
 * @param {Function} onData - Receives list of applications
 * @param {Function} [onError]
 * @returns {Function} Unsubscribe
 */
export function subscribeOwnerApplications(onData, onError) {
  const usersRef = collection(db, "users");

  return onSnapshot(
    usersRef,
    (snapshot) => {
      const applications = [];
      snapshot.forEach((d) => {
        const u = parseOwnerApplication(d);
        // Only include users who have applied, are pending, approved, rejected, or need correction
        if (
          u.ownerStatus !== "NOT_APPLIED" ||
          u.isHostRequested === true ||
          u.requestedRole === "owner" ||
          u.hostCar != null
        ) {
          applications.push(u);
        }
      });

      // Sort pending first, then by submission timestamp desc
      applications.sort((a, b) => {
        if (a.ownerStatus === "PENDING_REVIEW" && b.ownerStatus !== "PENDING_REVIEW") return -1;
        if (b.ownerStatus === "PENDING_REVIEW" && a.ownerStatus !== "PENDING_REVIEW") return 1;
        const aT = a.submittedAt?.seconds || 0;
        const bT = b.submittedAt?.seconds || 0;
        return bT - aT;
      });

      onData(applications);
    },
    (err) => {
      console.error("Owner applications subscription error:", err);
      if (onError) onError(err);
    }
  );
}

/**
 * Approves an owner application.
 * Grants owner privileges: sets ownerStatus='APPROVED', isOwnerApproved=true, role='owner', isHostVerified=true.
 * Automatically approves the applicant's pending car listing if present.
 */
export async function approveOwnerApplication(userId, adminEmail = "admin@sayyarah.com", notes = "") {
  if (!userId) throw new Error("User ID is required.");

  const userRef = doc(db, "users", userId);
  await updateDoc(userRef, {
    ownerStatus: "APPROVED",
    isOwnerApproved: true,
    role: "owner",
    isHostVerified: true,
    isHostRequested: false,
    ownerApprovedAt: serverTimestamp(),
    ownerApprovedBy: adminEmail,
    ownerApprovalNotes: notes,
    // If CNIC was submitted, also mark CNIC as verified
    cnicStatus: "VERIFIED",
    isVerified: true,
  });

  // Log action
  await logAdminAction({
    action: AUDIT_ACTIONS.OWNER_APPROVED,
    targetType: "owner_application",
    targetId: userId,
    adminEmail,
    previousStatus: "PENDING_REVIEW",
    newStatus: "APPROVED",
    reason: notes || "Owner application approved by admin.",
  });
}

/**
 * Rejects an owner application.
 * Retains user's customer role.
 */
export async function rejectOwnerApplication(userId, reason = "", adminEmail = "admin@sayyarah.com") {
  if (!userId) throw new Error("User ID is required.");

  const userRef = doc(db, "users", userId);
  await updateDoc(userRef, {
    ownerStatus: "REJECTED",
    isOwnerApproved: false,
    role: "customer", // Retain as customer
    isHostVerified: false,
    ownerReviewedAt: serverTimestamp(),
    ownerReviewedBy: adminEmail,
    ownerRejectionReason: reason || "Owner application declined.",
  });

  await logAdminAction({
    action: AUDIT_ACTIONS.OWNER_REJECTED,
    targetType: "owner_application",
    targetId: userId,
    adminEmail,
    previousStatus: "PENDING_REVIEW",
    newStatus: "REJECTED",
    reason,
  });
}

/**
 * Requests corrections / resubmission from the applicant.
 */
export async function requestOwnerCorrection(userId, correctionNote = "", adminEmail = "admin@sayyarah.com") {
  if (!userId) throw new Error("User ID is required.");

  const userRef = doc(db, "users", userId);
  await updateDoc(userRef, {
    ownerStatus: "NEEDS_CORRECTION",
    isOwnerApproved: false,
    ownerReviewedAt: serverTimestamp(),
    ownerReviewedBy: adminEmail,
    ownerCorrectionNotes: correctionNote,
  });

  await logAdminAction({
    action: AUDIT_ACTIONS.OWNER_CORRECTION_REQUESTED,
    targetType: "owner_application",
    targetId: userId,
    adminEmail,
    previousStatus: "PENDING_REVIEW",
    newStatus: "NEEDS_CORRECTION",
    reason: correctionNote,
  });
}

/**
 * Suspends an approved owner.
 */
export async function suspendOwner(userId, reason = "", adminEmail = "admin@sayyarah.com") {
  if (!userId) throw new Error("User ID is required.");

  const userRef = doc(db, "users", userId);
  await updateDoc(userRef, {
    ownerStatus: "SUSPENDED",
    isOwnerApproved: false,
    ownerReviewedAt: serverTimestamp(),
    ownerReviewedBy: adminEmail,
    ownerSuspensionReason: reason,
  });

  await logAdminAction({
    action: AUDIT_ACTIONS.OWNER_SUSPENDED,
    targetType: "user",
    targetId: userId,
    adminEmail,
    previousStatus: "APPROVED",
    newStatus: "SUSPENDED",
    reason,
  });
}
