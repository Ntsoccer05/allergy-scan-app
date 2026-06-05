export type SupabaseJwtPayload = {
  sub: string;
  email: string;
  role: string;
  app_metadata: {
    provider: string;
    providers: string[];
    role?: 'admin';
  };
  user_metadata: Record<string, unknown>;
  iat: number;
  exp: number;
};
