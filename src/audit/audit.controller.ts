import { Controller, Get, Query, Res, UseGuards } from "@nestjs/common";
import {
  ApiBearerAuth,
  ApiOperation,
  ApiQuery,
  ApiResponse,
  ApiTags,
} from "@nestjs/swagger";
import { Response } from "express";
import { JwtAuthGuard } from "../auth/jwt.guard";
import { Roles } from "../auth/roles.decorator";
import { RolesGuard } from "../auth/roles.guard";
import { AuditService } from "./audit.service";

class AuditListResponse {
  items: any[];
  page: number;
  limit: number;
  total: number;
  hasNext: boolean;
}

@ApiTags("Audit")
@ApiBearerAuth()
@Controller("audit")
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles("ADMIN")
export class AuditController {
  constructor(private readonly audit: AuditService) {}

  @Get("logs")
  @ApiOperation({ summary: "Listar logs de auditoría (filtros + paginación)" })
  @ApiQuery({ name: "entity", required: false, example: "COI" })
  @ApiQuery({ name: "entityId", required: false, example: "proofholder_123" })
  @ApiQuery({ name: "actorId", required: false, example: "u_admin" })
  @ApiQuery({ name: "action", required: false, example: "REVIEW.APPROVED" })
  @ApiQuery({
    name: "from",
    required: false,
    example: "2025-09-01T00:00:00.000Z",
  })
  @ApiQuery({
    name: "to",
    required: false,
    example: "2025-09-13T00:00:00.000Z",
  })
  @ApiQuery({ name: "page", required: false, example: 1 })
  @ApiQuery({ name: "limit", required: false, example: 25 })
  @ApiQuery({
    name: "sort",
    required: false,
    example: "desc",
    enum: ["asc", "desc"],
  })
  @ApiResponse({ status: 200, type: AuditListResponse })
  list(
    @Query("entity") entity?: string,
    @Query("entityId") entityId?: string,
    @Query("actorId") actorId?: string,
    @Query("action") action?: string,
    @Query("from") from?: string,
    @Query("to") to?: string,
    @Query("page") page?: string,
    @Query("limit") limit?: string,
    @Query("sort") sort?: "asc" | "desc"
  ) {
    return this.audit.list({
      entity,
      entityId,
      actorId,
      action,
      from,
      to,
      page: Number(page),
      limit: Number(limit),
      sort,
    });
  }

  @Get("logs/export")
  @ApiOperation({ summary: "Exportar logs de auditoría a CSV" })
  @ApiQuery({ name: "entity", required: false, example: "COI" })
  @ApiQuery({ name: "entityId", required: false, example: "proofholder_123" })
  @ApiQuery({ name: "actorId", required: false, example: "u_admin" })
  @ApiQuery({ name: "action", required: false, example: "REVIEW.REJECTED" })
  @ApiQuery({
    name: "from",
    required: false,
    example: "2025-09-01T00:00:00.000Z",
  })
  @ApiQuery({
    name: "to",
    required: false,
    example: "2025-09-13T00:00:00.000Z",
  })
  async exportCsv(
    @Res() res: Response,
    @Query("entity") entity?: string,
    @Query("entityId") entityId?: string,
    @Query("actorId") actorId?: string,
    @Query("action") action?: string,
    @Query("from") from?: string,
    @Query("to") to?: string
  ) {
    const items = await this.audit.allForExport({
      entity,
      entityId,
      actorId,
      action,
      from,
      to,
    });
    const headers = [
      "id",
      "entity",
      "entityId",
      "action",
      "actorId",
      "details",
      "at",
    ];
    const rows = [headers.join(",")];
    for (const it of items) {
      const row = [
        it.id,
        it.entity,
        it.entityId,
        it.action,
        it.actorId,
        JSON.stringify(it.details || ""),
        new Date(it.at).toISOString(),
      ]
        .map((v) => (typeof v === "string" ? v.replace(/\n/g, " ") : v))
        .join(",");
      rows.push(row);
    }
    const csv = rows.join("\n");
    res.setHeader("Content-Type", "text/csv");
    res.setHeader(
      "Content-Disposition",
      'attachment; filename="audit-logs.csv"'
    );
    res.send(csv);
  }
}
