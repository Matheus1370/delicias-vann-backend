import {
  IsArray,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Min,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

class AvaliacaoItemDto {
  @IsUUID()
  itemId: string;

  @IsNumber()
  @Min(0)
  custoComplexidade: number;

  @IsOptional()
  @IsString()
  complexidadeNotas?: string;
}

export class AvaliarComplexidadeDto {
  @IsArray()
  @IsNotEmpty()
  @ValidateNested({ each: true })
  @Type(() => AvaliacaoItemDto)
  avaliacoes: AvaliacaoItemDto[];
}
