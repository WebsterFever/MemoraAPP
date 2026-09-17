import { IsArray, IsOptional, IsString, MinLength } from "class-validator";
export class CreateFamilyDto { @IsString() @MinLength(1) name!:string; }
export class CreateProfileDto { @IsString() @MinLength(1) displayName!:string; @IsOptional() @IsString() relationship?:string; @IsString() preferredLanguage="en"; @IsOptional() @IsArray() @IsString({each:true}) spokenLanguages?:string[]; @IsOptional() @IsString() biography?:string; }
