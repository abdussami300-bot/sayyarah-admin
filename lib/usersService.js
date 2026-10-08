import {
  collection,
  doc,
  getDocs,
  updateDoc,
  onSnapshot,
} from "firebase/firestore";
import { db } from "@/lib/firebase";

/**
 * Normalizes a raw Firestore user document snapshot into a standardized user object.
 *
 * @param {import("firebase/firestore").DocumentSnapshot} docSnap
 * @returns {Object}
 */
export function parseUserDoc(docSnap) {
  const data = docSnap.data() || {};
  const rawRole = (data.role || "customer").toLowerCase().trim();
  const rawOwnerStatus = (data.ownerStatus || "").toUpperCase().trim();
  const isOwnerApproved =
    data.isOwnerApproved === true ||
    rawOwnerStatus === "APPROVED" ||
    (data.isHostVerified === true && rawRole === "owner");

  let ownerStatus = rawOwnerStatus;
  if (!ownerStatus) {
    if (isOwnerApproved) {
      ownerStatus = "APPROVED";
    } else if (data.isHostRequested === true || data.requestedRole === "owner" || data.verificationStatus === "pending") {
      ownerStatus = "PENDING_REVIEW";
    } else {
      ownerStatus = "NOT_APPLIED";
    }
  }

  const createdAtSec = data.createdAt?.seconds || 0;
  const isNew = data.isNewUser === true || (createdAtSec > 0 && Date.now() - createdAtSec * 1000 < 7 * 24 * 3600 * 1000);

  return {
    id: docSnap.id,
    uid: data.uid || docSnap.id,
    name: data.name || "Unnamed User",
    email: data.email || "",
    phone: data.phone || data.phoneNumber || "",
    role: rawRole,
    accountType: data.accountType || "customer",
    isOwnerApproved,
    ownerStatus,
    isNewUser: isNew,
    isCustomer: !isOwnerApproved || rawRole === "customer",
    isOwner: isOwnerApproved,
    isVerified: data.isVerified === true,
    isHostVerified: data.isHostVerified === true,
    verificationStatus:
      data.verificationStatus ||
      (data.isHostVerified || data.isVerified
        ? "verified"
        : data.cnicNumber
        ? "pending"
        : "unverified"),
    cnicNumber: data.cnicNumber || "",
    cnicStatus: data.cnicStatus || (data.cnicNumber ? "PENDING_REVIEW" : "NOT_SUBMITTED"),
    cnicFrontUrl: data.cnicFrontUrl || "",
    cnicBackUrl: data.cnicBackUrl || "",
    licenseNumber: data.licenseNumber || "",
    licenseStatus: data.licenseStatus || (data.licenseNumber ? "PENDING_REVIEW" : "NOT_SUBMITTED"),
    licenseExpiry: data.licenseExpiry || "",
    licenseUrl: data.licenseUrl || "",
    createdAt: data.createdAt || null,
    verifiedAt: data.verifiedAt || null,
    verificationReviewedAt: data.verificationReviewedAt || null,
    rejectionReason: data.verificationRejectionReason || "",
    ...data,
  };
}

/**
 * Sorts users in descending order of creation or activity.
 *
 * @param {Array<Object>} list
 * @returns {Array<Object>}
 */
function sortUsersList(list) {
  return list.sort((a, b) => {
    const aTime = a.createdAt?.seconds || 0;
    const bTime = b.createdAt?.seconds || 0;
    return bTime - aTime;
  });
}

/**
 * Subscribes to real-time changes in the 'users' collection using onSnapshot.
 * Allows the admin panel to update automatically without requiring manual page refresh.
 *
 * @param {Function} onData - Callback receiving updated array of users
 * @param {Function} [onError] - Callback for subscription errors
 * @returns {Function} Unsubscribe function
 */
export function subscribeUsers(onData, onError) {
  const usersRef = collection(db, "users");

  return onSnapshot(
    usersRef,
    (querySnapshot) => {
      const usersList = [];
      querySnapshot.forEach((docSnap) => {
        usersList.push(parseUserDoc(docSnap));
      });
      sortUsersList(usersList);
      onData(usersList);
    },
    (err) => {
      console.error("Users realtime subscription error:", err);
      if (onError) onError(err);
    }
  );
}

/**
 * Fetches all user documents from the Firestore 'users' collection once.
 * 
 * @returns {Promise<Array<Object>>} Array of user objects with id and document fields
 */
export async function fetchUsers() {
  const usersRef = collection(db, "users");
  const querySnapshot = await getDocs(usersRef);

  const usersList = [];
  querySnapshot.forEach((docSnap) => {
    usersList.push(parseUserDoc(docSnap));
  });

  return sortUsersList(usersList);
}

/**
 * Promotes or demotes a user's system role in Firestore ('admin' or 'customer' or 'host').
 * Matches the original Flutter AdminPanelScreen role-switching logic.
 *
 * @param {string} userId - Document ID in Firestore 'users' collection
 * @param {string} newRole - Target role ('admin', 'customer', 'host')
 * @returns {Promise<void>}
 */
export async function updateUserRole(userId, newRole) {
  if (!userId) throw new Error("User ID is required to update role.");
  if (!newRole) throw new Error("New role is required.");

  const userDocRef = doc(db, "users", userId);
  await updateDoc(userDocRef, {
    role: newRole.toLowerCase().trim(),
  });
}
