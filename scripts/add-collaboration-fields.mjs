// scripts/add-collaboration-fields.mjs
import { readFileSync } from 'fs';
import { resolve } from 'path';

// Load .env.local manually (dotenv not installed as a dep)
const envPath = resolve(process.cwd(), '.env.local');
const envText = readFileSync(envPath, 'utf-8');
for (const line of envText.split('\n')) {
  const match = line.match(/^([^#=]+)=(.*)$/);
  if (match) process.env[match[1].trim()] = match[2].trim();
}

const BASE_ID = 'app5FPCG06huzh7hX';
const POSTS_TABLE_ID = 'tblyUEPOJXxpQDZNL';
const PAT = process.env.AIRTABLE_API_KEY;

const fields = [
  { name: 'Collaborators', type: 'multilineText', description: 'JSON array of Instagram usernames for collab invites (max 3)' },
  { name: 'User Tags', type: 'multilineText', description: 'JSON array of Instagram usernames to tag on image (center-positioned)' },
];

for (const field of fields) {
  const res = await fetch(
    `https://api.airtable.com/v0/meta/bases/${BASE_ID}/tables/${POSTS_TABLE_ID}/fields`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${PAT}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(field),
    }
  );
  const data = await res.json();
  if (res.ok) {
    console.log(`Created field "${field.name}": ${data.id}`);
  } else {
    console.error(`Failed to create "${field.name}":`, data.error);
  }
}
