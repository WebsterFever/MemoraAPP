import { IsEmail, IsString, MinLength } from "class-validator";
export class RegisterDto { @IsEmail() email!: string; @IsString() @MinLength(10) password!: string; @IsString() @MinLength(1) displayName!: string; @IsString() preferredLanguage = "en"; }
export class LoginDto { @IsEmail() email!: string; @IsString() password!: string; }
export class RefreshDto { @IsString() refreshToken!: string; }
export class ReauthDto { @IsString() password!: string; }
