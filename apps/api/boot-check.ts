import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import { AppModule } from "./src/app.module";

async function main() {
  const app = await NestFactory.createApplicationContext(AppModule, { logger: ["error", "warn"] });
  console.log("BOOT_OK");
  await app.close();
}

main().catch((err) => {
  console.error("BOOT_FAILED");
  console.error(err);
  process.exit(1);
});
