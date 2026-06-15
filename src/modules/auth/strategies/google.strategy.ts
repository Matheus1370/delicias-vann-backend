import { Injectable, Logger } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { Strategy, VerifyCallback } from 'passport-google-oauth20';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class GoogleStrategy extends PassportStrategy(Strategy, 'google') {
  private readonly logger = new Logger(GoogleStrategy.name);

  constructor(private config: ConfigService) {
    const clientID = config.get('GOOGLE_CLIENT_ID', '');
    const clientSecret = config.get('GOOGLE_CLIENT_SECRET', '');

    super({
      clientID: clientID || 'not-configured',
      clientSecret: clientSecret || 'not-configured',
      callbackURL: config.get('GOOGLE_CALLBACK_URL', 'http://localhost:3000/api/v1/auth/google/callback'),
      scope: ['email', 'profile'],
    });

    if (!clientID || !clientSecret || clientID === 'seu_google_client_id') {
      this.logger.warn('Google OAuth não configurado — login com Google desabilitado');
    }
  }

  async validate(
    accessToken: string,
    refreshToken: string,
    profile: any,
    done: VerifyCallback,
  ) {
    const { name, emails, photos } = profile;
    const user = {
      email: emails[0].value,
      nome: `${name.givenName} ${name.familyName}`,
      foto: photos?.[0]?.value,
      googleId: profile.id,
    };
    done(null, user);
  }
}
