import { ConflictException, Injectable, UnauthorizedException } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { JwtService } from "@nestjs/jwt";
import { ConfigService } from "@nestjs/config";
import * as bcrypt from "bcryptjs";
import { createHash, randomUUID } from "crypto";
import { LoginDto, RegisterDto } from "./dto";
import type { JwtRefreshPayload } from "./authenticated-request";
@Injectable()
export class AuthService {
  constructor(private prisma: PrismaService, private jwt: JwtService, private config: ConfigService) {}
  private async tokens(user: {id:string; email:string}) {
    const accessToken = await this.jwt.signAsync({ sub:user.id, email:user.email }, { secret:this.config.getOrThrow("JWT_ACCESS_SECRET"), expiresIn:"15m" });
    const refreshToken = await this.jwt.signAsync({ sub:user.id, jti:randomUUID() }, { secret:this.config.getOrThrow("JWT_REFRESH_SECRET"), expiresIn:"30d" });
    const decoded = this.jwt.decode<JwtRefreshPayload>(refreshToken);
    await this.prisma.refreshToken.create({ data:{ userId:user.id, tokenHash:createHash("sha256").update(refreshToken).digest("hex"), expiresAt:new Date(decoded.exp*1000) }});
    return { accessToken, refreshToken };
  }
  async register(dto:RegisterDto) {
    const email=dto.email.trim().toLowerCase();
    if (await this.prisma.user.findUnique({where:{email}})) throw new ConflictException("Email already registered");
    const user=await this.prisma.user.create({data:{email,passwordHash:await bcrypt.hash(dto.password,12),displayName:dto.displayName,preferredLanguage:dto.preferredLanguage}});
    return { user:{id:user.id,email:user.email,displayName:user.displayName,preferredLanguage:user.preferredLanguage}, ...(await this.tokens(user)) };
  }
  async login(dto:LoginDto) {
    const user=await this.prisma.user.findUnique({where:{email:dto.email.trim().toLowerCase()}});
    if(!user || !(await bcrypt.compare(dto.password,user.passwordHash))) throw new UnauthorizedException("Invalid credentials");
    return { user:{id:user.id,email:user.email,displayName:user.displayName,preferredLanguage:user.preferredLanguage}, ...(await this.tokens(user)) };
  }
  async refresh(raw:string) {
    let payload:JwtRefreshPayload; try { payload=this.jwt.verify<JwtRefreshPayload>(raw,{secret:this.config.getOrThrow("JWT_REFRESH_SECRET")}); } catch { throw new UnauthorizedException("Invalid refresh token"); }
    const hash=createHash("sha256").update(raw).digest("hex");
    const stored=await this.prisma.refreshToken.findUnique({where:{tokenHash:hash},include:{user:true}});
    if(!stored || stored.revokedAt || stored.expiresAt < new Date() || stored.userId!==payload.sub) throw new UnauthorizedException("Refresh token revoked or expired");
    await this.prisma.refreshToken.update({where:{id:stored.id},data:{revokedAt:new Date()}});
    return this.tokens(stored.user);
  }
  async reauth(userId:string,password:string){ const u=await this.prisma.user.findUnique({where:{id:userId}}); if(!u||!(await bcrypt.compare(password,u.passwordHash))) throw new UnauthorizedException("Password verification failed"); return {verified:true,verifiedAt:new Date().toISOString()}; }
}
