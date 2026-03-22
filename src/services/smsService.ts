export const sendSMS = async (to: string, message: string) => {
    const userId = '25286';
    const apiKey = 'qXVxKpKoh25IKJEDAmaC';
    const senderId = 'Clazz.lk';

    // Format the phone number (remove +, remove spaces, ensure it starts with country code, e.g., 94)
    // Standard notify.lk expects number in format like 9477...
    let formattedNumber = to.replace(/[\s\-\(\)\+]/g, '');
    if (formattedNumber.startsWith('0')) {
        formattedNumber = '94' + formattedNumber.substring(1);
    }

    try {
        const response = await fetch('https://app.notify.lk/api/v1/send', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                user_id: userId,
                api_key: apiKey,
                sender_id: senderId,
                to: formattedNumber,
                message: message
            })
        });

        const data = await response.json();
        return data;
    } catch (error) {
        console.error('Failed to send SMS via Notify.lk:', error);
        throw error;
    }
};
