import { IsNotEmpty, IsOptional, IsString, IsUrl } from 'class-validator';

export class FotoProntoDto {
  @IsUrl()
  @IsNotEmpty()
  url: string;

  @IsOptional()
  @IsString()
  legenda?: string;
}
