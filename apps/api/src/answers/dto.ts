import { Transform } from "class-transformer";
import { IsNotEmpty, IsOptional, IsString, MaxLength } from "class-validator";

export class AskQuestionDto {
  // Trim before validating so a whitespace-only question (e.g. "   ") is
  // correctly rejected by @IsNotEmpty() instead of passing through as a
  // "nonempty" string of spaces.
  @Transform(({ value }) => (typeof value === "string" ? value.trim() : value))
  @IsString()
  @IsNotEmpty()
  @MaxLength(2000)
  question!: string;

  @IsOptional()
  @IsString()
  conversationLanguage?: string;
}
