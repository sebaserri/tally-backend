import { GetObjectCommand, S3Client } from "@aws-sdk/client-s3";
import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Res,
  UseGuards,
} from "@nestjs/common";
import {
  ApiBearerAuth,
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiTags,
} from "@nestjs/swagger";
import * as archiver from "archiver";
import { Response } from "express";
import { CurrentUser, JwtUser } from "../auth/current-user.decorator";
import { JwtAuthGuard } from "../auth/jwt.guard";
import { Roles } from "../auth/roles.decorator";
import { RolesGuard } from "../auth/roles.guard";
import { AntivirusService } from "../security/antivirus.service";
import { CoisService } from "./cois.service";

@ApiTags("COIs")
@ApiBearerAuth()
@Controller("cois")
@UseGuards(JwtAuthGuard, RolesGuard)
export class CoisController {
  private s3 = new S3Client({ region: process.env.AWS_REGION || "us-east-1" });
  constructor(private svc: CoisService, private av: AntivirusService) {}

  @Get()
  @Roles("ADMIN", "VENDOR")
  @ApiOperation({ summary: "Listar COIs" })
  @ApiQuery({ name: "buildingId", required: false })
  @ApiQuery({
    name: "status",
    required: false,
    enum: ["PENDING", "APPROVED", "REJECTED"],
  })
  list(@CurrentUser() user: JwtUser, @Query() q: any) {
    if (user.role === "VENDOR") q = { ...q, vendorId: user.vendorId };
    return this.svc.list(q);
  }

  @Post()
  @Roles("ADMIN", "VENDOR")
  @ApiOperation({ summary: "Crear COI" })
  async create(@CurrentUser() user: JwtUser, @Body() body: any) {
    if (user.role === "VENDOR") {
      if (body.vendorId && body.vendorId !== user.vendorId)
        throw new ForbiddenException("VendorId inválido");
      body.vendorId = user.vendorId;
    }
    if (body.files?.length) {
      const bucket = process.env.S3_BUCKET as string;
      for (const f of body.files) {
        const key =
          (f.url as string).split(`${bucket}/`)[1] ||
          (f.url as string).split("amazonaws.com/")[1] ||
          f.url;
        const res = await this.av.scanS3Object(bucket, key);
        if (!res.clean)
          throw new ForbiddenException("Archivo infectado o inválido");
      }
    }
    return this.svc.create(body);
  }

  @Get("export")
  @Roles("ADMIN")
  @ApiOperation({ summary: "Exportar COIs a CSV" })
  @ApiQuery({ name: "buildingId", required: false })
  @ApiQuery({
    name: "status",
    required: false,
    enum: ["PENDING", "APPROVED", "REJECTED"],
  })
  async exportCsv(@Res() res: Response, @Query() q: any) {
    const items = await this.svc.list(q);
    const fields = [
      "id",
      "vendorId",
      "buildingId",
      "insuredName",
      "status",
      "effectiveDate",
      "expirationDate",
      "additionalInsured",
      "waiverOfSubrogation",
    ];
    const rows = [fields.join(",")];
    for (const it of items) {
      const r = [
        it.id,
        it.vendorId,
        it.buildingId,
        JSON.stringify(it.insuredName || ""),
        it.status,
        it.effectiveDate?.toISOString?.() || "",
        it.expirationDate?.toISOString?.() || "",
        it.additionalInsured ? "true" : "false",
        it.waiverOfSubrogation ? "true" : "false",
      ];
      rows.push(
        r
          .map((x) => (typeof x === "string" ? x.replace(/\n/g, " ") : x))
          .join(",")
      );
    }
    const csv = rows.join("\n");
    res.setHeader("Content-Type", "text/csv");
    res.setHeader(
      "Content-Disposition",
      'attachment; filename="cois-export.csv"'
    );
    res.send(csv);
  }

  @Get(":id")
  @Roles("ADMIN", "VENDOR")
  @ApiOperation({ summary: "Obtener COI por id" })
  @ApiParam({ name: "id", required: true })
  async get(@CurrentUser() user: JwtUser, @Param("id") id: string) {
    const coi = await this.svc.get(id);
    if (user.role === "VENDOR" && coi?.vendorId !== user.vendorId)
      throw new ForbiddenException("No puedes ver COIs de otros vendors");
    return coi;
  }

  @Patch(":id/review")
  @Roles("ADMIN")
  @ApiOperation({ summary: "Revisar COI (aprobar/rechazar)" })
  @ApiParam({ name: "id", required: true })
  review(
    @CurrentUser() user: JwtUser,
    @Param("id") id: string,
    @Body() body: any
  ) {
    return this.svc.review(id, body, user.id);
  }

  @Patch(":id/approve")
  @Roles("ADMIN")
  @ApiOperation({ summary: "Aprobar COI" })
  @ApiParam({ name: "id", required: true })
  approve(
    @CurrentUser() user: JwtUser,
    @Param("id") id: string,
    @Body() body: any
  ) {
    return this.svc.review(
      id,
      { status: "APPROVED", notes: body?.notes, flags: body?.flags },
      user.id
    );
  }

  @Patch(":id/reject")
  @Roles("ADMIN")
  @ApiOperation({ summary: "Rechazar COI" })
  @ApiParam({ name: "id", required: true })
  reject(
    @CurrentUser() user: JwtUser,
    @Param("id") id: string,
    @Body() body: any
  ) {
    return this.svc.review(
      id,
      { status: "REJECTED", notes: body?.notes, flags: body?.flags },
      user.id
    );
  }

  @Get(":id/files.zip")
  @Roles("ADMIN")
  @ApiOperation({ summary: "Descargar ZIP de archivos del COI" })
  @ApiParam({ name: "id", required: true })
  async zipFiles(@Param("id") id: string, @Res() res: Response) {
    const coi = await this.svc.get(id);
    const files = coi?.files || [];
    res.setHeader("Content-Type", "application/zip");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="coi-${id}-files.zip"`
    );
    const archive = archiver("zip", { zlib: { level: 9 } });
    archive.on("error", (err) => {
      throw err;
    });
    archive.pipe(res);
    const bucket = process.env.S3_BUCKET as string;
    for (const f of files) {
      const keyFromBucket = (f.url as string).split(`${bucket}/`)[1];
      const keyFromAws = (f.url as string).split("amazonaws.com/")[1];
      const key = keyFromBucket || keyFromAws || f.url;
      try {
        const obj = await this.s3.send(
          new GetObjectCommand({ Bucket: bucket, Key: key })
        );
        const stream = obj.Body as any;
        const fname = key.split("/").pop() || `file-${f.id}.pdf`;
        archive.append(stream, { name: fname });
      } catch (e) {
        archive.append(Buffer.from(`Error fetching ${f.url}: ${e}`), {
          name: `ERROR_${f.id}.txt`,
        });
      }
    }
    await archive.finalize();
  }
}
