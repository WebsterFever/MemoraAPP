import { Body, Controller, Post, Req, UseGuards } from "@nestjs/common";
import { AuthService } from "./auth.service";
import { JwtAuthGuard } from "./jwt-auth.guard";
import { LoginDto, ReauthDto, RefreshDto, RegisterDto } from "./dto";
@Controller("auth")
export class AuthController {
  constructor(private auth:AuthService){}
  @Post("register") register(@Body() dto:RegisterDto){return this.auth.register(dto);}
  @Post("login") login(@Body() dto:LoginDto){return this.auth.login(dto);}
  @Post("refresh") refresh(@Body() dto:RefreshDto){return this.auth.refresh(dto.refreshToken);}
  @UseGuards(JwtAuthGuard) @Post("reauth") reauth(@Req() req:any,@Body() dto:ReauthDto){return this.auth.reauth(req.user.sub,dto.password);}
}
