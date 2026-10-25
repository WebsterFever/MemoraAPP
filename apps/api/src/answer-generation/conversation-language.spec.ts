import { BadRequestException } from "@nestjs/common";
import {
  DEFAULT_CONVERSATION_LANGUAGE_CODE,
  resolveConversationLanguage,
  SUPPORTED_CONVERSATION_LANGUAGES,
} from "./conversation-language";

describe("resolveConversationLanguage", () => {
  it.each(Object.entries(SUPPORTED_CONVERSATION_LANGUAGES))(
    "resolves supported code %s to %s",
    (code, name) => {
      expect(resolveConversationLanguage(code)).toEqual({ code, name });
    },
  );

  it("is case-insensitive", () => {
    expect(resolveConversationLanguage("HT")).toEqual({ code: "ht", name: "Haitian Creole" });
    expect(resolveConversationLanguage("Fr")).toEqual({ code: "fr", name: "French" });
  });

  it("trims surrounding whitespace", () => {
    expect(resolveConversationLanguage("  fr  ")).toEqual({ code: "fr", name: "French" });
  });

  it("defaults to English when undefined", () => {
    expect(resolveConversationLanguage(undefined)).toEqual({
      code: DEFAULT_CONVERSATION_LANGUAGE_CODE,
      name: "English",
    });
  });

  it("defaults to English when null", () => {
    expect(resolveConversationLanguage(null)).toEqual({ code: "en", name: "English" });
  });

  it("defaults to English when an empty string", () => {
    expect(resolveConversationLanguage("")).toEqual({ code: "en", name: "English" });
  });

  it("defaults to English when whitespace-only", () => {
    expect(resolveConversationLanguage("   ")).toEqual({ code: "en", name: "English" });
  });

  it("rejects an unsupported language code", () => {
    expect(() => resolveConversationLanguage("xx")).toThrow(BadRequestException);
  });

  it("rejects a language name instead of a code", () => {
    expect(() => resolveConversationLanguage("French")).toThrow(BadRequestException);
  });

  it("includes the offending value in the error message", () => {
    expect(() => resolveConversationLanguage("klingon")).toThrow(/klingon/);
  });
});
