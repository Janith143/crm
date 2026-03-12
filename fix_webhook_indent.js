import { readFileSync, writeFileSync } from 'fs';

const content = readFileSync('./server.js', 'utf8');
const lines = content.split('\n');

// Find the line that starts with "    } else if (body.entry" and contains "statuses"
const targetIdx = lines.findIndex((l, i) =>
    i > 2200 &&
    l.trimStart().startsWith('} else if (body.entry') &&
    l.includes('statuses')
);

if (targetIdx === -1) {
    console.log('Target line not found');
    process.exit(1);
}

console.log(`Found target at line ${targetIdx + 1}: "${lines[targetIdx]}"`);

// Fix indentation: should be 8 spaces (inside if(body.object))
const fixedBlock = [
    '        } else if (body.entry && body.entry[0].changes && body.entry[0].changes[0] && body.entry[0].changes[0].value.statuses && body.entry[0].changes[0].value.statuses[0]) {',
    '            // Handle Message Status updates (ack)',
    '            const statusObj = body.entry[0].changes[0].value.statuses[0];',
    '            const msgId = statusObj.id;',
    "            const status = statusObj.status; // 'sent', 'delivered', 'read'",
    '            const ack = status === \'read\' ? 3 : (status === \'delivered\' ? 2 : 1);',
    '',
    '            try {',
    "                await pool.query('UPDATE messages SET ack = ?, status = ? WHERE id = ?', [ack, status, msgId]);",
    "                io.emit('message_update', { id: msgId, status: status, ack: ack });",
    '            } catch (err) {',
    '                console.error("Failed to update status on webhook", err);',
    '            }',
    '        }',
    '',
    '        res.sendStatus(200);',
    '    } else {',
    '        res.sendStatus(404);',
    '    }',
    '});'
];

// Find end of this block (should be around }) 
let endIdx = targetIdx;
while (endIdx < lines.length && !lines[endIdx].trim().startsWith('});')) {
    endIdx++;
}

console.log(`Replacing lines ${targetIdx + 1} to ${endIdx + 1}`);
lines.splice(targetIdx, endIdx - targetIdx + 1, ...fixedBlock);
writeFileSync('./server.js', lines.join('\n'), 'utf8');
console.log('Done!');
