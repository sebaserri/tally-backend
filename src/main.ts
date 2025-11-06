import { ValidationPipe } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { DocumentBuilder, SwaggerModule } from "@nestjs/swagger";
import { AppModule } from "./app.module";
import { PrismaService } from "./prisma/prisma.service";
import * as bodyParser from "body-parser";
import helmet from "helmet";
import * as cookieParser from "cookie-parser";

async function bootstrap() {
  const app = await NestFactory.create(AppModule, {
    cors: true,
    rawBody: true,
  });
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));

  app.use(
    helmet({
      crossOriginResourcePolicy: { policy: "cross-origin" },
    })
  );
  app.use(cookieParser());

  app.use(
    bodyParser.json({
      verify: (req: any, _res, buf) => {
        req.rawBody = buf;
      },
    })
  );
  app.use(
    bodyParser.urlencoded({
      extended: true,
      verify: (req: any, _res, buf) => {
        req.rawBody = buf;
      },
    })
  );

  app.enableCors({
    origin: process.env.PUBLIC_APP_URL || "http://localhost:4000",
    credentials: true,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization", "x-csrf-token"],
    exposedHeaders: [],
  });

  app.setGlobalPrefix("api");

  const prismaService = app.get(PrismaService);
  await prismaService.enableShutdownHooks(app);

  const config = new DocumentBuilder()
    .setTitle("Tally MVP API")
    .setDescription("API para gestión de COIs (ACORD 25)")
    .setVersion("0.1.0")
    .addBearerAuth()
    .build();
  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup("api/docs", app, document, {
    jsonDocumentUrl: "api/docs-json",
  });

  await app.listen(process.env.PORT || 4000);
}
bootstrap();
