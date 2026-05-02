import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import db from "./db";
import { requiredEnv } from "./env";

export const auth = betterAuth({
    database: prismaAdapter(db, {
        provider: "postgresql", // or "mysql", "postgresql", ...etc
    }),
    socialProviders:{
        github:{
            clientId: requiredEnv("GITHUB_CLIENT_ID"),
            clientSecret: requiredEnv("GITHUB_CLIENT_SECRET")
        }
    }
});
