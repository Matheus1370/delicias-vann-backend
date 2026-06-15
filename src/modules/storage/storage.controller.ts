import {
  BadRequestException,
  Body,
  Controller,
  NotFoundException,
  Post,
  UnprocessableEntityException,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Public } from '../../common/decorators/public.decorator';
import { StorageService } from './storage.service';
import { PrismaService } from '../../prisma/prisma.service';
import { AuthenticatedUploadKind, UPLOAD_KINDS_AUTHENTICATED } from './types';

@Controller('uploads')
@UseGuards(JwtAuthGuard, RolesGuard)
export class StorageController {
  constructor(
    private readonly storage: StorageService,
    private readonly prisma: PrismaService,
  ) {}

  @Post()
  @UseInterceptors(FileInterceptor('file'))
  async upload(
    @UploadedFile() file: Express.Multer.File,
    @Body() body: { kind: AuthenticatedUploadKind },
  ): Promise<{ url: string }> {
    if (!file) throw new BadRequestException('arquivo é obrigatório');
    if (!body?.kind || !UPLOAD_KINDS_AUTHENTICATED.includes(body.kind as any)) {
      throw new BadRequestException('kind inválido para endpoint autenticado');
    }
    return this.storage.upload(file.buffer, file.mimetype, body.kind);
  }

  @Public()
  @Post('publico/festa')
  @UseInterceptors(FileInterceptor('file'))
  async uploadFestaPublico(
    @UploadedFile() file: Express.Multer.File,
    @Body() body: { token: string },
  ): Promise<{ url: string }> {
    if (!file) throw new BadRequestException('arquivo é obrigatório');
    if (!body?.token) throw new BadRequestException('token é obrigatório');

    const pedido = await this.prisma.pedido.findUnique({
      where: { id: body.token },
      select: { id: true, status: true },
    });
    if (!pedido) throw new NotFoundException('pedido não encontrado');

    const statusOk = ['ENTREGUE'].includes(pedido.status as string);
    if (!statusOk) {
      throw new UnprocessableEntityException(`pedido em status ${pedido.status} não permite avaliação`);
    }

    return this.storage.upload(file.buffer, file.mimetype, 'festa');
  }
}
