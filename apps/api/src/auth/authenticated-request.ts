import type { Request } from "express";

export interface JwtAccessPayload {
  sub: string;
  email: string;
  iat: number;
  exp: number;
}

export interface JwtRefreshPayload {
  sub: string;
  jti: string;
  iat: number;
  exp: number;
}

export interface AuthenticatedRequest extends Request {
  user: JwtAccessPayload;
}
