export type ServerRole = "admin" | "support" | "publisher" | "member";

export type SessionUser = {
  address: string;
  roles: ServerRole[];
  caps: string[];
};

export type AuthedRequestUser = SessionUser;

export {}; // ensure this file is treated as a module

declare global {
  // eslint-disable-next-line no-var
  var __WUNDR_STARTED__: boolean | undefined;
}
