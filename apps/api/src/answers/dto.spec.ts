import { plainToInstance } from "class-transformer";
import { validate } from "class-validator";
import { AskQuestionDto } from "./dto";

async function validateInput(input: object) {
  const dto = plainToInstance(AskQuestionDto, input);
  const errors = await validate(dto);
  return { dto, errors };
}

describe("AskQuestionDto", () => {
  it("accepts a normal question", async () => {
    const { errors } = await validateInput({ question: "What was her favorite recipe?" });
    expect(errors).toHaveLength(0);
  });

  it("trims surrounding whitespace before validating", async () => {
    const { dto, errors } = await validateInput({ question: "  What did he say?  " });
    expect(errors).toHaveLength(0);
    expect(dto.question).toBe("What did he say?");
  });

  it("rejects an empty question", async () => {
    const { errors } = await validateInput({ question: "" });
    expect(errors.length).toBeGreaterThan(0);
  });

  it("rejects a whitespace-only question", async () => {
    const { errors } = await validateInput({ question: "   \n\t  " });
    expect(errors.length).toBeGreaterThan(0);
  });

  it("rejects a missing question", async () => {
    const { errors } = await validateInput({});
    expect(errors.length).toBeGreaterThan(0);
  });

  it("rejects a question longer than 2000 characters", async () => {
    const { errors } = await validateInput({ question: "a".repeat(2001) });
    expect(errors.length).toBeGreaterThan(0);
  });

  it("accepts a question exactly 2000 characters long", async () => {
    const { errors } = await validateInput({ question: "a".repeat(2000) });
    expect(errors).toHaveLength(0);
  });

  it("accepts an omitted conversationLanguage", async () => {
    const { errors } = await validateInput({ question: "hello" });
    expect(errors).toHaveLength(0);
  });

  it("accepts a conversationLanguage code", async () => {
    const { errors } = await validateInput({ question: "hello", conversationLanguage: "ht" });
    expect(errors).toHaveLength(0);
  });

  it("rejects a non-string conversationLanguage", async () => {
    const { errors } = await validateInput({ question: "hello", conversationLanguage: 123 });
    expect(errors.length).toBeGreaterThan(0);
  });
});
