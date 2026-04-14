import 'express-session';

declare module 'express-session' {
  interface SessionData {
    admin?: {
      id: string;
      email: string;
      full_name: string;
      role: 'super_admin' | 'content_editor' | 'moderator';
      avatar_url?: string | null;
    };
  }
}

export {};
