import { IsEnum, IsOptional, IsString } from 'class-validator';

const STATUS_VALIDOS = [
  'PAGO',
  'EM_PRODUCAO',
  'PRONTO',
  'EM_ENTREGA',
  'ENTREGUE',
  'CANCELADO',
  'ATRASADO',
  'FALHA_ENTREGA',
] as const;

export class UpdateStatusDto {
  @IsEnum(STATUS_VALIDOS)
  status: (typeof STATUS_VALIDOS)[number];

  @IsOptional()
  @IsString()
  motivo?: string;
}
