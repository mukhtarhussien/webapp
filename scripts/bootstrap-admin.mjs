import crypto from 'node:crypto'
import { neon } from '@neondatabase/serverless'

const url=process.env.DATABASE_URL
const email=(process.env.ADMIN_EMAIL||'').trim().toLowerCase()
const password=process.env.ADMIN_PASSWORD||''
if(!url||!email||!password) throw new Error('DATABASE_URL, ADMIN_EMAIL and ADMIN_PASSWORD are required')
const hashPassword=(value)=>{const salt=crypto.randomBytes(16).toString('hex');const hash=crypto.scryptSync(value,salt,64).toString('hex');return `${salt}:${hash}`}
const sql=neon(url)
const hash=hashPassword(password)
await sql`insert into users (email,password_hash,full_name_ar,full_name_en,role,is_active) values (${email},${hash},${'مدير النظام'},${'System Administrator'},'admin',true) on conflict (email) do update set password_hash=excluded.password_hash, role='admin', is_active=true, updated_at=now()`
console.log(`Admin account ready: ${email}`)
