// This phone's QR token (a "device" credential). The server returns it once and keeps only
// its hash, so the phone is the only place it lives. It never leaves the phone except inside the QR.
//
// Saved together with the owner's id: if a different student logs in on the same phone,
// they must not be shown the previous student's QR.
const KEY = "phoneQr";

type Saved = { userId: string; token: string };

export const phoneQr = {
  get(userId: string) {
    try {
      const saved = JSON.parse(localStorage.getItem(KEY) ?? "null") as Saved | null;
      return saved?.userId === userId ? saved.token : null;
    } catch {
      return null;
    }
  },
  save(userId: string, token: string) {
    localStorage.setItem(KEY, JSON.stringify({ userId, token } satisfies Saved));
  },
  clear() {
    localStorage.removeItem(KEY);
  },
};
