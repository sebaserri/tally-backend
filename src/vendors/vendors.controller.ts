import {
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  NotFoundException,
  Param,
  Patch,
  Post,
  Query,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import {
  ApiBearerAuth,
  ApiConsumes,
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiResponse,
  ApiTags,
} from "@nestjs/swagger";
import { User, UserRole } from "@prisma/client";
import { CurrentUser } from "../auth/current-user.decorator";
import { JwtAuthGuard } from "../auth/jwt.guard";
import { Roles } from "../auth/roles.decorator";
import { RolesGuard } from "../auth/roles.guard";
import { CoisService } from "../cois/cois.service";
import { PermissionsService } from "../permissions/permissions.service";
import {
  ApproveVendorDto,
  BulkApproveVendorsDto,
  CreateVendorDto,
  InviteVendorDto,
  NotifyVendorDto,
  RejectVendorDto,
  UpdateVendorDto,
  UploadCOIDto,
  VendorAuthorizationDto,
  VendorDto,
  VendorFilterDto,
  VendorSearchItem,
  VendorStatsDto,
  VendorWithAuthorizationDto,
} from "./dto";
import { VendorsService } from "./vendors.service";

@ApiTags("Vendors")
@ApiBearerAuth()
@Controller("vendors")
@UseGuards(JwtAuthGuard, RolesGuard)
export class VendorsController {
  constructor(
    private readonly svc: VendorsService, // Usando tu estilo 'svc'
    private readonly coisService: CoisService,
    private readonly permissions: PermissionsService
  ) {}

  /**
   * Crear nuevo vendor
   */
  @Post()
  @Roles(
    UserRole.ACCOUNT_OWNER,
    UserRole.PORTFOLIO_MANAGER,
    UserRole.PROPERTY_MANAGER
  )
  @ApiOperation({ summary: "Crear nuevo vendor" })
  @ApiResponse({ status: 201, type: VendorDto })
  async create(@CurrentUser() user: User, @Body() dto: CreateVendorDto) {
    return this.svc.create(dto, user.id);
  }

  /**
   * Buscar vendors (para autocomplete en portería)
   */
  @Get("search")
  @Roles(
    UserRole.ACCOUNT_OWNER,
    UserRole.PORTFOLIO_MANAGER,
    UserRole.PROPERTY_MANAGER,
    UserRole.GUARD
  )
  @ApiOperation({ summary: "Buscar vendors" })
  @ApiQuery({ name: "q", required: true, description: "Término de búsqueda" })
  @ApiQuery({
    name: "buildingId",
    required: false,
    description: "Filtrar por edificio",
  })
  @ApiResponse({ status: 200, type: [VendorSearchItem] })
  async search(
    @Query("q") query: string,
    @Query("buildingId") buildingId?: string
  ) {
    return this.svc.search(query, buildingId);
  }

  /**
   * Listar todos los vendors accesibles
   */
  @Get()
  @Roles(
    UserRole.ACCOUNT_OWNER,
    UserRole.PORTFOLIO_MANAGER,
    UserRole.PROPERTY_MANAGER,
    UserRole.BUILDING_OWNER
  )
  @ApiOperation({ summary: "Listar vendors" })
  @ApiQuery({ name: "buildingId", required: false })
  @ApiQuery({ name: "hasValidCOI", required: false, type: Boolean })
  @ApiQuery({
    name: "authStatus",
    required: false,
    enum: ["PENDING", "APPROVED", "REJECTED"],
  })
  @ApiQuery({ name: "limit", required: false, type: Number })
  @ApiQuery({ name: "offset", required: false, type: Number })
  @ApiResponse({ status: 200, type: [VendorWithAuthorizationDto] })
  async findAll(@CurrentUser() user: User, @Query() filters: VendorFilterDto) {
    // Si se especifica edificio, verificar acceso
    if (filters.buildingId) {
      const hasAccess = await this.permissions.canViewBuilding(
        user,
        filters.buildingId
      );
      if (!hasAccess) {
        throw new ForbiddenException("No tiene acceso a este edificio");
      }
      return this.svc.findByBuilding(filters.buildingId);
    }

    // Sino, retornar vendors de edificios accesibles
    const buildings = await this.permissions.getUserBuildings(user);
    const buildingIds = buildings.map((b) => b.id);
    return this.svc.findByBuildings(buildingIds);
  }

  /**
   * Obtener autorizaciones del vendor
   */
  @Get("me/authorizations")
  @ApiOperation({ summary: "Obtener autorizaciones del vendor" })
  @ApiParam({ name: "id", description: "ID del vendor" })
  @ApiResponse({ status: 200, type: [VendorAuthorizationDto] })
  async getAuthorizations(@CurrentUser() user: User) {
    const vendor = await this.svc.get(user.id);

    if (!vendor) {
      throw new NotFoundException("Vendor no encontrado");
    }

    // Vendors ven sus propias autorizaciones
    if (user.role === UserRole.VENDOR) {
      if (vendor.userId !== user.id) {
        throw new ForbiddenException(
          "Solo puede ver sus propias autorizaciones"
        );
      }
      return this.svc.getVendorAuthorizations(user.id);
    }

    // Management ve autorizaciones de sus edificios
    if (this.permissions.canApproveVendors(user)) {
      const buildings = await this.permissions.getUserBuildings(user);
      const buildingIds = buildings.map((b) => b.id);
      return this.svc.getVendorAuthorizationsForBuildings(user.id, buildingIds);
    }

    throw new ForbiddenException(
      "No tiene permiso para ver autorizaciones del vendor"
    );
  }

  /**
   * Obtener mi perfil como vendor
   */
  @Get("me/profile")
  @Roles(UserRole.VENDOR)
  @ApiOperation({ summary: "Obtener mi perfil de vendor" })
  @ApiResponse({ status: 200, type: VendorDto })
  async getMyProfile(@CurrentUser() user: User) {
    const vendor = await this.svc.findByUserId(user.id);

    if (!vendor) {
      throw new NotFoundException("Perfil de vendor no encontrado");
    }

    return vendor;
  }

  /**
   * Obtener mis COIs como vendor
   */
  @Get("me/cois")
  @Roles(UserRole.VENDOR)
  @ApiOperation({ summary: "Obtener mis COIs" })
  @ApiResponse({ status: 200, description: "Lista de COIs" })
  async getMyCOIs(@CurrentUser() user: User) {
    const vendor = await this.svc.findByUserId(user.id);

    if (!vendor) {
      // Si el usuario aún no tiene perfil de vendor, devolver lista vacía
      return [];
    }

    return this.coisService.findByVendor(vendor.id);
  }

  /**
   * Invitar vendor a la plataforma
   */
  @Post("invite")
  @Roles(
    UserRole.ACCOUNT_OWNER,
    UserRole.PORTFOLIO_MANAGER,
    UserRole.PROPERTY_MANAGER
  )
  @ApiOperation({ summary: "Invitar vendor" })
  @ApiResponse({ status: 201, description: "Invitación enviada" })
  async inviteVendor(@CurrentUser() user: User, @Body() dto: InviteVendorDto) {
    // Verificar acceso a los edificios
    if (dto.buildingIds && dto.buildingIds.length > 0) {
      for (const buildingId of dto.buildingIds) {
        const hasAccess = await this.permissions.canViewBuilding(
          user,
          buildingId
        );
        if (!hasAccess) {
          throw new ForbiddenException(
            `No tiene acceso al edificio ${buildingId}`
          );
        }
      }
    }

    // TODO: Implementar lógica de invitación
    // - Crear usuario con rol VENDOR
    // - Enviar email de invitación
    // - Pre-aprobar para edificios especificados

    return { message: "Invitación enviada" };
  }

  /**
   * Subir COI como vendor
   */
  @Post("upload-coi")
  @Roles(UserRole.VENDOR)
  @UseInterceptors(FileInterceptor("file"))
  @ApiOperation({ summary: "Subir COI como vendor" })
  @ApiConsumes("multipart/form-data")
  @ApiResponse({ status: 201, description: "COI creado" })
  async uploadCOI(
    @CurrentUser() user: User,
    @Body() dto: UploadCOIDto,
    @UploadedFile() file: Express.Multer.File
  ) {
    // Obtener vendor del usuario
    const vendor = await this.svc.findByUserId(user.id);

    if (!vendor) {
      throw new NotFoundException("Perfil de vendor no encontrado");
    }

    // Verificar si está autorizado para el edificio
    const isAuthorized = await this.svc.isAuthorizedForBuilding(
      vendor.id,
      dto.buildingId
    );

    if (!isAuthorized) {
      throw new ForbiddenException("No está autorizado para este edificio");
    }

    return this.coisService.create({
      vendorId: vendor.id,
      ...dto,
    } as any);
  }

  /**
   * Aprobar múltiples vendors
   */
  @Post("bulk/approve")
  @Roles(
    UserRole.ACCOUNT_OWNER,
    UserRole.PORTFOLIO_MANAGER,
    UserRole.PROPERTY_MANAGER
  )
  @ApiOperation({ summary: "Aprobar múltiples vendors" })
  @ApiResponse({ status: 200, description: "Vendors aprobados" })
  async bulkApprove(
    @CurrentUser() user: User,
    @Body() dto: BulkApproveVendorsDto
  ) {
    // Verificar acceso al edificio
    const hasAccess = await this.permissions.canViewBuilding(
      user,
      dto.buildingId
    );

    if (!hasAccess) {
      throw new ForbiddenException("No tiene acceso a este edificio");
    }

    const results: any[] = [];
    for (const vendorId of dto.vendorIds) {
      try {
        const result = await this.svc.approveForBuilding(
          vendorId,
          dto.buildingId,
          user.id
        );
        results.push({ vendorId, success: true, result });
      } catch (error) {
        results.push({ vendorId, success: false, error: error.message });
      }
    }

    return results;
  }

  /**
   * Obtener detalle de vendor
   */
  @Get(":id")
  @ApiOperation({ summary: "Obtener detalle de vendor" })
  @ApiParam({ name: "id", description: "ID del vendor" })
  @ApiResponse({ status: 200, type: VendorDto })
  @ApiResponse({ status: 404, description: "Vendor no encontrado" })
  async findOne(@CurrentUser() user: User, @Param("id") id: string) {
    const vendor = await this.svc.get(id);

    if (!vendor) {
      throw new NotFoundException("Vendor no encontrado");
    }

    // Vendors solo ven su propio perfil
    if (user.role === UserRole.VENDOR) {
      if (vendor.userId !== user.id) {
        throw new ForbiddenException(
          "Solo puede ver su propio perfil de vendor"
        );
      }
      return vendor;
    }

    // Otros necesitan acceso al edificio donde el vendor está autorizado
    const hasAccess = await this.svc.userCanAccessVendor(user, id);
    if (!hasAccess) {
      throw new ForbiddenException("No tiene acceso a este vendor");
    }

    return vendor;
  }

  /**
   * Actualizar información del vendor
   */
  @Patch(":id")
  @ApiOperation({ summary: "Actualizar vendor" })
  @ApiParam({ name: "id", description: "ID del vendor" })
  @ApiResponse({ status: 200, type: VendorDto })
  async update(
    @CurrentUser() user: User,
    @Param("id") id: string,
    @Body() dto: UpdateVendorDto
  ) {
    const vendor = await this.svc.get(id);

    if (!vendor) {
      throw new NotFoundException("Vendor no encontrado");
    }

    // Vendors solo pueden actualizar su propio perfil
    if (user.role === UserRole.VENDOR) {
      if (vendor.userId !== user.id) {
        throw new ForbiddenException("Solo puede actualizar su propio perfil");
      }
    } else if (!this.permissions.canApproveVendors(user)) {
      throw new ForbiddenException("No tiene permiso para actualizar vendors");
    }

    return this.svc.update(id, dto);
  }

  /**
   * Eliminar vendor
   */
  @Delete(":id")
  @Roles(UserRole.ACCOUNT_OWNER)
  @ApiOperation({ summary: "Eliminar vendor" })
  @ApiParam({ name: "id", description: "ID del vendor" })
  @ApiResponse({ status: 200, description: "Vendor eliminado" })
  async delete(@CurrentUser() user: User, @Param("id") id: string) {
    const vendor = await this.svc.get(id);

    if (!vendor) {
      throw new NotFoundException("Vendor no encontrado");
    }

    return this.svc.delete(id);
  }

  /**
   * Actualizar teléfono del vendor (para SMS)
   */
  @Post(":id/phone")
  @ApiOperation({ summary: "Actualizar teléfono del vendor" })
  @ApiParam({ name: "id", description: "ID del vendor" })
  @ApiResponse({ status: 200, type: VendorDto })
  async updatePhone(
    @CurrentUser() user: User,
    @Param("id") id: string,
    @Body() dto: { phone: string }
  ) {
    const vendor = await this.svc.get(id);

    if (!vendor) {
      throw new NotFoundException("Vendor no encontrado");
    }

    // Verificar permisos
    if (user.role === UserRole.VENDOR && vendor.userId !== user.id) {
      throw new ForbiddenException("Solo puede actualizar su propio teléfono");
    } else if (
      user.role !== UserRole.VENDOR &&
      !this.permissions.canApproveVendors(user)
    ) {
      throw new ForbiddenException(
        "No tiene permiso para actualizar teléfono del vendor"
      );
    }

    return this.svc.setPhone(id, dto.phone);
  }

  /**
   * Aprobar vendor para un edificio
   */
  @Post(":id/approve")
  @Roles(
    UserRole.ACCOUNT_OWNER,
    UserRole.PORTFOLIO_MANAGER,
    UserRole.PROPERTY_MANAGER
  )
  @ApiOperation({ summary: "Aprobar vendor para edificio" })
  @ApiParam({ name: "id", description: "ID del vendor" })
  @ApiResponse({ status: 200, description: "Vendor aprobado" })
  async approveVendor(
    @CurrentUser() user: User,
    @Param("id") vendorId: string,
    @Body() dto: ApproveVendorDto
  ) {
    // Verificar acceso al edificio
    const hasAccess = await this.permissions.canViewBuilding(
      user,
      dto.buildingId
    );

    if (!hasAccess) {
      throw new ForbiddenException("No tiene acceso a este edificio");
    }

    return this.svc.approveForBuilding(vendorId, dto.buildingId, user.id);
  }

  /**
   * Rechazar vendor para un edificio
   */
  @Post(":id/reject")
  @Roles(
    UserRole.ACCOUNT_OWNER,
    UserRole.PORTFOLIO_MANAGER,
    UserRole.PROPERTY_MANAGER
  )
  @ApiOperation({ summary: "Rechazar vendor para edificio" })
  @ApiParam({ name: "id", description: "ID del vendor" })
  @ApiResponse({ status: 200, description: "Vendor rechazado" })
  async rejectVendor(
    @CurrentUser() user: User,
    @Param("id") vendorId: string,
    @Body() dto: RejectVendorDto
  ) {
    // Verificar acceso al edificio
    const hasAccess = await this.permissions.canViewBuilding(
      user,
      dto.buildingId
    );

    if (!hasAccess) {
      throw new ForbiddenException("No tiene acceso a este edificio");
    }

    return this.svc.rejectForBuilding(
      vendorId,
      dto.buildingId,
      user.id,
      dto.notes
    );
  }

  /**
   * Obtener COIs del vendor
   */
  @Get(":id/cois")
  @ApiOperation({ summary: "Obtener COIs del vendor" })
  @ApiParam({ name: "id", description: "ID del vendor" })
  @ApiQuery({ name: "buildingId", required: false })
  @ApiResponse({ status: 200, description: "Lista de COIs" })
  async getVendorCOIs(
    @CurrentUser() user: User,
    @Param("id") vendorId: string,
    @Query("buildingId") buildingId?: string
  ) {
    const vendor = await this.svc.get(vendorId);

    if (!vendor) {
      throw new NotFoundException("Vendor no encontrado");
    }

    // Vendors solo ven sus propios COIs
    if (user.role === UserRole.VENDOR) {
      if (vendor.userId !== user.id) {
        throw new ForbiddenException("Solo puede ver sus propios COIs");
      }
      return this.coisService.findByVendor(vendorId, buildingId);
    }

    // Management necesita acceso al edificio
    if (this.permissions.canManageCOIs(user)) {
      if (buildingId) {
        const hasAccess = await this.permissions.canViewBuilding(
          user,
          buildingId
        );
        if (!hasAccess) {
          throw new ForbiddenException("No tiene acceso a este edificio");
        }
      }
      return this.coisService.findByVendor(vendorId, buildingId);
    }

    throw new ForbiddenException("No tiene permiso para ver COIs del vendor");
  }

  /**
   * Obtener estadísticas del vendor
   */
  @Get(":id/stats")
  @Roles(
    UserRole.ACCOUNT_OWNER,
    UserRole.PORTFOLIO_MANAGER,
    UserRole.PROPERTY_MANAGER
  )
  @ApiOperation({ summary: "Obtener estadísticas del vendor" })
  @ApiParam({ name: "id", description: "ID del vendor" })
  @ApiResponse({ status: 200, type: VendorStatsDto })
  async getVendorStats(
    @CurrentUser() user: User,
    @Param("id") vendorId: string
  ) {
    return this.svc.getVendorStats(vendorId);
  }

  /**
   * Enviar notificación a vendor
   */
  @Post(":id/notify")
  @Roles(
    UserRole.ACCOUNT_OWNER,
    UserRole.PORTFOLIO_MANAGER,
    UserRole.PROPERTY_MANAGER
  )
  @ApiOperation({ summary: "Enviar notificación a vendor" })
  @ApiParam({ name: "id", description: "ID del vendor" })
  @ApiResponse({ status: 200, description: "Notificación enviada" })
  async notifyVendor(
    @CurrentUser() user: User,
    @Param("id") vendorId: string,
    @Body() dto: NotifyVendorDto
  ) {
    const vendor = await this.svc.get(vendorId);

    if (!vendor) {
      throw new NotFoundException("Vendor no encontrado");
    }

    // TODO: Implementar lógica de notificación
    // - Enviar email según tipo
    // - Opcionalmente enviar SMS
    // - Registrar en NotificationLog

    return { message: "Notificación enviada" };
  }
}
