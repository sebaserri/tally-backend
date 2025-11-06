import { Injectable } from "@nestjs/common";
import { PassportStrategy } from "@nestjs/passport";
import { ExtractJwt, Strategy } from "passport-jwt";
import { Request } from "express";
import { ACCESS_COOKIE } from "./auth.constants";

type JwtPayload = {
  sub: string;
  email: string;
  role: "ADMIN" | "VENDOR" | "GUARD" | string;
  vendorId?: string;
  name?: string;
};

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor() {
    super({
      jwtFromRequest: ExtractJwt.fromExtractors([
        JwtStrategy.extractFromCookie,
        ExtractJwt.fromAuthHeaderAsBearerToken(),
      ]),
      ignoreExpiration: false,
      secretOrKey: process.env.JWT_SECRET || "change-me",
    });
  }

  async validate(payload: JwtPayload) {
    return {
      id: payload.sub,
      email: payload.email,
      role: payload.role,
      vendorId: payload.vendorId,
      name: payload.name,
    };
  }

  private static extractFromCookie(req: Request): string | null {
    return req?.cookies?.[ACCESS_COOKIE] ?? null;
  }
}
