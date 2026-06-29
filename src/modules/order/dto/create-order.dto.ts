import {
  IsArray,
  IsBoolean,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  IsUrl,
  Min,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

class ItemPedidoDto {
  @IsUUID()
  produtoId: string;

  @IsInt()
  @Min(1)
  quantidade: number;

  @IsOptional()
  @IsNumber()
  @Min(1)
  pesoKg?: number;

  @IsOptional()
  opcoesEscolhidas?: Record<string, string>;

  @IsOptional()
  @IsString()
  personalizacao?: string;

  @IsOptional()
  @IsArray()
  @IsUrl({}, { each: true })
  imagensReferencia?: string[];
}

export class CreateOrderDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ItemPedidoDto)
  itens: ItemPedidoDto[];

  @IsString()
  @IsNotEmpty()
  modalidadeEntrega: string;

  @IsOptional()
  @IsUUID()
  slotId?: string;

  @IsOptional()
  @IsUUID()
  enderecoEntregaId?: string;

  @IsOptional()
  @IsString()
  dataAgendamento?: string;

  @IsOptional()
  @IsString()
  observacoes?: string;

  @IsOptional()
  @IsString()
  cupomCodigo?: string;

  @IsOptional()
  @IsEnum(['ONLINE', 'WHATSAPP', 'ASSINATURA', 'BALCAO'])
  origem?: 'ONLINE' | 'WHATSAPP' | 'ASSINATURA' | 'BALCAO';

  @IsOptional()
  @IsUUID()
  assinaturaId?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  numeroPessoas?: number;

  @IsOptional()
  @IsString()
  ocasiao?: string;

  @IsOptional()
  @IsString()
  horaFestaPrevista?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  bufferHorasAntes?: number;

  @IsOptional()
  @IsBoolean()
  usarCredito?: boolean;

  @IsOptional()
  @IsString()
  utmSource?: string;

  @IsOptional()
  @IsString()
  utmMedium?: string;

  @IsOptional()
  @IsString()
  utmCampaign?: string;

  @IsOptional()
  @IsString()
  utmContent?: string;

  @IsOptional()
  @IsEnum(['PIX', 'CARTAO'])
  metodoPagamento?: 'PIX' | 'CARTAO';

  @IsOptional()
  @IsInt()
  @Min(1)
  parcelas?: number;
}
