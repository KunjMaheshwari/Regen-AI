import ChatSidebar from '@/modules/chat/components/chat-sidebar';
import Header from '@/modules/chat/components/header';
import { redirect } from 'next/navigation';
import React from 'react'
import { getE2ETestUser, isE2ETestMode } from '@/lib/e2e-test-mode';

export const dynamic = "force-dynamic";

const layout = async ({ children }) => {
    let session = null;
    let user = null;
    let chats = [];

    if (isE2ETestMode()) {
        session = { user: getE2ETestUser() };
        user = getE2ETestUser();
    } else {
        const [{ auth }, { headers }, { currentUser }, { getAllChats }] = await Promise.all([
            import('@/lib/auth'),
            import('next/headers'),
            import('@/modules/authentication/actions'),
            import('@/modules/chat/actions'),
        ]);

        session = await auth.api.getSession({
            headers: await headers()
        });

        user = await currentUser();

        const chatsResponse = await getAllChats();
        chats = chatsResponse?.data ?? [];
    }

    if (!session) {
        redirect("/sign-in");
    }

    return (
        <div className='flex h-screen overflow-hidden'>
            <ChatSidebar user={user} chats={chats}/>
            <main className='flex-1 overflow-hidden'>
                <Header />
                {children}
            </main>
        </div>
    )
}

export default layout
