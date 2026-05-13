import { Controller, Get, Post, Put, Patch, Delete, Body, Param, Query, UseGuards, Request } from '@nestjs/common';
import { CatalogService } from './catalog.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { Public } from '../../common/decorators/public.decorator';

@Controller('catalog')
@UseGuards(JwtAuthGuard, RolesGuard)
export class CatalogController {
  constructor(private catalogService: CatalogService) {}

  @Public()
  @Get('products')
  findAll(@Query() query: { categoria?: string; tipo?: string; disponivel?: string }) {
    return this.catalogService.findAllPublic(query);
  }

  @Public()
  @Get('products/:slug')
  findOne(@Param('slug') slug: string) {
    return this.catalogService.findBySlug(slug);
  }

  @Public()
  @Get('categories')
  categories() {
    return this.catalogService.findCategories();
  }

  @Public()
  @Get('upsell')
  upsell() {
    return this.catalogService.findUpsellItems();
  }

  @Public()
  @Get('adicionais')
  adicionais(@Query('numeroPessoas') numeroPessoas?: string) {
    const n = numeroPessoas ? parseInt(numeroPessoas, 10) : undefined;
    return this.catalogService.findAdicionais(Number.isFinite(n) ? n : undefined);
  }

  @Public()
  @Post('lead-time')
  calcularLeadTime(
    @Body() body: { produtoId: string; opcoesEscolhidas?: Record<string, string> },
  ) {
    return this.catalogService.calcularLeadTime(body.produtoId, body.opcoesEscolhidas ?? {});
  }

  @Roles('GERENTE', 'ADMINISTRADOR')
  @Post('products')
  create(@Body() body: any, @Request() req: any) {
    return this.catalogService.create(body, req.user.sub);
  }

  @Roles('GERENTE', 'ADMINISTRADOR')
  @Put('products/:id')
  update(@Param('id') id: string, @Body() body: any, @Request() req: any) {
    return this.catalogService.update(id, body, req.user.sub);
  }

  @Roles('GERENTE', 'ADMINISTRADOR')
  @Post('products/:id/approve-margin')
  approveMargin(@Param('id') id: string, @Body() body: { justificativa: string }, @Request() req: any) {
    return this.catalogService.approveMargin(id, body.justificativa, req.user.sub);
  }

  @Public()
  @Get('products/:id/fotos')
  listarFotos(@Param('id') id: string) {
    return this.catalogService.listarFotos(id);
  }

  @Roles('GERENTE', 'ADMINISTRADOR')
  @Post('products/:id/fotos')
  adicionarFoto(
    @Param('id') id: string,
    @Body() body: { url: string; tipo?: 'PRINCIPAL' | 'CORTADO' | 'DETALHE'; ordem?: number },
  ) {
    return this.catalogService.adicionarFoto(id, body);
  }

  @Roles('GERENTE', 'ADMINISTRADOR')
  @Patch('fotos/:fotoId')
  atualizarFoto(
    @Param('fotoId') fotoId: string,
    @Body() body: Partial<{ url: string; tipo: 'PRINCIPAL' | 'CORTADO' | 'DETALHE'; ordem: number }>,
  ) {
    return this.catalogService.atualizarFoto(fotoId, body);
  }

  @Roles('GERENTE', 'ADMINISTRADOR')
  @Delete('fotos/:fotoId')
  async removerFoto(@Param('fotoId') fotoId: string) {
    await this.catalogService.removerFoto(fotoId);
    return { ok: true };
  }
}
