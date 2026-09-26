import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { verifyCredentials } from "@/lib/credentials";
import {
  createSession,
  isLegacyTokenRevoked,
  isSessionActive,
  revokeSession,
} from "@/lib/sessions";

export const { handlers, auth, signIn, signOut } = NextAuth({
  session: { strategy: "jwt" },
  pages: {
    signIn: "/signin",
  },
  providers: [
    Credentials({
      credentials: {
        email: {},
        password: {},
      },
      async authorize(credentials) {
        const email =
          typeof credentials?.email === "string" ? credentials.email : null;
        const password =
          typeof credentials?.password === "string"
            ? credentials.password
            : null;

        if (!email || !password) {
          return null;
        }

        const user = await verifyCredentials(email, password);

        if (!user) {
          return null;
        }

        return { id: user.id, email: user.email, name: user.name };
      },
    }),
  ],
  events: {
    async signOut(message) {
      if ("token" in message && message.token) {
        const { sub, sid } = message.token;

        if (sub && typeof sid === "string") {
          await revokeSession(sub, sid);
        }
      }
    },
  },
  callbacks: {
    async jwt({ token, user }) {
      if (user?.id) {
        token.sub = user.id;
        const session = await createSession({ userId: user.id, kind: "web" });
        token.sid = session.id;
        return token;
      }

      if (!token.sub) {
        return token;
      }

      const active =
        typeof token.sid === "string"
          ? await isSessionActive(token.sid, token.sub)
          : !(await isLegacyTokenRevoked(token.sub, token.iat));

      return active ? token : null;
    },
    async session({ session, token }) {
      if (session.user && token.sub) {
        session.user.id = token.sub;
      }
      if (session.user && typeof token.sid === "string") {
        session.user.sessionId = token.sid;
      }
      return session;
    },
  },
});
