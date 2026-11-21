import { io } from "socket.io-client";

export const socket = io({
  autoConnect: false,
  auth: (cb) =>
    cb({
      guestId: localStorage.getItem("ludo_gid") || "",
      name: localStorage.getItem("ludo_name") || "",
    }),
});