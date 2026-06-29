import {
  IsArray,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Min,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

class ItemRascunhoDto {
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
}

export class CreateRascunhoWhatsAppDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ItemRascunhoDto)
  itens: ItemRascunhoDto[];

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  modalidadeEntrega?: string;

  @IsOptional()
  @IsString()
  dataAgendamento?: string;

  @IsOptional()
  @IsString()
  observacoes?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  numeroPessoas?: number;

  @IsOptional()
  @IsString()
  ocasiao?: string;
}
