import { redirect } from "react-router";
import { api, tokens } from "~/lib/api";
import { resetMe } from "~/lib/auth";
import { phoneQr } from "~/lib/phone-qr";

// No page here, just an action: submit(null, { method: "post", action: "/logout" })
export async function clientAction() {
  const refreshToken = tokens.refresh;
  if (refreshToken) {
    // tell the server to kill the refresh token; log out locally even if this fails
    await api("/api/auth/logout", { method: "POST", body: { refreshToken } }).catch(() => {});
  }
  tokens.clear();
  phoneQr.clear(); // shared phones: the next student must not see this QR
  resetMe();
  return redirect("/login");
}

export async function clientLoader() {
  return redirect("/");
}
