const { onCall, HttpsError } = require("firebase-functions/v2/https");
const { initializeApp } = require("firebase-admin/app");
const { getAuth } = require("firebase-admin/auth");
const { getFirestore, FieldValue } = require("firebase-admin/firestore");

initializeApp();
const db = getFirestore();

const OWNER_EMAIL = "andersoncastelhano2018@gmail.com";
const MAX_ACCOUNTS_PER_DEVICE = 3;

async function isAdminRequest(auth) {
  if (!auth) return false;
  const email = String(auth.token.email || "").toLowerCase();
  if (email === OWNER_EMAIL.toLowerCase()) return true;

  const snap = await db.doc(`admins/${auth.uid}`).get();
  return snap.exists && snap.data().active === true;
}

exports.claimDeviceSlot = onCall(async (request) => {
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "Faça login primeiro.");
  }

  const deviceId = String(request.data?.deviceId || "").trim();
  if (!deviceId || deviceId.length < 8 || deviceId.length > 200) {
    throw new HttpsError("invalid-argument", "Identificador do dispositivo inválido.");
  }

  // Proprietário/admin não consome vaga.
  if (await isAdminRequest(request.auth)) {
    return { ok: true, bypass: true };
  }

  const uid = request.auth.uid;
  const ref = db.doc(`devices/${deviceId}`);

  await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const data = snap.exists ? snap.data() : {};
    const uids = Array.isArray(data.accountUids) ? data.accountUids : [];

    if (uids.includes(uid)) {
      tx.set(ref, {
        lastSeenAt: FieldValue.serverTimestamp()
      }, { merge: true });
      return;
    }

    if (uids.length >= MAX_ACCOUNTS_PER_DEVICE) {
      throw new HttpsError(
        "resource-exhausted",
        "Este dispositivo já atingiu o limite de 3 contas."
      );
    }

    tx.set(ref, {
      accountUids: [...uids, uid],
      count: uids.length + 1,
      createdAt: data.createdAt || FieldValue.serverTimestamp(),
      lastSeenAt: FieldValue.serverTimestamp()
    }, { merge: true });
  });

  return { ok: true, max: MAX_ACCOUNTS_PER_DEVICE };
});

async function deleteCollection(path, batchSize = 300) {
  while (true) {
    const snap = await db.collection(path).limit(batchSize).get();
    if (snap.empty) break;

    const batch = db.batch();
    snap.docs.forEach((d) => batch.delete(d.ref));
    await batch.commit();

    if (snap.size < batchSize) break;
  }
}

exports.adminDeleteUser = onCall(async (request) => {
  if (!request.auth || !(await isAdminRequest(request.auth))) {
    throw new HttpsError("permission-denied", "Somente o administrador pode excluir usuários.");
  }

  const uid = String(request.data?.uid || "").trim();
  if (!uid) {
    throw new HttpsError("invalid-argument", "UID obrigatório.");
  }

  // Nunca permite apagar a própria conta proprietária por acidente.
  const target = await getAuth().getUser(uid).catch(() => null);
  if (target && String(target.email || "").toLowerCase() === OWNER_EMAIL.toLowerCase()) {
    throw new HttpsError("failed-precondition", "A conta proprietária não pode ser excluída.");
  }

  // Remove dados conhecidos do usuário.
  await deleteCollection(`users/${uid}/horas`);
  await deleteCollection(`users/${uid}/gastos`);
  await deleteCollection(`users/${uid}/fechamentos`);
  await deleteCollection(`users/${uid}/config`);

  await db.doc(`users/${uid}`).delete().catch(() => {});
  await db.doc(`access/${uid}`).delete().catch(() => {});
  await db.doc(`admins/${uid}`).delete().catch(() => {});

  // Libera a vaga desse UID em qualquer browser/dispositivo registrado.
  const devices = await db.collection("devices")
    .where("accountUids", "array-contains", uid)
    .get();

  for (const d of devices.docs) {
    const arr = Array.isArray(d.data().accountUids) ? d.data().accountUids : [];
    const next = arr.filter((x) => x !== uid);
    await d.ref.set({
      accountUids: next,
      count: next.length,
      lastSeenAt: FieldValue.serverTimestamp()
    }, { merge: true });
  }

  if (target) {
    await getAuth().deleteUser(uid);
  }

  return { ok: true, message: "Usuário e dados excluídos definitivamente." };
});
