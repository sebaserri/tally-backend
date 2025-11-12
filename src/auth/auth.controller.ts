import {
  Body,
  Controller,
  Get,
  Headers,
  Ip,
  Post,
  Req,
  Res,
  UseGuards,
} from "@nestjs/common";
import { ApiOperation, ApiResponse, ApiTags } from "@nestjs/swagger";
import { Response, Request } from "express";
import { AuthService } from "./auth.service";
import {
  RegisterDto,
  LoginDto,
  AuthToken,
  ForgotPasswordDto,
  ResetPasswordDto,
  VerifyEmailDto,
  ResendVerificationDto,
} from "./dto";
import {
  ACCESS_TTL_MIN,
  CSRF_COOKIE,
  CSRF_HEADER,
  REFRESH_TTL_DAYS,
} from "./auth.constants";
import {
  setAccessCookie,
  setRefreshCookie,
  clearAuthCookies,
  setCsrfCookie,
} from "./cookie.util";
import { JwtAuthGuard } from "./jwt.guard";
import { CurrentUser, JwtUser } from "./current-user.decorator";
import { CsrfGuard } from "./csrf.guard";

@ApiTags("Auth")
@Controller("auth")
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Post("register")
  @ApiOperation({ summary: "Registro de usuario (setea cookies)" })
  async register(
    @Body() dto: RegisterDto,
    @Res({ passthrough: true }) res: Response,
    @Headers("user-agent") ua: string,
    @Ip() ip: string
  ) {
    const { at, rt, user } = await this.auth.register(dto);
    setAccessCookie(res, at, ACCESS_TTL_MIN);
    setRefreshCookie(res, rt, REFRESH_TTL_DAYS);
    setCsrfCookie(res, this.makeCsrf()); // doble submit
    return { ok: true, user: this.publicUser(user) };
  }

  @Post("login")
  @ApiOperation({ summary: "Login (setea cookies)" })
  async login(
    @Body() dto: LoginDto,
    @Res({ passthrough: true }) res: Response,
    @Headers("user-agent") ua: string,
    @Ip() ip: string
  ) {
    const { at, rt, user } = await this.auth.login(dto, ua, ip);
    setAccessCookie(res, at, ACCESS_TTL_MIN);
    setRefreshCookie(res, rt, REFRESH_TTL_DAYS);
    setCsrfCookie(res, this.makeCsrf());
    return { ok: true, user: this.publicUser(user) };
  }

  @Get("me")
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: "Perfil actual (deriva del access token)" })
  me(@CurrentUser() user: JwtUser) {
    return { ok: true, user };
  }

  @Post("refresh")
  @UseGuards(JwtAuthGuard, CsrfGuard)
  @ApiOperation({ summary: "Rotar refresh y obtener nuevo access" })
  async refresh(
    @CurrentUser() user: JwtUser,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
    @Headers("user-agent") ua: string,
    @Ip() ip: string
  ) {
    const rt = req.cookies?.["proofholder_rt"];
    if (!rt) throw new Error("Missing refresh");
    const {
      at,
      rt: newRt,
      user: full,
    } = await this.auth.refresh(user.id, rt, ua, ip);
    setAccessCookie(res, at, ACCESS_TTL_MIN);
    setRefreshCookie(res, newRt, REFRESH_TTL_DAYS);
    // CSRF se mantiene
    return { ok: true, user: this.publicUser(full) };
  }

  @Post("logout")
  @UseGuards(JwtAuthGuard, CsrfGuard)
  @ApiOperation({ summary: "Logout (revoca refresh y limpia cookies)" })
  async logout(
    @CurrentUser() user: JwtUser,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response
  ) {
    const rt = req.cookies?.["proofholder_rt"];
    if (rt) await this.auth.logout(user.id, rt);
    clearAuthCookies(res);
    // limpiar csrf (no obligatorio)
    res.clearCookie(CSRF_COOKIE);
    return { ok: true };
  }

  @Post("verify-email") verify(@Body() dto: VerifyEmailDto) {
    return this.auth.verifyEmail(dto.token);
  }
  @Post("resend-verification") resend(@Body() dto: ResendVerificationDto) {
    return this.auth.resendVerification(dto.email);
  }
  @Post("forgot-password") forgot(@Body() dto: ForgotPasswordDto) {
    return this.auth.forgotPassword(dto.email);
  }
  @Post("reset-password") reset(@Body() dto: ResetPasswordDto) {
    return this.auth.resetPassword(dto.token, dto.password);
  }

  private publicUser(u: any) {
    if (!u) return u;
    const { id, email, role, vendorId, name } = u;
    return { id, email, role, vendorId, name };
  }

  private makeCsrf() {
    return (
      Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2)
    );
  }
}
