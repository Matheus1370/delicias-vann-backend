import {
  Controller,
  Get,
  Patch,
  Post,
  Delete,
  Param,
  Body,
  Request,
  UseGuards,
} from '@nestjs/common';
import { UserService } from './user.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';

@Controller('users')
@UseGuards(JwtAuthGuard)
export class UserController {
  constructor(private userService: UserService) {}

  @Get('me')
  me(@Request() req: any) {
    return this.userService.me(req.user.sub);
  }

  @Patch('me')
  updateMe(@Body() body: any, @Request() req: any) {
    return this.userService.update(req.user.sub, body);
  }

  @Post('me/anonimizar')
  anonimizar(@Request() req: any) {
    return this.userService.anonimizar(req.user.sub);
  }

  @Post('me/enderecos')
  addEndereco(@Body() body: any, @Request() req: any) {
    return this.userService.addEndereco(req.user.sub, body);
  }

  @Delete('me/enderecos/:id')
  removerEndereco(@Param('id') id: string, @Request() req: any) {
    return this.userService.removerEndereco(req.user.sub, id);
  }
}
