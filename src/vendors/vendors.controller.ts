import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  UseGuards,
} from "@nestjs/common";
import {
  ApiBearerAuth,
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiResponse,
  ApiTags,
} from "@nestjs/swagger";
import { JwtAuthGuard } from "../auth/jwt.guard";
import { Roles } from "../auth/roles.decorator";
import { RolesGuard } from "../auth/roles.guard";
import { VendorsService } from "./vendors.service";

class CreateVendorDto {
  legalName: string;
  contactEmail: string;
}

class VendorDto {
  id: string;
  legalName: string;
  contactEmail: string;
  contactPhone?: string;
}

class VendorSearchItem {
  id: string;
  legalName: string;
  contactPhone?: string;
}

@ApiTags("Vendors")
@ApiBearerAuth()
@Controller("vendors")
@UseGuards(JwtAuthGuard, RolesGuard)
export class VendorsController {
  constructor(private svc: VendorsService) {}

  @Post()
  @Roles("ADMIN")
  @ApiOperation({ summary: "Crear vendor" })
  @ApiResponse({ status: 201, type: VendorDto })
  create(@Body() body: CreateVendorDto) {
    return this.svc.create(body);
  }

  @Get("search")
  @Roles("ADMIN", "GUARD")
  @ApiOperation({ summary: "Buscar vendors (autocomplete Portería)" })
  @ApiQuery({ name: "q", required: true, example: "Acme" })
  @ApiResponse({ status: 200, type: [VendorSearchItem] })
  search(@Query("q") q: string) {
    return this.svc.search(q);
  }

  @Get(":id")
  @Roles("ADMIN", "VENDOR")
  @ApiOperation({ summary: "Obtener vendor por id" })
  @ApiParam({ name: "id", required: true })
  @ApiResponse({ status: 200, type: VendorDto })
  get(@Param("id") id: string) {
    return this.svc.get(id);
  }

  @Post(":id/phone")
  @Roles("ADMIN", "VENDOR")
  @ApiOperation({ summary: "Actualizar teléfono (SMS)" })
  @ApiParam({ name: "id", required: true })
  @ApiResponse({ status: 200, type: VendorDto })
  setPhone(@Param("id") id: string, @Body() body: { contactPhone: string }) {
    return this.svc.setPhone(id, body.contactPhone);
  }
}
