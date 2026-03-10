const API_BASE = 'http://127.0.0.1:3001/api';

async function test() {
    try {
        console.log('Fetching chats...');
        const chatsRes = await fetch(`${API_BASE}/chats`);
        if (!chatsRes.ok) {
            console.error('Chats failed:', chatsRes.status, await chatsRes.text());
        } else {
            const chats = await chatsRes.json();
            console.log('Chats success:', chats.success, 'Count:', chats.chats?.length);
            if (chats.chats && chats.chats.length > 0) {
                console.log('Sample chat:', JSON.stringify(chats.chats[0], null, 2));
            }
        }

        console.log('Fetching metadata...');
        const metaRes = await fetch(`${API_BASE}/metadata`);
        if (!metaRes.ok) {
            console.error('Metadata failed:', metaRes.status, await metaRes.text());
        } else {
            const meta = await metaRes.json();
            console.log('Metadata success:', meta.success);
        }
    } catch (e) {
        console.error('Error:', e);
    }
}

test();
