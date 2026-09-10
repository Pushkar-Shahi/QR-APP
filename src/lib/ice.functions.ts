import { createServerFn } from "@tanstack/react-start";

/**
 * Returns ICE servers. STUN is always included; a TURN relay is added when the
 * TURN_URL / TURN_USERNAME / TURN_CREDENTIAL secrets are configured.
 */
export const getIceServers = createServerFn({ method: "GET" }).handler(async () => {
  const servers: RTCIceServer[] = [
    { urls: "stun:stun.cloudflare.com:3478" },
    { urls: "stun:stun.l.google.com:19302" },
  ];
  const turnUrl = process.env["TURN_URL"];
  const turnUser = process.env["TURN_USERNAME"];
  const turnCred = process.env["TURN_CREDENTIAL"];
  if (turnUrl && turnUser && turnCred) {
    servers.push({
      urls: turnUrl.split(",").map((u) => u.trim()),
      username: turnUser,
      credential: turnCred,
    });
  }
  return { iceServers: servers, hasTurn: Boolean(turnUrl && turnUser && turnCred) };
});
