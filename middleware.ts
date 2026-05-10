import { withAuth } from 'next-auth/middleware';
import { NextResponse } from 'next/server';

export default withAuth(
  function middleware(req) {
    const token = req.nextauth.token as any;
    const pathname = req.nextUrl.pathname;

    // Usuário precisa definir nova senha após reset do admin
    if (token?.mustChangePassword) {
      if (!pathname.startsWith('/definir-senha')) {
        return NextResponse.redirect(new URL('/definir-senha', req.url));
      }
      return NextResponse.next();
    }

    // Bloquear acesso direto à /definir-senha se não for necessário
    if (pathname.startsWith('/definir-senha')) {
      return NextResponse.redirect(new URL('/dashboard', req.url));
    }

    if (token && !token.approved && token.role !== 'ADMIN') {
      if (!pathname.startsWith('/aguardando-aprovacao')) {
        return NextResponse.redirect(new URL('/aguardando-aprovacao', req.url));
      }
    }

    return NextResponse.next();
  },
  {
    callbacks: {
      authorized: ({ token }) => !!token,
    },
  }
);

export const config = {
  matcher: ['/dashboard/:path*', '/definir-senha'],
};
