"use server"

import { getE2ETestUser, isE2ETestMode } from "@/lib/e2e-test-mode";

export const currentUser = async ()=>{
    try{
        if (isE2ETestMode()) {
            return getE2ETestUser();
        }

        const [{ auth }, { headers }, { default: db }] = await Promise.all([
            import("@/lib/auth"),
            import("next/headers"),
            import("@/lib/db"),
        ]);

        const session = await auth.api.getSession({
            headers:await headers()
        })

        if(!session?.user?.id){
            return null
        }

        const user = await db.user.findUnique({
            where:{
                id:session.user.id
            },
            select:{
                id: true,
                name: true,
                email: true,
                image: true,
                createdAt: true,
                updatedAt: true,
            }
        })

        return user;
    }catch(error){
        console.error("Error fetching current user: ", error);
        return null;
    }
}
